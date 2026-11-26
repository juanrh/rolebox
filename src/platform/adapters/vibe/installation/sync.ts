/**
 * Vibe post-sync installation step.
 *
 * `rolebox sync vibe` is not only a role-symlink sync: Vibe is extended
 * through its `config.toml` MCP table and native agent files, so this
 * host-owned install step registers the stdio MCP server entry and syncs the
 * native agent files. It lives HERE, with the Vibe adapter, and is invoked
 * through the platform descriptor's `postSync` hook (see
 * src/platform/registry.ts) so the neutral CLI never imports a Vibe module
 * or names Vibe itself.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  registerVibeMcpServer,
  vibeConfigPath,
} from "./mcp-registration.ts";
import { syncVibeAgents } from "./agents.ts";
import { vibePlatformPaths } from "../../../paths.ts";
import { initializeRoleboxRuntime, resolveRoleboxDirectories } from "../../../factory.ts";
import { resolveRoleboxPackageRoot } from "../../codex/installation/plugin-bundle.ts";

/** The default MCP server entry: `<packageRoot>/dist/entries/vibe.js`. */
export function vibeServerEntry(packageRoot: string): string {
  return join(packageRoot, "dist", "entries", "vibe.js");
}

/** Read the package version from the package.json at the resolved package root. */
function readPackageVersion(packageRoot: string): string {
  const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf-8")) as {
    version: string;
  };
  return pkg.version;
}

/**
 * The warning shown when the registration points Vibe at an MCP server
 * entry that does not exist yet. A source checkout that was never built
 * still syncs — Vibe just cannot start the server until rolebox is built
 * or reinstalled.
 */
export function vibeServerEntryWarning(serverEntry: string): string | undefined {
  if (existsSync(serverEntry)) return undefined;
  return (
    `Warning: the Vibe MCP server entry ${serverEntry} does not exist. ` +
    "Build or reinstall rolebox before starting Vibe (for a source checkout, `npm run build`)."
  );
}

/** Options for {@link syncVibeTarget}. */
export interface SyncVibeTargetOptions {
  /** Sync target directory (`{vibeHome}/rolebox`) the roles were deployed into. */
  syncTarget: string;
  /**
   * Emit one user-facing line. The CLI owns console output (the logging guard
   * reserves it for `src/cli`), so this adapter reports instead of printing.
   */
  report: (line: string, level?: "info" | "warn") => void;
}

/**
 * Install/refresh rolebox's Vibe integration: register the MCP server in
 * `config.toml`, then sync the native agent files. Idempotent and safe to
 * re-run.
 */
export async function syncVibeTarget(options: SyncVibeTargetOptions): Promise<void> {
  const packageRoot = resolveRoleboxPackageRoot(import.meta.url);
  const serverEntry = vibeServerEntry(packageRoot);
  const entryWarning = vibeServerEntryWarning(serverEntry);
  if (entryWarning !== undefined) options.report(entryWarning, "warn");

  const configPath = vibeConfigPath(vibePlatformPaths().configDir);
  try {
    registerVibeMcpServer(configPath, serverEntry);
  } catch (error) {
    options.report(
      `Vibe plugin: registering the rolebox MCP server in ${configPath} failed: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        "Fix the cause and re-run `rolebox sync vibe` — the sync is safe to repeat.",
      "warn",
    );
    throw error;
  }
  options.report(`Vibe MCP server: registered in ${configPath}`);
  options.report("Vibe MCP server: restart Vibe (or run /reload-plugins in a session) to load the rolebox tools");

  const directories = resolveRoleboxDirectories({ platformId: "vibe" });
  const { resolvedRoles } = await initializeRoleboxRuntime({
    directories: { ...directories, roleboxDir: options.syncTarget },
    roleFunctionsMap: new Map(),
  });
  const agents = syncVibeAgents(resolvedRoles, { vibeHome: directories.configDir });
  for (const warning of agents.warnings) options.report(`Warning: ${warning}`, "warn");
  options.report(`Vibe agents: ${agents.agents.filter(agent => agent.parentId === undefined).length} public roles, ${agents.agents.filter(agent => agent.parentId !== undefined).length} private children; restart Vibe to refresh native agents`);
}
