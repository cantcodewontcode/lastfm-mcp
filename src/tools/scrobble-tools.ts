import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { scrobbleBatch, updateNowPlaying, getAlbumInfo, DEFAULT_FALLBACK_DURATION } from "../lastfm-client.js";
import { fillMissingDurations } from "../musicbrainz-client.js";
import type { ScrobbleTrack } from "../types.js";

const BATCH_SIZE = 50;

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseTimestamp(val: string | number | undefined): number {
  if (val === undefined || val === null) return Math.floor(Date.now() / 1000);
  if (typeof val === "number") return Math.floor(val);
  const ms = Date.parse(val);
  if (isNaN(ms)) throw new Error(`Cannot parse timestamp: "${val}". Use ISO 8601 or Unix seconds.`);
  return Math.floor(ms / 1000);
}

export function registerScrobbleTools(server: McpServer): void {

  server.registerTool(
    "lastfm_scrobble",
    {
      title: "Scrobble a Track",
      description: `Record a single track play on Last.fm.

The timestamp is when the track STARTED playing — defaults to now if omitted.
Last.fm rejects scrobbles older than 14 days.

Args:
  - artist, track: required
  - album, album_artist, track_number, duration: optional metadata
  - timestamp: when playback started — ISO 8601 or Unix seconds, defaults to now`,
      inputSchema: z.object({
        artist:       z.string().min(1),
        track:        z.string().min(1),
        album:        z.string().optional(),
        album_artist: z.string().optional(),
        track_number: z.number().int().positive().optional(),
        duration:     z.number().int().positive().optional(),
        timestamp:    z.union([z.string(), z.number()]).optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ artist, track, album, album_artist, track_number, duration, timestamp }) => {
      const config = loadConfig();
      const ts = parseTimestamp(timestamp);
      const t: ScrobbleTrack = {
        artist, track, timestamp: ts,
        ...(album        && { album }),
        ...(album_artist && { albumArtist: album_artist }),
        ...(track_number && { trackNumber: track_number }),
        ...(duration     && { duration }),
      };
      const { accepted, ignored } = await scrobbleBatch([t], config);
      if (ignored > 0) return { content: [{ type: "text", text: `⚠️ Scrobble ignored by Last.fm. Track may be too short, or timestamp is older than 14 days.` }] };
      return { content: [{ type: "text", text: `✓ Scrobbled: "${track}" by ${artist}${album ? ` (${album})` : ""}\nTimestamp: ${new Date(ts * 1000).toISOString()}` }] };
    }
  );

  server.registerTool(
    "lastfm_scrobble_album",
    {
      title: "Scrobble an Album",
      description: `Scrobble a full album as if you just finished listening to it straight through.

Looks up the tracklist and per-track durations from Last.fm (with MusicBrainz as a fallback),
calculates the correct start timestamp for every track working backwards from finished_at,
then submits all scrobbles in one batch.

Tracks with completely unknown durations use a ${DEFAULT_FALLBACK_DURATION}s (~3:30) fallback.
Last.fm rejects scrobbles older than 14 days.

Args:
  - artist: e.g. "The Beatles"
  - album: e.g. "Abbey Road"
  - finished_at: when you finished listening — ISO 8601 or Unix seconds, defaults to right now`,
      inputSchema: z.object({
        artist:      z.string().min(1),
        album:       z.string().min(1),
        finished_at: z.union([z.string(), z.number()]).optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ artist, album, finished_at }) => {
      const config = loadConfig();
      let endTime: number;
      try { endTime = parseTimestamp(finished_at); }
      catch (err) { return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] }; }

      let albumInfo;
      try { albumInfo = await getAlbumInfo(artist, album, config.api_key); }
      catch (err) {
        return { content: [{ type: "text", text: `Couldn't find that album: ${err instanceof Error ? err.message : String(err)}\n\nTry adjusting the artist or album name.` }] };
      }

      if (albumInfo.tracks.length === 0)
        return { content: [{ type: "text", text: `Last.fm has no track listing for "${albumInfo.name}" by ${albumInfo.artist}.` }] };

      let tracks = albumInfo.tracks.map(t => ({ name: t.name, duration: t.duration, rank: t.rank, artist: t.artist, mbid: t.mbid }));
      try { tracks = await fillMissingDurations(albumInfo.artist, albumInfo.name, tracks) as typeof tracks; } catch { /* non-fatal */ }

      const fallbackTracks: string[] = [];
      const resolved = tracks.map(t => {
        if (t.duration > 0) return t;
        fallbackTracks.push(t.name);
        return { ...t, duration: DEFAULT_FALLBACK_DURATION };
      });

      let cursor = endTime;
      const scrobbles: ScrobbleTrack[] = [];
      for (let i = resolved.length - 1; i >= 0; i--) {
        const t = resolved[i];
        cursor -= t.duration;
        scrobbles.unshift({ artist: t.artist ?? albumInfo.artist, track: t.name, timestamp: cursor, album: albumInfo.name, albumArtist: albumInfo.artist, trackNumber: t.rank, duration: t.duration, ...(t.mbid ? { mbid: t.mbid } : {}) });
      }

      let totalAccepted = 0, totalIgnored = 0;
      for (const batch of chunks(scrobbles, BATCH_SIZE)) {
        const { accepted, ignored } = await scrobbleBatch(batch, config);
        totalAccepted += accepted; totalIgnored += ignored;
      }

      const totalMins = Math.round(resolved.reduce((s, t) => s + t.duration, 0) / 60);
      const trackList = scrobbles.map((s, i) => `  ${String(i + 1).padStart(2)}. ${s.track} (${new Date(s.timestamp * 1000).toISOString().slice(11, 19)})`).join("\n");

      let out = `✓ Scrobbled "${albumInfo.name}" by ${albumInfo.artist}\n`;
      out += `  ${totalAccepted} accepted, ${totalIgnored} ignored  •  ~${totalMins} min  •  ended ${new Date(endTime * 1000).toISOString()}\n\n${trackList}`;
      if (fallbackTracks.length > 0) out += `\n\n⚠️  Used ${DEFAULT_FALLBACK_DURATION}s duration fallback for:\n` + fallbackTracks.map(n => `   • ${n}`).join("\n");
      if (totalIgnored > 0) out += `\n\n⚠️  ${totalIgnored} track(s) ignored — timestamps may exceed Last.fm's 14-day limit.`;

      return { content: [{ type: "text", text: out }] };
    }
  );

  server.registerTool(
    "lastfm_update_now_playing",
    {
      title: "Update Now Playing",
      description: "Notify Last.fm that you're currently listening to a track. Does not scrobble — just updates your profile's now-playing indicator.",
      inputSchema: z.object({
        artist:   z.string().min(1),
        track:    z.string().min(1),
        album:    z.string().optional(),
        duration: z.number().int().positive().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ artist, track, album, duration }) => {
      const config = loadConfig();
      await updateNowPlaying({ artist, track, album, duration }, config);
      return { content: [{ type: "text", text: `Now playing: "${track}" by ${artist}` }] };
    }
  );
}
