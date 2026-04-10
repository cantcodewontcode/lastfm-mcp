// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Per-user config. API key/secret are registered by the user at last.fm/api/account/create.
 * Session key is obtained via OAuth and never expires.
 */
export interface LastfmConfig {
  api_key: string;
  api_secret: string;
  username: string;
  session_key: string;
}

// ─── API Response shapes ──────────────────────────────────────────────────────

export interface LastfmError {
  error: number;
  message: string;
}

export interface ScrobbleTrack {
  artist: string;
  track: string;
  timestamp: number;
  album?: string;
  albumArtist?: string;
  trackNumber?: number;
  duration?: number;
  mbid?: string;
}

export interface AlbumTrack {
  name: string;
  duration: number;
  rank: number;
  artist?: string;
  mbid?: string;
}

export interface AlbumInfo {
  name: string;
  artist: string;
  tracks: AlbumTrack[];
  mbid?: string;
  url?: string;
}

export interface RecentTrack {
  artist: string;
  track: string;
  album: string;
  timestamp: number;
  nowPlaying: boolean;
  url: string;
}

export interface LovedTrack {
  artist: string;
  track: string;
  lovedAt: number;
  url: string;
}

export interface TopTrack {
  artist: string;
  track: string;
  playcount: number;
  rank: number;
  url: string;
}

export interface TopArtist {
  name: string;
  playcount: number;
  rank: number;
  url: string;
}

export interface TopAlbum {
  artist: string;
  album: string;
  playcount: number;
  rank: number;
  url: string;
}

export interface UserInfo {
  username: string;
  realname: string;
  playcount: number;
  trackCount: number;
  artistCount: number;
  albumCount: number;
  country: string;
  registered: number;
  url: string;
}

export interface TrackSearchResult {
  artist: string;
  track: string;
  listeners: number;
  url: string;
  mbid?: string;
}

export interface MBRelease {
  id: string;
  title: string;
  date?: string;
  media: MBMedium[];
}

export interface MBMedium {
  position: number;
  tracks: MBTrack[];
}

export interface MBTrack {
  position: number;
  title: string;
  length: number | null;
  recording: {
    id: string;
    title: string;
    length: number | null;
  };
}
