/**
 * Vibe MCP-server registration — the managed `[[mcp_servers]]` block rolebox
 * writes into the Vibe CLI's `config.toml`.
 *
 * Vibe discovers MCP servers from `[[mcp_servers]]` tables in
 * `<vibeHome>/config.toml` (https://docs.mistral.ai/llms/vibe/code/cli/mcp-servers/).
 * rolebox owns exactly one stdio entry that starts its MCP server entry module,
 * wrapped in the shared comment-delimited managed block so the write is
 * idempotent, repairs duplicate blocks, and never touches any other byte of
 * the user's file.
 */

import { join } from "node:path";
import {
  applyManagedBlock,
  escapeTomlString,
  removeManagedBlock,
  type ManagedBlockMarkers,
} from "../../../managed-config-block.ts";
import { PLUGIN_ID } from "../../../../constants.ts";

export const VIBE_MANAGED_START =
  "# >>> rolebox (managed) — do not edit; `rolebox sync vibe` rewrites this block >>>";
export const VIBE_MANAGED_END = "# <<< rolebox (managed) <<<";

export const VIBE_MANAGED_MARKERS: ManagedBlockMarkers = {
  start: VIBE_MANAGED_START,
  end: VIBE_MANAGED_END,
};

/** The managed `config.toml` block for a Vibe MCP server entry. */
export function buildVibeMcpServerBlock(
  serverEntry: string,
  runtimeCommand = "node",
): string {
  return [
    VIBE_MANAGED_START,
    "[[mcp_servers]]",
    `name = "${PLUGIN_ID}"`,
    'transport = "stdio"',
    `command = "${escapeTomlString(runtimeCommand)}"`,
    `args = ["${escapeTomlString(serverEntry)}"]`,
    "startup_timeout_sec = 60",
    "tool_timeout_sec = 600",
    VIBE_MANAGED_END,
  ].join("\n");
}

/** The config path rolebox registers in: `<vibeHome>/config.toml`. */
export function vibeConfigPath(vibeHome: string): string {
  return join(vibeHome, "config.toml");
}

/**
 * Write or refresh the rolebox `[[mcp_servers]]` entry in a Vibe
 * `config.toml`. Idempotent: a second run with the same entry is
 * byte-identical; duplicate managed blocks are repaired to one.
 */
export function registerVibeMcpServer(
  configPath: string,
  serverEntry: string,
  options: { runtimeCommand?: string } = {},
): { changed: boolean } {
  return applyManagedBlock(
    configPath,
    buildVibeMcpServerBlock(serverEntry, options.runtimeCommand ?? "node"),
    VIBE_MANAGED_MARKERS,
  );
}

/** Remove the managed block from a Vibe `config.toml`. */
export function unregisterVibeMcpServer(configPath: string): { changed: boolean } {
  return removeManagedBlock(configPath, VIBE_MANAGED_MARKERS);
}
