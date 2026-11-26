/**
 * Vibe MCP server entry point — the process the Vibe CLI spawns.
 *
 * Vibe starts this module on stdio from the managed `[[mcp_servers]]` entry
 * `rolebox sync vibe` writes into `<vibeHome>/config.toml` (`command: node`,
 * `args: [<abs path to dist/entries/vibe.js>]`). It boots the same role
 * runtime every other harness uses — resolve directories, load and resolve
 * roles, sync skill symlinks, assemble the canonical tool set — then serves
 * those tools over newline-delimited JSON-RPC until stdin closes.
 *
 * Native agent files map public roles; private children stay rolebox-internal
 * execution targets. Vibe documents no programmatic session protocol, so no
 * session tools, dispatch or graph surfaces are served.
 *
 * Run directly with `node dist/entries/vibe.js`.
 * Importing the module does NOT start the server or read stdin; the
 * module-level logger does open its log file and install its signal handlers
 * on first evaluation.
 *
 * @module
 */

import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { getDataDir } from "../cli/paths.ts";
import {
  createCodexMcpServer,
  type CodexMcpServer,
} from "../platform/adapters/codex/mcp/server.ts";
import { installProtocolStdoutGuard } from "../platform/adapters/codex/mcp/stdout-guard.ts";
import { resolveRoleboxDirectories, initializeRoleboxRuntime } from "../platform/factory.ts";
import { createVibeRuntime } from "../platform/adapters/vibe/runtime.ts";
import { syncVibeAgents } from "../platform/adapters/vibe/installation/agents.ts";
import { resolveComputerUseGate } from "../loader/computer-use-gate.ts";
import { resolveBrowseUseGate } from "../loader/browse-use-gate.ts";
import { buildComputerContext } from "../computer/context.ts";
import { buildBrowseContext } from "../browse/context.ts";
import type { CanonicalToolContext } from "../platform/types.ts";
import { roleFunctionsMap } from "../resolver/registry.ts";
import { syncSkillSymlinks } from "../sync/skill-symlinks.ts";
import { configureLogDirectory, createSubLogger, formatError } from "../logger.ts";

/** Legacy session attribution override for clients without handshake identity. */
export const VIBE_SESSION_ID_ENV = "ROLEBOX_SESSION_ID";

/** Session id used when neither the env override nor the handshake supplies one. */
export const DEFAULT_VIBE_SESSION_ID = "vibe";

const log = createSubLogger("vibe");

/**
 * Prefer an explicit environment override, then the initialize handshake's
 * clientInfo; the entry isolates the fallback per MCP connection.
 */
export function resolveVibeSessionId(
  clientInfo: Record<string, unknown> | undefined,
): string {
  const override = process.env[VIBE_SESSION_ID_ENV]?.trim();
  if (override) return override;

  if (clientInfo) {
    for (const key of ["sessionId", "sessionID", "session_id"]) {
      const value = clientInfo[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
  }

  return DEFAULT_VIBE_SESSION_ID;
}

/** Read the package version for MCP serverInfo; never fails the boot. */
function resolvePackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * The MCP `instructions` string: the workflow blocks for the tool families
 * this server actually registered. Each builder returns `""` when none of
 * its names is present, so the tool list and the instructions cannot
 * disagree.
 */
export function buildVibeInstructions(tools: Record<string, unknown>): string {
  const names = Object.keys(tools);
  return [
    buildComputerContext({ tools: names }),
    buildBrowseContext({ tools: names }),
  ].filter(Boolean).join("\n\n");
}

/**
 * Boot the role runtime and build the MCP server WITHOUT serving it. The
 * returned server is ready for serve() (the entry point) or handleLine()
 * (embedded/tests).
 */
export async function startVibeMcpServer(
  options: {
    output?: NodeJS.WritableStream;
    /** False disables computer tools; absence leaves them available by default. */
    computerUse?: boolean;
    /**
     * The browse family's host option: true always registers it, false always
     * disables it, absence AUTO-detects the optional Playwright driver.
     */
    browseUse?: boolean;
    directory?: string;
  } = {},
): Promise<CodexMcpServer> {
  const workingDir = options.directory ?? process.cwd();
  configureLogDirectory(workingDir);

  const dirs = resolveRoleboxDirectories({ workingDir, platformId: "vibe" });

  const { resolvedRoles, discovered, resolved, skipped } = await initializeRoleboxRuntime({
    directories: dirs,
    roleFunctionsMap,
  });

  syncSkillSymlinks(resolvedRoles, dirs.globalSkillsDir);
  const native = syncVibeAgents(resolvedRoles, {
    vibeHome: dirs.configDir,
    ...(dirs.roleboxDir === join(workingDir, "rolebox") ? { projectDir: workingDir } : {}),
  });
  for (const warning of native.warnings) log.warn(warning);

  // Global availability gates remain independent of the acting role's policy.
  const computerUseGate = resolveComputerUseGate({
    hostOverride: options.computerUse,
    workspaceDir: workingDir,
  });
  const browseUseGate = resolveBrowseUseGate({
    hostOverride: options.browseUse,
    workspaceDir: workingDir,
  });

  const runtime = createVibeRuntime({
    roles: resolvedRoles,
    directory: workingDir,
    computerUse: computerUseGate.enabled,
    browseUse: browseUseGate.enabled,
  });
  const tools = runtime.tools;

  let server: CodexMcpServer | undefined;
  const connectionId = randomUUID();
  const contextFactory = async (
    _info: { name: string; args: Record<string, unknown>; meta?: Record<string, unknown> },
    signal: AbortSignal,
  ): Promise<CanonicalToolContext> => {
    const supplied = resolveVibeSessionId(server?.clientInfo);
    const sessionID = supplied === DEFAULT_VIBE_SESSION_ID ? `${supplied}:${connectionId}` : supplied;
    return {
      sessionID,
      messageID: randomUUID(),
      agent: "",
      directory: workingDir,
      worktree: workingDir,
      abort: signal,
      metadata() {},
      async ask() {
        // Host MCP approvals remain outside this stdio tool context.
      },
    };
  };

  server = createCodexMcpServer({
    tools,
    onClose: () => runtime.close(),
    instructions: buildVibeInstructions(tools),
    serverVersion: resolvePackageVersion(),
    output: options.output,
    contextFactory,
    onError(message: string): void {
      log.warn(message);
      process.stderr.write("[rolebox vibe] " + message + "\n");
    },
  });

  log.info("Vibe MCP server ready", {
    discovered,
    resolved,
    skipped,
    tools: Object.keys(tools).length,
    computerUse: computerUseGate.enabled,
    computerUseReason: computerUseGate.reason,
    browseUse: browseUseGate.enabled,
    browseUseReason: browseUseGate.reason,
    roleboxDir: dirs.roleboxDir,
    globalSkillsDir: dirs.globalSkillsDir,
  });

  return server;
}

/** Boot the server and serve it until stdin ends. */
export async function main(): Promise<void> {
  // Install before booting anything that might log: fd 1 is the protocol
  // channel on this transport, so stdout is diverted to stderr and the server
  // gets the captured writer for its own responses. Never restored — the
  // process serves until stdin closes.
  const guard = installProtocolStdoutGuard();
  const server = await startVibeMcpServer({ output: guard.stream });
  const interrupt = () => { server.close(); process.stdin.destroy(); process.exitCode = 130; };
  const terminate = () => { server.close(); process.stdin.destroy(); process.exitCode = 143; };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try { await server.serve(); }
  finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    server.close();
  }
}

/** Whether this module was launched as the process entry (not imported). */
function isDirectEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectEntryPoint()) {
  void main().catch((err: unknown) => {
    process.stderr.write("[rolebox vibe] fatal: " + formatError(err).message + "\n");
    process.exitCode = 1;
  });
}

/** Default export for parity with the other harness entries. */
export default { startVibeMcpServer, main };
