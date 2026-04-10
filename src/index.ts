import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAuthTools } from "./tools/auth-tools.js";
import { registerScrobbleTools } from "./tools/scrobble-tools.js";
import { registerLoveTools } from "./tools/love-tools.js";
import { registerStatsTools } from "./tools/stats-tools.js";

const server = new McpServer({
  name: "lastfm-mcp-server",
  version: "1.0.0",
});

registerAuthTools(server);
registerScrobbleTools(server);
registerLoveTools(server);
registerStatsTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is reserved for MCP protocol messages
  console.error("Last.fm MCP server running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
