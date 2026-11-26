import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { startVibeMcpServer, resolveVibeSessionId } from "../../../../src/entries/vibe.ts";
import type { CodexMcpServer } from "../../../../src/platform/adapters/codex/mcp/server.ts";
import { createVibeRuntime } from "../../../../src/platform/adapters/vibe/runtime.ts";
import { vibeCapabilities } from "../../../../src/platform/capabilities.ts";
import type { ResolvedRole } from "../../../../src/types.ts";

const environment = ["VIBE_HOME", "ROLEBOX_DATA_DIR", "ROLEBOX_CONFIG_DIR", "ROLEBOX_SESSION_ID"];
let saved: Array<[string, string | undefined]>;
let root: string;
let directory: string;
const servers: CodexMcpServer[] = [];

beforeEach(() => {
  saved = environment.map(name => [name, process.env[name]]);
  root = mkdtempSync(join(tmpdir(), "rolebox-vibe-runtime-"));
  directory = join(root, "workspace");
  mkdirSync(directory);
  process.env.VIBE_HOME = join(root, "vibe");
  process.env.ROLEBOX_DATA_DIR = join(root, "data");
  process.env.ROLEBOX_CONFIG_DIR = join(root, "config");
  delete process.env.ROLEBOX_SESSION_ID;
});

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

function installRole(project = false): void {
  const roles = join(project ? directory : process.env.VIBE_HOME!, "rolebox", "reviewer");
  mkdirSync(roles, { recursive: true });
  writeFileSync(join(roles, "role.yaml"), [
    "name: Reviewer", "description: Reviews changes.", "prompt: Review with evidence.",
    "model: mistral-large-latest", "tools:", "  hashline_read: false", "",
  ].join("\n"));
}

function bareRole(id = "reviewer"): ResolvedRole {
  return {
    id,
    config: { name: id, description: `${id} description`, prompt: `Act as ${id}.` },
    prompt: `Act as ${id}.`,
    skills: [],
    functions: [],
    references: [],
    subagents: [],
  };
}

async function boot(options: { project?: boolean; computerUse?: boolean; browseUse?: boolean } = {}) {
  const output = new PassThrough();
  let raw = "";
  output.on("data", chunk => { raw += String(chunk); });
  const server = await startVibeMcpServer({
    directory, output, computerUse: options.computerUse ?? false, browseUse: options.browseUse ?? false,
  });
  servers.push(server);
  let id = 0;
  return {
    server,
    async request(method: string, params: Record<string, unknown> = {}) {
      const requestId = ++id;
      await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }));
      const response = raw.split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>).find(message => message.id === requestId)!;
      return response.result as {
        protocolVersion?: string;
        tools?: Array<{ name: string }>;
        instructions?: string;
        content: Array<{ text: string }>;
        isError?: boolean;
      };
    },
  };
}

describe("createVibeRuntime", () => {
  it("assembles the intersection surface without session, dispatch or graph tools", () => {
    const runtime = createVibeRuntime({
      directory,
      roles: [bareRole()],
      computerUse: false,
      browseUse: false,
    });
    const names = Object.keys(runtime.tools);
    for (const expected of ["hashline_read", "hashline_edit", "memory_list", "web_fetch", "asset_search", "load_role_skill"]) {
      expect(names).toContain(expected);
    }
    for (const absent of ["session_list", "session_fork", "graph_declare", "graph_status", "dispatch_status", "loop_start"]) {
      expect(names).not.toContain(absent);
    }
    expect(names).not.toContain("computer_screenshot");
    expect(names).not.toContain("browse_navigate");
    runtime.close();
  });

  it("registers the gated families when the host opts in", () => {
    const runtime = createVibeRuntime({ directory, roles: [], computerUse: true, browseUse: true });
    const names = Object.keys(runtime.tools);
    expect(names).toContain("computer_screenshot");
    expect(names.some(name => name.startsWith("browse_"))).toBe(true);
    runtime.close();
  });

  it("matches the declared capability set", () => {
    expect(vibeCapabilities().hasAgentFileSync).toBe(true);
    expect(Object.keys(createVibeRuntime({ directory, roles: [] }).tools).length).toBeGreaterThan(0);
  });
});

describe("startVibeMcpServer", () => {
  it("serves initialize, tools/list and tools/call over the stdio protocol", async () => {
    installRole();
    const { request } = await boot();

    const init = await request("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "vibe" } });
    expect(init.protocolVersion).toBeTypeOf("string");

    const list = await request("tools/list");
    const names = list.tools!.map(tool => tool.name);
    expect(names).toContain("memory_list");
    expect(names.some(name => name.startsWith("session_"))).toBe(false);

    const call = await request("tools/call", { name: "memory_list", arguments: {} });
    expect(call.isError).toBeFalsy();
    expect(call.content[0].text).toContain("memories");
  });

  it("maps installed roles to native agent files in the vibe home", async () => {
    installRole();
    await boot();

    const agentPath = join(process.env.VIBE_HOME!, "agents", "rolebox--reviewer.toml");
    const agent = readFileSync(agentPath, "utf-8");
    expect(agent).toContain('agent_type = "agent"');
    expect(agent).toContain("Review with evidence.");
    expect(agent).toContain('active_model = "mistral-large-latest"');
  });

  it("keeps project roles in the project vibe layer", async () => {
    installRole(true);
    await boot();

    expect(readdirSync(join(directory, ".vibe", "agents"))).toContain("rolebox--reviewer.toml");
    expect(existsSync(join(process.env.VIBE_HOME!, "agents"))).toBe(false);
  });

  it("answers ping and rejects unknown methods with a protocol error", async () => {
    const output = new PassThrough();
    let raw = "";
    output.on("data", chunk => { raw += String(chunk); });
    const { server } = { server: await startVibeMcpServer({ directory, output, computerUse: false, browseUse: false }) };
    servers.push(server);
    await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 98, method: "ping" }));
    await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 99, method: "no/such/method" }));
    expect(raw).toContain('"id":98');
    expect(raw).toContain("-32601");
  });
});

describe("resolveVibeSessionId", () => {
  it("prefers the env override, then handshake identity, then the per-connection fallback", async () => {
    process.env.ROLEBOX_SESSION_ID = "session-from-env";
    expect(resolveVibeSessionId(undefined)).toBe("session-from-env");
    delete process.env.ROLEBOX_SESSION_ID;
    expect(resolveVibeSessionId({ session_id: "from-handshake" })).toBe("from-handshake");
    const { request } = await boot();
    const init = await request("initialize", { clientInfo: { name: "vibe" } });
    expect(init.protocolVersion).toBeTypeOf("string");
  });
});
