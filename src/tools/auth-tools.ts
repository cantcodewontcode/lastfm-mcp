import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execSync } from "child_process";
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { dirname } from "path";
import { getRequestToken, getSession } from "../lastfm-client.js";
import { saveConfig, loadConfig, configExists, getConfigPath } from "../config.js";

function pendingPath(): string { return getConfigPath() + ".pending"; }

function savePending(data: { token: string; api_key: string; api_secret: string }): void {
  const p = pendingPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ ...data, ts: Date.now() }), "utf-8");
}

function loadPending(): { token: string; api_key: string; api_secret: string } | null {
  const p = pendingPath();
  if (!existsSync(p)) return null;
  try {
    const obj = JSON.parse(readFileSync(p, "utf-8")) as { token: string; api_key: string; api_secret: string; ts: number };
    if (Date.now() - obj.ts > 55 * 60 * 1000) { unlinkSync(p); return null; }
    return { token: obj.token, api_key: obj.api_key, api_secret: obj.api_secret };
  } catch { return null; }
}

function clearPending(): void { if (existsSync(pendingPath())) unlinkSync(pendingPath()); }

function openUrl(url: string): void {
  try {
    if (process.platform === "darwin") execSync(`open "${url}"`);
    else if (process.platform === "win32") execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch { /* non-fatal */ }
}

export function registerAuthTools(server: McpServer): void {

  server.registerTool(
    "lastfm_authorize",
    {
      title: "Set Up & Authorize Last.fm",
      description: `Connect Claude to Last.fm. Handles first-time setup AND completing authorization after browser approval.

━━━ IF THE USER HASN'T SET UP LAST.FM YET ━━━
Walk them through these steps before calling this tool:

STEP 1 — Get a Last.fm account (skip if they have one)
  → https://www.last.fm/join

STEP 2 — Register a free API application (takes ~2 minutes)
  → Go to: https://www.last.fm/api/account/create
  → Fill in the form:
      • Contact email: their email address
      • Application name: anything they like, e.g. "My Claude Scrobbler"
      • Application description: e.g. "Personal scrobbling tool"
      • Callback URL: leave this BLANK
      • Application homepage: leave this BLANK or put anything
  → Click Submit
  → They will see their API key and Shared secret on the next page — copy BOTH

STEP 3 — Call this tool with those two values:
  lastfm_authorize(api_key="their_api_key", api_secret="their_shared_secret")
  → This opens their browser to authorize the connection
  → They click "Allow access" on the Last.fm page

STEP 4 — Complete the connection:
  lastfm_authorize(check_status=true)
  → Done! All other tools are now ready to use.

━━━ PARAMETERS ━━━
  - api_key (string): From last.fm/api/account/create — required on first call only
  - api_secret (string): "Shared secret" from the same page — required on first call only
  - check_status (bool): Call with true after approving in browser to complete setup
  - force_reauth (bool): Wipe saved credentials and start over (e.g. to switch accounts)

━━━ ALREADY SET UP ━━━
If called with no arguments and already authorized, reports the connected username.`,
      inputSchema: z.object({
        api_key:      z.string().optional().describe("Your Last.fm API key — from last.fm/api/account/create"),
        api_secret:   z.string().optional().describe("Your Last.fm shared secret — from the same page as the API key"),
        check_status: z.boolean().optional().default(false).describe("Call with true after approving in your browser"),
        force_reauth: z.boolean().optional().default(false).describe("Clear saved credentials and start over"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ api_key, api_secret, check_status, force_reauth }) => {
      const txt = (text: string) => ({ content: [{ type: "text" as const, text }] });

      if (force_reauth) {
        clearPending();
        try { if (configExists()) unlinkSync(getConfigPath()); } catch { /* ok */ }
      }

      // Already authorized
      if (!force_reauth && !check_status && !api_key && configExists()) {
        try {
          const config = loadConfig();
          return txt(`✅ Already connected to Last.fm as ${config.username}.\n\nAll tools are ready. Use force_reauth=true to switch accounts.`);
        } catch { /* fall through */ }
      }

      // ── Step 2: complete the flow ──────────────────────────────────────────
      if (check_status) {
        const pending = loadPending();
        if (!pending) {
          return txt(
            "No pending authorization found.\n\n" +
            "Please call lastfm_authorize with your api_key and api_secret to start the process."
          );
        }
        try {
          const { sessionKey, username } = await getSession(pending.token, pending.api_key, pending.api_secret);
          saveConfig({ api_key: pending.api_key, api_secret: pending.api_secret, username, session_key: sessionKey });
          clearPending();
          return txt(`✅ Connected to Last.fm as ${username}.\n\nAll tools are now ready to use.`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("14") || msg.toLowerCase().includes("unauthorized")) {
            return txt(
              "⏳ Looks like you haven't approved access yet.\n\n" +
              "Please check your browser — there should be a Last.fm page asking you to \"Allow access\".\n" +
              "Once you've clicked that, come back and call lastfm_authorize with check_status=true again."
            );
          }
          return txt(`Authorization failed: ${msg}\n\nTry calling lastfm_authorize with your api_key and api_secret to start over.`);
        }
      }

      // ── Step 1: get token, open browser ───────────────────────────────────
      if (!api_key || !api_secret) {
        return txt(
          "To get started, I need your Last.fm API key and shared secret.\n\n" +
          "Here's how to get them (takes about 2 minutes):\n\n" +
          "1. Go to https://www.last.fm/api/account/create\n" +
          "   (You'll need a Last.fm account — sign up free at https://www.last.fm/join if you don't have one)\n\n" +
          "2. Fill in the form:\n" +
          "   • Contact email: your email\n" +
          "   • Application name: anything you like, e.g. \"My Claude Scrobbler\"\n" +
          "   • Application description: e.g. \"Personal scrobbling tool\"\n" +
          "   • Callback URL: leave blank\n" +
          "   • Application homepage: leave blank\n\n" +
          "3. Click Submit. You'll see your API key and Shared secret on the next page.\n\n" +
          "4. Come back and call lastfm_authorize with those two values."
        );
      }

      let token: string, authUrl: string;
      try {
        ({ token, authUrl } = await getRequestToken(api_key, api_secret));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return txt(
          `Failed to connect with those credentials: ${msg}\n\n` +
          "Double-check that you copied the API key and Shared secret correctly from last.fm/api/accounts — " +
          "they're different values, and it's easy to mix them up."
        );
      }

      savePending({ token, api_key, api_secret });
      openUrl(authUrl);

      return txt(
        `🔐 Almost there! Your browser should have just opened.\n\n` +
        `If it didn't open automatically, go to this URL:\n\n  ${authUrl}\n\n` +
        `On that page, click "Allow access" to connect your Last.fm account.\n\n` +
        `Once you've done that, come back and call:\n  lastfm_authorize with check_status=true\n\n` +
        `(This link expires in ~60 minutes)`
      );
    }
  );

  server.registerTool(
    "lastfm_auth_status",
    {
      title: "Check Last.fm Auth Status",
      description: "Check whether Last.fm is connected and which account is active. " +
        "If not connected, tells the user to run lastfm_authorize.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      if (!configExists()) {
        return { content: [{ type: "text", text: "Not connected. Run lastfm_authorize to get started — I'll walk you through it." }] };
      }
      try {
        const c = loadConfig();
        return { content: [{ type: "text", text: `✅ Connected to Last.fm as ${c.username}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Config error: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }
  );

}
