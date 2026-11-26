import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { vibePlatformPaths } from "../../src/platform/paths.ts";
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
