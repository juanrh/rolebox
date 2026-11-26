import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  VIBE_MANAGED_END,
  VIBE_MANAGED_MARKERS,
  VIBE_MANAGED_START,
  buildVibeMcpServerBlock,
  registerVibeMcpServer,
  unregisterVibeMcpServer,
  vibeConfigPath,
} from "../../../../../src/platform/adapters/vibe/installation/mcp-registration.ts";

// Every config path this file touches lives in a mkdtemp directory — a real
// ~/.vibe is never read or written.

let dir: string;

function configPath(): string {
  return vibeConfigPath(dir);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rolebox-vibe-mcp-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const entry = (): string => join(dir, "dist", "entries", "vibe.js");

describe("buildVibeMcpServerBlock", () => {
  it("renders the documented stdio server fields", () => {
    const block = buildVibeMcpServerBlock(entry());
    expect(block.split("\n")).toEqual([
      VIBE_MANAGED_START,
      "[[mcp_servers]]",
      'name = "rolebox"',
      'transport = "stdio"',
      'command = "node"',
      `args = ["${entry().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
      "startup_timeout_sec = 60",
      "tool_timeout_sec = 600",
      VIBE_MANAGED_END,
    ]);
  });

  it("escapes quotes and backslashes in the server entry", () => {
    const tricky = join(dir, 'we"ird\\path');
    const block = buildVibeMcpServerBlock(tricky);
    const argsLine = block.split("\n").find((line) => line.startsWith("args = "));
    expect(argsLine).toContain('\\\\');
    expect(argsLine).toContain('\\"');
  });
});

describe("registerVibeMcpServer / unregisterVibeMcpServer", () => {
  it("creates a missing config.toml containing only the managed block", () => {
    const path = configPath();
    const { changed } = registerVibeMcpServer(path, entry());

    expect(changed).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe(`${buildVibeMcpServerBlock(entry())}\n`);
  });

  it("appends the block after a single blank line and preserves the existing bytes", () => {
    const path = configPath();
    const foreign = 'theme = "mistral-dark"\n';
    writeFileSync(path, foreign, "utf-8");

    registerVibeMcpServer(path, entry());

    const next = readFileSync(path, "utf-8");
    expect(next).toBe(
      `${foreign}\n${buildVibeMcpServerBlock(entry())}\n`,
    );
  });

  it("adds exactly one leading newline when the file lacks a trailing one", () => {
    const path = configPath();
    writeFileSync(path, 'theme = "mistral-dark"', "utf-8");

    registerVibeMcpServer(path, entry());

    expect(readFileSync(path, "utf-8")).toBe(
      `theme = "mistral-dark"\n${buildVibeMcpServerBlock(entry())}\n`,
    );
  });

  it("re-registers in place — a second call is byte-identical and reports unchanged", () => {
    const path = configPath();
    registerVibeMcpServer(path, entry());
    const first = readFileSync(path, "utf-8");

    const { changed } = registerVibeMcpServer(path, entry());

    expect(changed).toBe(false);
    expect(readFileSync(path, "utf-8")).toBe(first);
  });

  it("replaces the block in place when the server entry changes", () => {
    const path = configPath();
    const foreign = "[tools.read_file]\npermission = \"ask\"\n";
    writeFileSync(path, foreign, "utf-8");
    registerVibeMcpServer(path, entry());
    const otherEntry = join(dir, "dist", "entries", "other.js");

    registerVibeMcpServer(path, otherEntry);

    const next = readFileSync(path, "utf-8");
    expect(next).toContain(otherEntry);
    expect(next).not.toContain(`"${entry()}"`);
    expect(next.startsWith(foreign)).toBe(true);
  });

  it("repairs duplicate managed blocks down to one", () => {
    const path = configPath();
    const block = buildVibeMcpServerBlock(entry());
    writeFileSync(path, `${block}\n\n${block}\n`, "utf-8");

    registerVibeMcpServer(path, entry());

    const next = readFileSync(path, "utf-8");
    expect(next.match(/# >>> rolebox \(managed\)/g)?.length).toBe(1);
    expect(next).toContain(block);
  });

  it("preserves unrelated tables and comments verbatim and restores the original bytes on unregister", () => {
    const path = configPath();
    const foreign = [
      "# user comment",
      'default_agent = "accept-edits"',
      "",
      "[[mcp_servers]]",
      'name = "fetch_server"',
      'transport = "stdio"',
      'command = "uvx"',
      'args = ["mcp-server-fetch"]',
      "",
    ].join("\n");
    writeFileSync(path, foreign, "utf-8");

    registerVibeMcpServer(path, entry());
    const registered = readFileSync(path, "utf-8");
    expect(registered.startsWith(foreign)).toBe(true);

    const { changed } = unregisterVibeMcpServer(path);
    expect(changed).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe(foreign);
  });

  it("restores a file that lacked a trailing newline byte for byte on unregister", () => {
    const path = configPath();
    const foreign = 'theme = "mistral-dark"';
    writeFileSync(path, foreign, "utf-8");
    registerVibeMcpServer(path, entry());

    unregisterVibeMcpServer(path);

    expect(readFileSync(path, "utf-8")).toBe(foreign);
  });

  it("unregister is a no-op when the file has no managed block", () => {
    const path = configPath();
    const foreign = 'theme = "auto"\n';
    writeFileSync(path, foreign, "utf-8");

    expect(unregisterVibeMcpServer(path).changed).toBe(false);
    expect(readFileSync(path, "utf-8")).toBe(foreign);
  });

  it("unregister is a no-op when config.toml does not exist", () => {
    const path = configPath();
    expect(unregisterVibeMcpServer(path).changed).toBe(false);
    expect(existsSync(path)).toBe(false);
  });

  it("refuses a stray start marker without an end marker", () => {
    const path = configPath();
    writeFileSync(path, `${VIBE_MANAGED_START}\nname = "x"\n`, "utf-8");

    expect(() => registerVibeMcpServer(path, entry())).toThrow(/stray start marker/i);
  });

  it("ignores the markers when they appear inside TOML strings", () => {
    const path = configPath();
    const foreign =
      `instructions = "${VIBE_MANAGED_START} ${VIBE_MANAGED_END}"\n` +
      "title = '''\n" +
      `${VIBE_MANAGED_START}\n` +
      "'''\n";
    writeFileSync(path, foreign, "utf-8");

    registerVibeMcpServer(path, entry());
    const registered = readFileSync(path, "utf-8");

    expect(registered.startsWith(foreign)).toBe(true);
    unregisterVibeMcpServer(path);
    expect(readFileSync(path, "utf-8")).toBe(foreign);
  });

  it("round-trips: register -> unregister -> register yields the same file", () => {
    const path = configPath();
    const foreign = 'theme = "auto"\n';
    writeFileSync(path, foreign, "utf-8");

    registerVibeMcpServer(path, entry());
    const first = readFileSync(path, "utf-8");
    unregisterVibeMcpServer(path);
    registerVibeMcpServer(path, entry());

    expect(readFileSync(path, "utf-8")).toBe(first);
  });

  it("honours the runtimeCommand override", () => {
    const path = configPath();
    registerVibeMcpServer(path, entry(), { runtimeCommand: "node26" });
    expect(readFileSync(path, "utf-8")).toContain('command = "node26"');
  });
});

it("VIBE_MANAGED_MARKERS match the block builder's delimiters", () => {
  const block = buildVibeMcpServerBlock(entry());
  expect(block.split("\n")[0]).toBe(VIBE_MANAGED_MARKERS.start);
  expect(block.split("\n").at(-1)).toBe(VIBE_MANAGED_MARKERS.end);
});
