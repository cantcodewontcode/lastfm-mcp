# Privacy Policy

**lastfm-mcp** is a local desktop extension for Claude. This policy describes what data it handles and how.

## What this extension does

lastfm-mcp runs entirely on your machine. It has no backend server, no telemetry, and no analytics. All processing happens locally; the only outbound connections are direct API calls from your computer to Last.fm and MusicBrainz.

## Data stored on your machine

When you authorize the extension, the following is written to `lastfm-config.json` inside the extension's local directory:

- Your Last.fm API key and shared secret
- Your Last.fm username
- Your Last.fm session key (OAuth token)

This file never leaves your machine except as described below. It is excluded from the extension's source repository via `.gitignore`.

## Data sent to third-party services

The extension makes direct API calls to two services:

**Last.fm** (`ws.audioscrobbler.com`)
Your API key, session key, and scrobble data (artist, track, album, timestamp) are sent to Last.fm when you scrobble. This is the core function of the extension. Last.fm's privacy policy applies: https://www.last.fm/legal/privacy

**MusicBrainz** (`musicbrainz.org`)
When scrobbling an album, the extension may query MusicBrainz to look up track durations. Only the artist and album name are sent. MusicBrainz's privacy policy applies: https://metabrainz.org/privacy

No data is sent to Anthropic, to the extension developer, or to any other party.

## Data not collected

- No conversation content is collected or logged
- No usage analytics or crash reports are collected
- No data is sold, shared, or monetized in any way

## Contact

For questions or concerns: https://github.com/cantcodewontcode/lastfm-mcp/issues

*Last updated: April 2026*
