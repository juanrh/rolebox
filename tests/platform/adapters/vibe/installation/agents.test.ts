import { afterEach, describe, expect, it } from "vitest";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  vibeAgentName,
  collectVibeAgentDescriptors,
  renderVibeAgent,
  syncVibeAgents,
} from "../../../../../src/platform/adapters/vibe/installation/agents.ts";
import type { ResolvedRole, ResolvedSubAgent } from "../../../../../src/types.ts";

const { parse: parseToml } = createRequire(import.meta.url)("toml") as {
  parse: (value: string) => Record<string, unknown>;
};
const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "rolebox-vibe-agents-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function role(id = "reviewer", config: Partial<ResolvedRole["config"]> = {}, subagents: ResolvedSubAgent[] = []): ResolvedRole {
  return {
    id,
    config: { name: id, description: `${id} description`, prompt: `Review as ${id}.`, ...config },
    prompt: config.prompt ?? `Review as ${id}.`,
    skills: [],
    functions: [],
    references: [],
    subagents,
  };
}

function child(id: string, parentId: string, subagents: ResolvedSubAgent[] = []): ResolvedSubAgent {
  return {
    ...role(id, {}, subagents),
    parentId,
    inheritedFrom: {},
  };
}

describe("Vibe native agent descriptors", () => {
  it("keeps recursive child identities private and lists only direct children", () => {
    const nested = child("reviewer--researcher--reader", "reviewer--researcher");
    const researcher = child("reviewer--researcher", "reviewer", [nested]);
    const hiddenOtherChild = child("builder--executor", "builder");
    const { agents } = collectVibeAgentDescriptors([
      role("reviewer", {}, [researcher]),
      role("builder", {}, [hiddenOtherChild]),
    ]);

    expect(agents.map(agent => [agent.roleId, agent.parentId, agent.rootRoleId])).toEqual([
      ["reviewer", undefined, "reviewer"],
      ["reviewer--researcher", "reviewer", "reviewer"],
      ["reviewer--researcher--reader", "reviewer--researcher", "reviewer"],
      ["builder", undefined, "builder"],
      ["builder--executor", "builder", "builder"],
    ]);
    expect(agents[0].instructions).toContain('"reviewer--researcher"');
    expect(agents[0].instructions).not.toContain("reviewer--researcher--reader");
    expect(agents[0].instructions).not.toContain("builder--executor");
    expect(agents[1].instructions).toContain('"reviewer--researcher--reader"');
  });

  it("renders real TOML that round-trips Unicode, multiline instructions and control characters", () => {
    const prompt = 'Review "quoted" text.\nWindows C:\\project\n日本語\t\u0001';
    const { agents } = collectVibeAgentDescriptors([role("reviewer", {
      prompt,
      description: 'Review "carefully"\nwith evidence.',
      model: "mistral-large-latest",
    })]);

    const parsed = parseToml(renderVibeAgent(agents[0]));
    expect(parsed.agent_type).toBe("agent");
    expect(parsed.display_name).toBe("reviewer");
    expect(parsed.description).toBe('Review "carefully"\nwith evidence.');
    expect(parsed.instructions).toContain(prompt);
    expect(parsed.active_model).toBe("mistral-large-latest");
  });

  it("projects bare model IDs and warns on provider-qualified models", () => {
    const bare = collectVibeAgentDescriptors([role("reviewer", { model: "mistral-medium-latest" })]);
    expect(bare.agents[0].model).toBe("mistral-medium-latest");
    expect(bare.warnings).toEqual([]);

    const qualified = collectVibeAgentDescriptors([role("reviewer", { model: "anthropic/claude-sonnet-4" })]);
    expect(qualified.agents[0].model).toBeUndefined();
    expect(qualified.warnings[0]).toContain("provider-qualified");
  });

  it("warns for sampling parameters and model variants instead of inventing keys", () => {
    const { warnings } = collectVibeAgentDescriptors([
      role("reviewer", { temperature: 0.7, top_p: 0.9, variant: "high" }),
    ]);
    expect(warnings[0]).toContain("sampling parameters");
  });

  it("uses namespaced, filesystem-safe names without case collisions", () => {
    expect(vibeAgentName("reviewer")).toBe("rolebox--reviewer");
    expect(vibeAgentName("Weird Role/Name")).toMatch(/^rolebox--weird-role-name-[0-9a-f]{12}$/);
    expect(() => vibeAgentName("")).toThrow(/non-empty role ID/);

    const first = vibeAgentName("Reviewér");
    const second = vibeAgentName("reviewer");
    expect(first).not.toBe(second);
  });

  it("refuses duplicate and inconsistent identities before writing a native catalog", () => {
    expect(() => collectVibeAgentDescriptors([role("reviewer"), role("reviewer")])).toThrow(/Duplicate/);
    const inconsistent = child("reviewer--child", "other-parent");
    expect(() => collectVibeAgentDescriptors([role("reviewer", {}, [inconsistent])])).toThrow(/inconsistent parent/);
  });
});

describe("syncVibeAgents", () => {
  it("exports native top-level roles while keeping recursive children out of auto-discovery", () => {
    const vibeHome = temporaryDirectory();
    const researcher = child("reviewer--researcher", "reviewer");
    const result = syncVibeAgents([role("reviewer", {}, [researcher])], { vibeHome });

    expect(result.written).toBe(1);
    expect(readdirSync(join(vibeHome, "agents"))).toEqual(["rolebox--reviewer.toml"]);
    expect(JSON.parse(readFileSync(join(vibeHome, "rolebox-agents.json"), "utf-8")).files)
      .toEqual([{ name: "rolebox--reviewer.toml", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
  });

  it("is byte stable when unchanged and updates instructions when the role changes", () => {
    const vibeHome = temporaryDirectory();
    syncVibeAgents([role("reviewer")], { vibeHome });
    const first = readFileSync(join(vibeHome, "agents", "rolebox--reviewer.toml"), "utf-8");
    const firstStat = lstatSync(join(vibeHome, "agents", "rolebox--reviewer.toml"));

    const second = syncVibeAgents([role("reviewer")], { vibeHome });
    expect(second.written).toBe(0);
    expect(readFileSync(join(vibeHome, "agents", "rolebox--reviewer.toml"), "utf-8")).toBe(first);
    expect(lstatSync(join(vibeHome, "agents", "rolebox--reviewer.toml")).mtimeMs).toBe(firstStat.mtimeMs);

    syncVibeAgents([role("reviewer", { prompt: "Updated prompt." })], { vibeHome });
    const next = readFileSync(join(vibeHome, "agents", "rolebox--reviewer.toml"), "utf-8");
    expect(next).not.toBe(first);
    expect(next).toContain("Updated prompt.");
  });

  it("preserves unmanaged files and local edits, including managed-looking names", () => {
    const vibeHome = temporaryDirectory();
    const agentPath = join(vibeHome, "agents", "rolebox--reviewer.toml");
    mkdirSync(join(vibeHome, "agents"), { recursive: true });
    writeFileSync(agentPath, "agent_type = \"agent\"\n", "utf-8");
    writeFileSync(join(vibeHome, "agents", "my-own-agent.toml"), "instructions = \"mine\"\n", "utf-8");

    const result = syncVibeAgents([role("reviewer")], { vibeHome });

    expect(result.written).toBe(0);
    expect(result.warnings[0]).toContain("unmanaged or edited file");
    expect(readFileSync(agentPath, "utf-8")).toBe("agent_type = \"agent\"\n");
    expect(readFileSync(join(vibeHome, "agents", "my-own-agent.toml"), "utf-8")).toContain("mine");
  });

  it("removes stale owned agents and preserves stale locally edited agents", () => {
    const vibeHome = temporaryDirectory();
    syncVibeAgents([role("reviewer")], { vibeHome });
    const stalePath = join(vibeHome, "agents", "rolebox--reviewer.toml");

    const result = syncVibeAgents([], { vibeHome });
    expect(result.removed).toBe(1);
    expect(() => readFileSync(stalePath)).toThrow();

    syncVibeAgents([role("builder")], { vibeHome });
    const builderPath = join(vibeHome, "agents", "rolebox--builder.toml");
    writeFileSync(builderPath, renderVibeAgent(collectVibeAgentDescriptors([role("builder")]).agents[0]).replace("builder", "edited"), "utf-8");
    const edited = readFileSync(builderPath, "utf-8");

    const second = syncVibeAgents([role("builder", { prompt: "changed" })], { vibeHome });
    expect(second.warnings.some(warning => warning.includes("edited"))).toBe(true);
    expect(readFileSync(builderPath, "utf-8")).toBe(edited);
  });

  it("keeps project-scoped roles in the project Vibe layer", () => {
    const vibeHome = temporaryDirectory();
    const projectDir = temporaryDirectory();
    const result = syncVibeAgents([role("reviewer")], { vibeHome, projectDir });

    expect(result.agentDir).toBe(join(projectDir, ".vibe", "agents"));
    expect(result.manifestPath).toBe(join(projectDir, ".vibe", "rolebox-agents.json"));
  });

  it("does not follow an existing symlink at an agent destination directory", () => {
    const vibeHome = temporaryDirectory();
    const elsewhere = temporaryDirectory();
    symlinkSync(elsewhere, join(vibeHome, "agents"));

    const result = syncVibeAgents([role("reviewer")], { vibeHome });

    expect(result.written).toBe(0);
    expect(result.warnings[0]).toContain("not a regular directory");
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  it("refuses a malformed manifest before mutating agent files", () => {
    const vibeHome = temporaryDirectory();
    mkdirSync(vibeHome, { recursive: true });
    writeFileSync(join(vibeHome, "rolebox-agents.json"), '{"version":1,"files":[{"name":"../evil.toml","sha256":"a"}]}', "utf-8");

    expect(() => syncVibeAgents([role("reviewer")], { vibeHome })).toThrow(/Invalid Vibe rolebox agent manifest/);
  });
});
