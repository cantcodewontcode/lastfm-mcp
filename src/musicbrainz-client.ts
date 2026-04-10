/**
 * MusicBrainz fallback for track durations when Last.fm returns 0.
 * MB requires a User-Agent identifying the application, and recommends
 * no more than 1 request/second. We serialize calls with a small delay.
 */
import type { MBRelease } from "./types.js";

const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_UA   = "lastfm-mcp/1.0 (https://github.com/cantcodewontcode/lastfm-mcp)";

async function mbGet(path: string): Promise<unknown> {
  const url = `${MB_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": MB_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}: ${url}`);
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Search for a release by artist + album name.
 * Returns the best-matching release ID, or null if not found.
 */
async function findReleaseId(artist: string, album: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await mbGet(
    `/release?query=artist:"${encodeURIComponent(artist)}" AND release:"${encodeURIComponent(album)}"&limit=5&fmt=json`
  )) as any;
  const releases = data?.releases ?? [];
  if (releases.length === 0) return null;
  // Prefer the release with the highest score
  return String(releases[0].id);
}

/**
 * Fetch track durations from a MusicBrainz release.
 * Returns a map of { trackIndex (0-based) → duration in seconds }.
 * Merges all disc media into a single flat track list.
 */
async function getReleaseDurations(releaseId: string): Promise<Map<number, number>> {
  await sleep(1100); // respect MB rate limit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await mbGet(`/release/${releaseId}?inc=recordings&fmt=json`)) as any;
  const release = data as MBRelease;
  const durations = new Map<number, number>();

  let flatIndex = 0;
  for (const medium of release.media ?? []) {
    for (const track of medium.tracks ?? []) {
      const ms = track.length ?? track.recording?.length ?? null;
      if (ms && ms > 0) {
        durations.set(flatIndex, Math.round(ms / 1000));
      }
      flatIndex++;
    }
  }
  return durations;
}

/**
 * Attempt to fill in missing track durations from MusicBrainz.
 * Only makes network requests if at least one track has duration === 0.
 * Returns the original array with durations patched where possible.
 */
export async function fillMissingDurations(
  artist: string,
  album: string,
  tracks: Array<{ name: string; duration: number }>
): Promise<Array<{ name: string; duration: number }>> {
  const needsFill = tracks.some((t) => t.duration === 0);
  if (!needsFill) return tracks;

  let releaseId: string | null = null;
  try {
    releaseId = await findReleaseId(artist, album);
  } catch (e) {
    console.error("MusicBrainz search failed:", e);
    return tracks;
  }

  if (!releaseId) return tracks;

  let durations: Map<number, number>;
  try {
    durations = await getReleaseDurations(releaseId);
  } catch (e) {
    console.error("MusicBrainz release fetch failed:", e);
    return tracks;
  }

  return tracks.map((t, i) => ({
    ...t,
    duration: t.duration > 0 ? t.duration : (durations.get(i) ?? 0),
  }));
}
