import { createHash } from "crypto";
import type {
  LastfmConfig, ScrobbleTrack, AlbumInfo, AlbumTrack,
  RecentTrack, LovedTrack, TopTrack, TopArtist, TopAlbum,
  UserInfo, TrackSearchResult, LastfmError,
} from "./types.js";

const API_BASE = "https://ws.audioscrobbler.com/2.0/";
export const DEFAULT_FALLBACK_DURATION = 210;

// ─── Crypto ───────────────────────────────────────────────────────────────────

export function md5(input: string): string {
  return createHash("md5").update(input, "utf-8").digest("hex");
}

function buildSignature(params: Record<string, string>, apiSecret: string): string {
  const sortedKeys = Object.keys(params).filter((k) => k !== "format").sort();
  const str = sortedKeys.map((k) => `${k}${params[k]}`).join("") + apiSecret;
  return md5(str);
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function isLastfmError(obj: unknown): obj is LastfmError {
  return typeof obj === "object" && obj !== null && "error" in obj;
}

async function doFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": "lastfm-mcp/1.0", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  if (isLastfmError(data)) throw new Error(`Last.fm error ${data.error}: ${data.message}`);
  return data;
}

export async function apiGet(method: string, params: Record<string, string>, apiKey: string): Promise<unknown> {
  const url = new URL(API_BASE);
  url.searchParams.set("method", method);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return doFetch(url.toString());
}

async function apiPost(method: string, params: Record<string, string>, config: LastfmConfig): Promise<unknown> {
  const all: Record<string, string> = { ...params, method, api_key: config.api_key, sk: config.session_key };
  all.api_sig = buildSignature(all, config.api_secret);
  all.format = "json";
  return doFetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(all).toString(),
  });
}

/** Signed POST with no session key — auth methods only */
async function apiPostAuth(params: Record<string, string>, apiKey: string, apiSecret: string): Promise<unknown> {
  const all: Record<string, string> = { ...params, api_key: apiKey };
  all.api_sig = buildSignature(all, apiSecret);
  all.format = "json";
  return doFetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(all).toString(),
  });
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

export async function getRequestToken(apiKey: string, apiSecret: string): Promise<{ token: string; authUrl: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiPostAuth({ method: "auth.getToken" }, apiKey, apiSecret)) as any;
  const token = String(data.token);
  return { token, authUrl: `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${token}` };
}

export async function getSession(token: string, apiKey: string, apiSecret: string): Promise<{ sessionKey: string; username: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiPostAuth({ method: "auth.getSession", token }, apiKey, apiSecret)) as any;
  return { sessionKey: String(data.session.key), username: String(data.session.name) };
}

// ─── Album ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTrack(t: any, index: number): AlbumTrack {
  return {
    name:     String(t.name ?? ""),
    duration: parseInt(String(t.duration ?? "0"), 10) || 0,
    rank:     parseInt(String(t["@attr"]?.rank ?? String(index + 1)), 10),
    artist:   t.artist?.name,
    mbid:     t.mbid || undefined,
  };
}

export async function getAlbumInfo(artist: string, album: string, apiKey: string): Promise<AlbumInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("album.getInfo", { artist, album, autocorrect: "1" }, apiKey)) as any;
  const a = data.album;
  if (!a) throw new Error(`Album not found: "${album}" by "${artist}"`);
  const rawTracks = a.tracks?.track;
  let tracks: AlbumTrack[] = [];
  if (Array.isArray(rawTracks)) tracks = rawTracks.map((t, i) => parseTrack(t, i));
  else if (rawTracks) tracks = [parseTrack(rawTracks, 0)];
  return { name: String(a.name), artist: String(a.artist), mbid: a.mbid || undefined, url: a.url, tracks };
}

// ─── Scrobble ─────────────────────────────────────────────────────────────────

export async function scrobbleBatch(tracks: ScrobbleTrack[], config: LastfmConfig): Promise<{ accepted: number; ignored: number }> {
  if (tracks.length === 0) return { accepted: 0, ignored: 0 };
  if (tracks.length > 50) throw new Error("Max 50 tracks per batch");
  const params: Record<string, string> = {};
  tracks.forEach((t, i) => {
    params[`artist[${i}]`]    = t.artist;
    params[`track[${i}]`]     = t.track;
    params[`timestamp[${i}]`] = String(t.timestamp);
    if (t.album)       params[`album[${i}]`]       = t.album;
    if (t.albumArtist) params[`albumArtist[${i}]`] = t.albumArtist;
    if (t.trackNumber) params[`trackNumber[${i}]`] = String(t.trackNumber);
    if (t.duration)    params[`duration[${i}]`]    = String(t.duration);
    if (t.mbid)        params[`mbid[${i}]`]        = t.mbid;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiPost("track.scrobble", params, config)) as any;
  const attr = data?.scrobbles?.["@attr"];
  return { accepted: parseInt(String(attr?.accepted ?? "0"), 10), ignored: parseInt(String(attr?.ignored ?? "0"), 10) };
}

export async function updateNowPlaying(track: Omit<ScrobbleTrack, "timestamp">, config: LastfmConfig): Promise<void> {
  const p: Record<string, string> = { artist: track.artist, track: track.track };
  if (track.album)       p.album       = track.album;
  if (track.albumArtist) p.albumArtist = track.albumArtist;
  if (track.trackNumber) p.trackNumber = String(track.trackNumber);
  if (track.duration)    p.duration    = String(track.duration);
  await apiPost("track.updateNowPlaying", p, config);
}

export async function loveTrack(artist: string, track: string, config: LastfmConfig): Promise<void> {
  await apiPost("track.love", { artist, track }, config);
}
export async function unloveTrack(artist: string, track: string, config: LastfmConfig): Promise<void> {
  await apiPost("track.unlove", { artist, track }, config);
}

// ─── User data ────────────────────────────────────────────────────────────────

export async function getRecentTracks(username: string, apiKey: string, opts: { limit?: number; page?: number; from?: number; to?: number } = {}): Promise<{ tracks: RecentTrack[]; total: number }> {
  const p: Record<string, string> = { user: username, limit: String(opts.limit ?? 50), page: String(opts.page ?? 1), extended: "0" };
  if (opts.from) p.from = String(opts.from);
  if (opts.to)   p.to   = String(opts.to);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("user.getRecentTracks", p, apiKey)) as any;
  const raw = data.recenttracks;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(raw.track) ? raw.track : raw.track ? [raw.track] : [];
  return {
    tracks: items.map((t) => ({
      artist: String(t.artist?.["#text"] ?? t.artist ?? ""), track: String(t.name ?? ""),
      album: String(t.album?.["#text"] ?? ""),
      timestamp: t["@attr"]?.nowplaying ? 0 : parseInt(String(t.date?.uts ?? "0"), 10),
      nowPlaying: Boolean(t["@attr"]?.nowplaying), url: String(t.url ?? ""),
    })),
    total: parseInt(String(raw["@attr"]?.total ?? "0"), 10),
  };
}

export async function getLovedTracks(username: string, apiKey: string, opts: { limit?: number; page?: number } = {}): Promise<{ tracks: LovedTrack[]; total: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("user.getLovedTracks", { user: username, limit: String(opts.limit ?? 50), page: String(opts.page ?? 1) }, apiKey)) as any;
  const raw = data.lovedtracks;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(raw.track) ? raw.track : raw.track ? [raw.track] : [];
  return {
    tracks: items.map((t) => ({ artist: String(t.artist?.name ?? ""), track: String(t.name ?? ""), lovedAt: parseInt(String(t.date?.uts ?? "0"), 10), url: String(t.url ?? "") })),
    total: parseInt(String(raw["@attr"]?.total ?? "0"), 10),
  };
}

type TopPeriod = "overall" | "7day" | "1month" | "3month" | "6month" | "12month";

export async function getTopTracks(username: string, apiKey: string, period: TopPeriod, limit = 50): Promise<TopTrack[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("user.getTopTracks", { user: username, period, limit: String(limit) }, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(data.toptracks?.track) ? data.toptracks.track : []).map((t: any) => ({
    artist: String(t.artist?.name ?? ""), track: String(t.name ?? ""), playcount: parseInt(String(t.playcount ?? "0"), 10), rank: parseInt(String(t["@attr"]?.rank ?? "0"), 10), url: String(t.url ?? ""),
  }));
}

export async function getTopArtists(username: string, apiKey: string, period: TopPeriod, limit = 50): Promise<TopArtist[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("user.getTopArtists", { user: username, period, limit: String(limit) }, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(data.topartists?.artist) ? data.topartists.artist : []).map((a: any) => ({
    name: String(a.name ?? ""), playcount: parseInt(String(a.playcount ?? "0"), 10), rank: parseInt(String(a["@attr"]?.rank ?? "0"), 10), url: String(a.url ?? ""),
  }));
}

export async function getTopAlbums(username: string, apiKey: string, period: TopPeriod, limit = 50): Promise<TopAlbum[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("user.getTopAlbums", { user: username, period, limit: String(limit) }, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(data.topalbums?.album) ? data.topalbums.album : []).map((a: any) => ({
    artist: String(a.artist?.name ?? ""), album: String(a.name ?? ""), playcount: parseInt(String(a.playcount ?? "0"), 10), rank: parseInt(String(a["@attr"]?.rank ?? "0"), 10), url: String(a.url ?? ""),
  }));
}

export async function getUserInfo(username: string, apiKey: string): Promise<UserInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("user.getInfo", { user: username }, apiKey)) as any;
  const u = data.user;
  return {
    username: String(u.name ?? ""), realname: String(u.realname ?? ""), playcount: parseInt(String(u.playcount ?? "0"), 10),
    trackCount: parseInt(String(u.track_count ?? "0"), 10), artistCount: parseInt(String(u.artist_count ?? "0"), 10),
    albumCount: parseInt(String(u.album_count ?? "0"), 10), country: String(u.country ?? ""),
    registered: parseInt(String(u.registered?.unixtime ?? "0"), 10), url: String(u.url ?? ""),
  };
}

export async function searchTrack(track: string, artist: string | undefined, apiKey: string, limit = 10): Promise<TrackSearchResult[]> {
  const p: Record<string, string> = { track, limit: String(limit) };
  if (artist) p.artist = artist;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await apiGet("track.search", p, apiKey)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Array.isArray(data.results?.trackmatches?.track) ? data.results.trackmatches.track : []).map((t: any) => ({
    artist: String(t.artist ?? ""), track: String(t.name ?? ""), listeners: parseInt(String(t.listeners ?? "0"), 10), url: String(t.url ?? ""), mbid: t.mbid || undefined,
  }));
}
