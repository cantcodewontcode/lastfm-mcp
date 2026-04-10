# lastfm-mcp

A Claude Desktop extension for Last.fm. Scrobble tracks and full albums, manage loved songs, and explore your listening history — all from a conversation.

## Features

- **Album scrobbling** — say "I just finished listening to Abbey Road" and Claude handles the entire session: fetches the tracklist, calculates timestamps for every track working backwards from now, and submits them all at once
- **Track scrobbling** — record individual plays with optional backdated timestamps
- **Loved tracks** — mark and unmark loved tracks, browse your loved list
- **Listening history** — fetch recent scrobbles with date range filtering
- **Charts** — top tracks, artists, and albums by time period
- **Now playing** — update your profile's live listening indicator
- **Track search** — look up correct metadata before scrobbling

## Installation

Download the latest `.mcpb` from [Releases](https://github.com/cantcodewontcode/lastfm-mcp/releases) and double-click to install in Claude Desktop.

## Setup

First-time setup takes about 2 minutes. Claude will walk you through every step — just say "help me set up Last.fm" and follow along.

The short version:

1. Claude will have you create a free Last.fm API app if you don't have one already for this (at https://www.last.fm/api/account/create). Just fill out the form fields, leaving Callback URL blank.
2. Ask Calude to authorize and give it your API key and shared secret when it asks for it.
3. Click **Allow access** to authorize lastfm-mcp to use your Last.fm account.
4. Claude will validate access works, and that's it!

## Examples

### Scrobble an album you just finished

> "Scrobble The White Album by The Beatles — I just finished it"

Claude fetches the tracklist and durations, calculates a timestamp for every track working backwards from right now, and submits them all. You'll get a confirmation listing each track with its scrobble time.

### Scrobble an album you finished earlier

> "I finished listening to OK Computer about an hour ago, can you scrobble it?"

Same as above but with `finished_at` set to an hour ago. Works with any natural time reference.

### Check your recent listening history

> "What have I been listening to today?"

Returns your recent scrobbles with timestamps, filtered to the current day.

### See your top artists this month

> "What are my top artists this month?"

Returns your most-played artists over the last 30 days with play counts.

### Love a track

> "Love the song Fake Plastic Trees by Radiohead"

Marks it as loved on your Last.fm profile instantly.

### Scrobble a single track

> "Scrobble Airbag by Radiohead"

Records a single play timestamped to now.

## How album scrobbling works

Last.fm requires a separate timestamp for every track — you can't just say "I listened to this album." This extension solves that by:

1. Fetching the full tracklist and per-track durations from Last.fm's `album.getInfo` API
2. Falling back to MusicBrainz for any tracks with missing duration data
3. Walking backwards from `finished_at` to assign a start timestamp to every track
4. Submitting everything in batches of up to 50 scrobbles

Note: Last.fm rejects scrobbles older than 14 days.

## Building from source

```bash
npm install
npm run build
npx @anthropic-ai/mcpb pack
```

Requires Node.js 18+.

## Privacy

This extension stores your Last.fm API key, shared secret, username, and session key locally in `lastfm-config.json` inside the extension directory. Nothing is transmitted except direct API calls to `ws.audioscrobbler.com` and (for duration lookups) `musicbrainz.org`.

## Privacy Policy

https://github.com/cantcodewontcode/lastfm-mcp/blob/main/PRIVACY.md

## License

MIT
