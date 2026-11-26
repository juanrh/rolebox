# Implementation plan: Vibe CLI support

## Checklist

- [ ] Step 1: Shared managed-config-block module + codex refactor
- [ ] Step 2: Vibe paths, capabilities, constants, model source
- [ ] Step 3: Vibe MCP registration module
- [ ] Step 4: Vibe native agent sync
- [ ] Step 5: Vibe runtime + entry point + package export
- [ ] Step 6: Registry descriptor + CLI wiring
- [ ] Step 7: Documentation
- [ ] Step 8: Full verification pass

## Working agreements

Proceed step by step:

- After each step, ask me for confirmation before completing it
- When completing a step, add an "Implementation notes" subsection to its section in the plan, summarizing what we did, focusing on deviations from the plan, why we made them, and implications for subsequent steps

(This task runs unattended; the confirmation pauses are waived — each step is
completed back-to-back with a commit per step, and the notes record what was
done.)

Build/test commands: `npm run typecheck`, `npm test` (full), plus targeted
vitest runs per step. Never touch a real `~/.vibe` in tests.

## Step 1: Shared managed-config-block module + codex refactor

Objective: extract the managed TOML block utilities from
`src/platform/adapters/codex/installation/plugin-bundle.ts` into
`src/platform/managed-config-block.ts` with parameterized markers, and make
the codex module delegate to it with byte-identical behavior.

Guidance: move `escapeTomlString`, `findManagedRegions` (with its string-state
helpers) and the register/unregister algorithms; keep the codex public API
(`registerCodexPlugin`, `unregisterCodexPlugin`, `escapeTomlString`) unchanged.

Tests: the existing `tests/cli/codex-sync.test.ts` suite must pass unchanged —
it pins the byte-level behavior. Run it targeted.

Integration: none yet (pure refactor).

Demo: `npm test -- tests/cli/codex-sync.test.ts` green.

## Step 2: Vibe paths, capabilities, constants, model source

Objective: the "single-entry" plumbing — `vibePlatformPaths()` (VIBE_HOME),
`vibeCapabilities()`, `SyncTarget.Vibe`, `MODEL_SOURCES[SyncTarget.Vibe] =
{ seed: SyncTarget.Opencode }`.

Tests: new `tests/platform/vibe-platform.test.ts` covering paths (set/blank/
unset/call-time), capabilities, constants membership.

Demo: targeted test run green; `npm run typecheck` green (the exhaustive
`MODEL_SOURCES` record proves the wiring).

## Step 3: Vibe MCP registration module

Objective: `src/platform/adapters/vibe/installation/mcp-registration.ts` —
managed `[[mcp_servers]]` block builder, `registerVibeMcpServer`,
`unregisterVibeMcpServer`, over the shared Step-1 helpers.

Tests: `tests/platform/adapters/vibe/installation/mcp-registration.test.ts`
mirroring the codex register/unregister cases (create, append, idempotent,
repair duplicates, unregister round-trip, markers in strings).

Demo: targeted test run green.

## Step 4: Vibe native agent sync

Objective: `src/platform/adapters/vibe/installation/agents.ts` —
`vibeAgentName`, `collectVibeAgentDescriptors`, `renderVibeAgent`,
`syncVibeAgents` with fingerprint manifest, atomic writes, edit preservation,
project-dir scoping.

Tests: `tests/platform/adapters/vibe/installation/agents.test.ts`.

Demo: targeted test run green.

## Step 5: Vibe runtime + entry point + package export

Objective: `createVibeRuntime` (canonical tools + gates + `load_role_skill`),
`src/entries/vibe.ts` (`startVibeMcpServer`, `main`, session-id resolution,
instructions), `package.json` export `./vibe`.

Tests: `tests/platform/adapters/vibe/runtime.test.ts` — tool surface
membership (no session/graph/dispatch tools) and an in-memory stdio smoke test
(initialize → tools/list → tools/call memory_list).

Demo: targeted test run green; `npm run build` produces `dist/entries/vibe.js`.

## Step 6: Registry descriptor + CLI wiring

Objective: `vibeDescriptor` in `src/platform/registry.ts` (paths, capabilities,
`postSync: syncVibeTarget`, `detectIntegration`), `syncVibeTarget` in
`src/platform/adapters/vibe/installation/sync.ts`, sync/CLI description
strings, adapter barrel export.

Tests: extend `tests/platform/vibe-platform.test.ts` (descriptor, detection,
postSync writing block + agents into a redirected VIBE_HOME).

Demo: `VIBE_HOME=$(mktemp -d) node dist/cli… rolebox sync vibe` smoke or the
equivalent test-level call.

## Step 7: Documentation

Objective: `docs/vibe.md` (install/use, layout, managed block, agent mapping,
capabilities and limitations), updates to `docs/compatibility.md`,
`docs/limitations.md` (if it enumerates harnesses), README harness table and
mentions, `CHANGELOG.md`, `AGENTS.md` path table entries line.

Demo: docs render coherently; grep shows no stale "opencode | pi | dsh |
codex"-only target lists.

## Step 8: Full verification pass

Objective: `npm run typecheck`, full `npm test`, `npm run build`; fix fallout;
re-run ponytail review (final round); ensure no unrelated changes in the diff.

Demo: all green on a clean tree.
