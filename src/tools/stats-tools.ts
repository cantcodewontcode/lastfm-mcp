import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { getRecentTracks, getUserInfo, getTopTracks, getTopArtists, getTopAlbums, searchTrack } from "../lastfm-client.js";

const PeriodSchema = z.enum(["overall", "7day", "1month", "3month", "6month", "12month"]).default("overall");

export function registerStatsTools(server: McpServer): void {

  server.registerTool(
    "lastfm_get_recent_scrobbles",
    {
      title: "Get Recent Scrobbles",
      description: "Fetch your recent listening history from Last.fm. Supports date range filtering.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().default(50),
        page:  z.number().int().min(1).optional().default(1),
        from:  z.union([z.string(), z.number()]).optional().describe("Start of range — ISO 8601 or Unix seconds"),
        to:    z.union([z.string(), z.number()]).optional().describe("End of range — ISO 8601 or Unix seconds"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ limit, page, from, to }) => {
      const config = loadConfig();
      const toUnix = (v: string | number | undefined) => {
        if (v === undefined) return undefined;
        if (typeof v === "number") return v;
        const ms = Date.parse(v); if (isNaN(ms)) throw new Error(`Bad timestamp: "${v}"`);
        return Math.floor(ms / 1000);
      };
      const { tracks, total } = await getRecentTracks(config.username, config.api_key, { limit, page, from: toUnix(from), to: toUnix(to) });
      if (!tracks.length) return { content: [{ type: "text", text: "No scrobbles found." }] };
      const lines = tracks.map(t => {
        const time = t.nowPlaying ? "▶ now" : new Date(t.timestamp * 1000).toISOString().slice(0, 19).replace("T", " ");
        return `  ${time}  ${t.artist} — ${t.track}${t.album ? ` [${t.album}]` : ""}`;
      });
      return { content: [{ type: "text", text: `Recent scrobbles for ${config.username} (page ${page} of ${Math.ceil(total / limit!)}):\n` + lines.join("\n") }] };
    }
  );

  server.registerTool(
    "lastfm_get_user_info",
    {
      title: "Get User Info",
      description: "Get your Last.fm profile stats — total scrobbles, artists, albums, tracks, country, and join date.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      const config = loadConfig();
      const u = await getUserInfo(config.username, config.api_key);
      return { content: [{ type: "text", text:
        `${u.username}${u.realname ? ` (${u.realname})` : ""}\n` +
        `Scrobbles: ${u.playcount.toLocaleString()}  Artists: ${u.artistCount.toLocaleString()}  Albums: ${u.albumCount.toLocaleString()}  Tracks: ${u.trackCount.toLocaleString()}\n` +
        `Country: ${u.country || "not set"}  •  Member since: ${new Date(u.registered * 1000).toISOString().slice(0, 10)}\n${u.url}`
      }] };
    }
  );

  server.registerTool(
    "lastfm_get_top_tracks",
    {
      title: "Get Top Tracks",
      description: "Get your most-played tracks on Last.fm. Period options: overall, 7day, 1month, 3month, 6month, 12month.",
      inputSchema: z.object({ period: PeriodSchema, limit: z.number().int().min(1).max(200).optional().default(25) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ period, limit }) => {
      const config = loadConfig();
      const tracks = await getTopTracks(config.username, config.api_key, period, limit);
      if (!tracks.length) return { content: [{ type: "text", text: "No top tracks found." }] };
      return { content: [{ type: "text", text: `Top tracks (${period}):\n` + tracks.map(t => `  ${String(t.rank).padStart(3)}. ${t.artist} — ${t.track}  (${t.playcount})`).join("\n") }] };
    }
  );

  server.registerTool(
    "lastfm_get_top_artists",
    {
      title: "Get Top Artists",
      description: "Get your most-played artists on Last.fm. Period options: overall, 7day, 1month, 3month, 6month, 12month.",
      inputSchema: z.object({ period: PeriodSchema, limit: z.number().int().min(1).max(200).optional().default(25) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ period, limit }) => {
      const config = loadConfig();
      const artists = await getTopArtists(config.username, config.api_key, period, limit);
      if (!artists.length) return { content: [{ type: "text", text: "No top artists found." }] };
      return { content: [{ type: "text", text: `Top artists (${period}):\n` + artists.map(a => `  ${String(a.rank).padStart(3)}. ${a.name}  (${a.playcount})`).join("\n") }] };
    }
  );

  server.registerTool(
    "lastfm_get_top_albums",
    {
      title: "Get Top Albums",
      description: "Get your most-played albums on Last.fm. Period options: overall, 7day, 1month, 3month, 6month, 12month.",
      inputSchema: z.object({ period: PeriodSchema, limit: z.number().int().min(1).max(200).optional().default(25) }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ period, limit }) => {
      const config = loadConfig();
      const albums = await getTopAlbums(config.username, config.api_key, period, limit);
      if (!albums.length) return { content: [{ type: "text", text: "No top albums found." }] };
      return { content: [{ type: "text", text: `Top albums (${period}):\n` + albums.map(a => `  ${String(a.rank).padStart(3)}. ${a.artist} — ${a.album}  (${a.playcount})`).join("\n") }] };
    }
  );

  server.registerTool(
    "lastfm_search_track",
    {
      title: "Search for a Track",
      description: "Search the Last.fm catalogue for a track by name. Useful to verify correct metadata before scrobbling.",
      inputSchema: z.object({
        track:  z.string().min(1),
        artist: z.string().optional(),
        limit:  z.number().int().min(1).max(30).optional().default(10),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ track, artist, limit }) => {
      const config = loadConfig();
      const results = await searchTrack(track, artist, config.api_key, limit);
      if (!results.length) return { content: [{ type: "text", text: `No results for "${track}"${artist ? ` by ${artist}` : ""}.` }] };
      return { content: [{ type: "text", text: `Results:\n` + results.map((r, i) => `  ${i + 1}. "${r.track}" by ${r.artist}  (${r.listeners.toLocaleString()} listeners)\n     ${r.url}`).join("\n") }] };
    }
  );
}
