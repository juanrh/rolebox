import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { vibePlatformPaths } from "../../src/platform/paths.ts";
import { PLATFORM_REGISTRY, getPlatformDescriptor } from "../../src/platform/registry.ts";
import {
  registerVibeMcpServer,
  vibeConfigPath,
  VIBE_MANAGED_START,
} from "../../src/platform/adapters/vibe/installation/mcp-registration.ts";
import { vibeCapabilities } from "../../src/platform/capabilities.ts";
import { SyncTarget, SYNC_TARGET_VALUES } from "../../src/constants.ts";
import { MODEL_SOURCES } from "../../src/platform/model-catalog/index.ts";

// Every Vibe path this file touches is redirected through VIBE_HOME (and the
// fake HOME) to a mkdtemp directory — the developer's real ~/.vibe is never
// read or written.

let vibeHome: string;

const ORIGINAL_VIBE_HOME = process.env.VIBE_HOME;

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  vibeHome = mkdtempSync(join(tmpdir(), "rolebox-vibe-home-"));
  process.env.VIBE_HOME = vibeHome;
});

afterEach(() => {
  restoreEnv("VIBE_HOME", ORIGINAL_VIBE_HOME);
  rmSync(vibeHome, { recursive: true, force: true });
});

describe("vibePlatformPaths", () => {
  it("resolves every path under VIBE_HOME when it is set", () => {
    const paths = vibePlatformPaths();

    expect(paths.platformId).toBe("vibe");
    expect(paths.configDir).toBe(vibeHome);
    expect(paths.agentsDir).toBe(join(vibeHome, "agents"));
    expect(paths.skillsDir).toBe(join(vibeHome, "skills"));
    // Vibe has no rolebox-owned sessions directory — nothing is invented.
    expect(paths.sessionsDir).toBeUndefined();
    expect(paths.extensionsDir).toBeUndefined();
  });

  it("treats a blank VIBE_HOME as unset and falls back to ~/.vibe", () => {
    const fallback = join(homedir(), ".vibe");

    process.env.VIBE_HOME = "";
    expect(vibePlatformPaths().configDir).toBe(fallback);

    process.env.VIBE_HOME = "   ";
    expect(vibePlatformPaths().configDir).toBe(fallback);
  });

  it("falls back to the home-directory .vibe when VIBE_HOME is unset", () => {
    delete process.env.VIBE_HOME;

    const paths = vibePlatformPaths();

    expect(paths.configDir).toBe(join(homedir(), ".vibe"));
    expect(paths.agentsDir).toBe(join(homedir(), ".vibe", "agents"));
    expect(paths.skillsDir).toBe(join(homedir(), ".vibe", "skills"));
  });

  it("reads VIBE_HOME at call time rather than capturing it at module load", () => {
    const first = vibePlatformPaths().configDir;
    const second = mkdtempSync(join(tmpdir(), "rolebox-vibe-home2-"));
    try {
      process.env.VIBE_HOME = second;
      expect(vibePlatformPaths().configDir).toBe(second);
      expect(vibePlatformPaths().configDir).not.toBe(first);
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });
});

describe("vibeCapabilities", () => {
  it("declares exactly the MCP + agent-file surface", () => {
    const capabilities = vibeCapabilities();

    expect(capabilities.platformId).toBe("vibe");
    expect(capabilities.hasAgentFileSync).toBe(true);
    expect(capabilities.hasMultiStepTools).toBe(true);
    // Vibe documents no programmatic session protocol.
    expect(capabilities.hasBackgroundTasks).toBe(false);
    expect(capabilities.hasSessionFork).toBe(false);
    expect(capabilities.hasSessionCreate).toBe(false);
    expect(capabilities.hasSessionAbort).toBe(false);
    expect(capabilities.hasEventStream).toBe(false);
    expect(capabilities.hasSessionStatus).toBe(false);
    expect(capabilities.hasRoleSwitch).toBe(false);
  });
});

describe("vibe sync target constants", () => {
  it("registers vibe as a sync target with the opencode model seed", () => {
    expect(SyncTarget.Vibe).toBe("vibe");
    expect(SYNC_TARGET_VALUES).toContain("vibe");
    expect(MODEL_SOURCES[SyncTarget.Vibe].seed).toBe(SyncTarget.Opencode);
    expect(MODEL_SOURCES[SyncTarget.Vibe].read).toBeUndefined();
  });
});

describe("vibe platform descriptor", () => {
  const ORIGINAL_DATA_DIR = process.env.ROLEBOX_DATA_DIR;
  const ORIGINAL_CONFIG_DIR = process.env.ROLEBOX_CONFIG_DIR;

  afterEach(() => {
    restoreEnv("ROLEBOX_DATA_DIR", ORIGINAL_DATA_DIR);
    restoreEnv("ROLEBOX_CONFIG_DIR", ORIGINAL_CONFIG_DIR);
  });

  it("is registered with its own paths and capabilities", () => {
    const descriptor = getPlatformDescriptor("vibe");

    expect(descriptor.label).toBe("Vibe");
    expect(descriptor.paths()).toEqual(vibePlatformPaths());
    expect(descriptor.capabilities()).toEqual(vibeCapabilities());
    expect(PLATFORM_REGISTRY.map(platform => platform.id)).toContain("vibe");
  });

  it("detects registration from the managed config block", () => {
    const descriptor = getPlatformDescriptor("vibe");

    expect(descriptor.detectIntegration()!.registered).toBe(false);
    expect(descriptor.detectIntegration()!.detail).toBe("not found in vibe config");

    registerVibeMcpServer(vibeConfigPath(vibeHome), join(vibeHome, "server.js"));
    const integration = descriptor.detectIntegration()!;
    expect(integration.registered).toBe(true);
    expect(integration.detail).toBe("registered");
    expect(integration.mechanism).toBe("MCP server");
  });

  it("detects nothing when the managed marker only appears inside a string", () => {
    writeFileSync(
      vibeConfigPath(vibeHome),
      `instructions = "${VIBE_MANAGED_START}"\n`,
      "utf-8",
    );
    expect(getPlatformDescriptor("vibe").detectIntegration()!.registered).toBe(false);
  });

  it("postSync registers the MCP server and syncs native agents", async () => {
    process.env.ROLEBOX_DATA_DIR = join(vibeHome, "data");
    process.env.ROLEBOX_CONFIG_DIR = join(vibeHome, "config");
    const roleDir = join(vibeHome, "rolebox", "reviewer");
    mkdirSync(roleDir, { recursive: true });
    writeFileSync(join(roleDir, "role.yaml"), [
      "name: Reviewer", "description: Reviews changes.", "prompt: Review with evidence.", "",
    ].join("\n"));

    const lines: Array<{ line: string; level?: string }> = [];
    await getPlatformDescriptor("vibe").postSync!({
      syncTarget: join(vibeHome, "rolebox"),
      report: (line, level) => lines.push({ line, level }),
    });

    const config = readFileSync(vibeConfigPath(vibeHome), "utf-8");
    expect(config).toContain('name = "rolebox"');
    expect(config).toContain('transport = "stdio"');
    expect(config).toContain("dist/entries/vibe.js");
    expect(readdirSync(join(vibeHome, "agents"))).toContain("rolebox--reviewer.toml");
    const agent = readFileSync(join(vibeHome, "agents", "rolebox--reviewer.toml"), "utf-8");
    expect(agent).toContain("Review with evidence.");
    expect(lines.some(entry => entry.line.includes("registered in"))).toBe(true);
    expect(lines.some(entry => entry.line.includes("1 public roles"))).toBe(true);
    // The sync target directory had no built dist/ in this sandbox — the
    // entry-missing warning is expected and informational.
    expect(lines.some(entry => entry.level === "warn" && entry.line.includes("does not exist"))).toBe(true);
  });
});
