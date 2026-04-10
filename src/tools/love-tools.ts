import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { loveTrack, unloveTrack, getLovedTracks } from "../lastfm-client.js";

export function registerLoveTools(server: McpServer): void {

  server.registerTool(
    "lastfm_love_track",
    {
      title: "Love a Track",
      description: "Mark a track as loved on your Last.fm profile.",
      inputSchema: z.object({ artist: z.string().min(1), track: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ artist, track }) => {
      const config = loadConfig();
      await loveTrack(artist, track, config);
      return { content: [{ type: "text", text: `❤️  Loved: "${track}" by ${artist}` }] };
    }
  );

  server.registerTool(
    "lastfm_unlove_track",
    {
      title: "Unlove a Track",
      description: "Remove the loved status from a track on your Last.fm profile.",
      inputSchema: z.object({ artist: z.string().min(1), track: z.string().min(1) }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ artist, track }) => {
      const config = loadConfig();
      await unloveTrack(artist, track, config);
      return { content: [{ type: "text", text: `Unloved: "${track}" by ${artist}` }] };
    }
  );

  server.registerTool(
    "lastfm_get_loved_tracks",
    {
      title: "Get Loved Tracks",
      description: "Fetch your loved tracks from Last.fm, newest first.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().default(50),
        page:  z.number().int().min(1).optional().default(1),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ limit, page }) => {
      const config = loadConfig();
      const { tracks, total } = await getLovedTracks(config.username, config.api_key, { limit, page });
      if (!tracks.length) return { content: [{ type: "text", text: "No loved tracks found." }] };
      const lines = tracks.map(t => `  • "${t.track}" by ${t.artist}  (${new Date(t.lovedAt * 1000).toISOString().slice(0, 10)})`);
      return { content: [{ type: "text", text: `Loved tracks for ${config.username} (page ${page}, ${tracks.length} of ${total}):\n` + lines.join("\n") }] };
    }
  );
}
