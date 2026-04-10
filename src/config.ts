import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { LastfmConfig } from "./types.js";

const CONFIG_PATH =
  process.env.LASTFM_CONFIG_PATH ??
  new URL("../lastfm-config.json", import.meta.url).pathname;

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): LastfmConfig {
  if (!configExists()) {
    throw new Error("Not set up. Run lastfm_authorize to get started.");
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as LastfmConfig;
  } catch {
    throw new Error(`Config file is malformed. Try running lastfm_authorize again.`);
  }
}

export function saveConfig(config: LastfmConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
