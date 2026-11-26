# Interfaces, APIs, and Integration Points

## Package public surface (package.json exports)

| Export | Entry | Consumers |
| --- | --- | --- |
| `.` | `dist/entries/opencode.js` (+ types) | opencode plugin host; also `main` |
| `./server` | `dist/entries/opencode2.js` | opencode v2 plugin host |
| `./pi` | `dist/entries/pi.js` | pi extension (`pi.extensions` manifest key) |
| `./dsh` | `dist/entries/dsh.js` | DSH/cordis plugin; bundle patch at `./dsh/cordis.patch.yml` |
| `./codex` | `dist/entries/codex.js` | Codex adapter |
| `./tui` | `dist/tui.js` | Terminal UI consumers |
| `./client` | `dist/dsh-web-client.js` | DSH web client bundle (`dsh.client` manifest: platform web, injects `@deepseek-ai/dsh-client-ui-*`) |
| `bin: rolebox` | `dist/cli/main.js` | CLI executable |

## Role definition interface (role.yaml)

The primary user-facing interface is declarative YAML (full reference:
`docs/role-yaml.md`). Key surface:

```yaml
name: string
description: string
prompt: |            # or prompt_file (mutually exclusive)
model: provider/model-id   # canonical string; provider = segment before first slash
mode: primary | subagent | all
skills: []           # rolebox/{role}/skills
opencode_skills: []  # harness global skills
functions: []        # merged on top of built-in defaults [plan, execute, loop]
disable_functions: []
memory: {inject, max_inject, min_relevance, scope, session_focus, recall, recall_mode}
references: {key: path-or-{path,description}}
subagents: [...]     # inline child roles
dispatch: {maxInputTokensPerRequest, maxOutputTokensPerRequest, maxCostPerRequest, maxInputTokensPerSession, maxCostPerSession, budgetSampleIntervalMs, backgroundStaleTimeoutMs, syncPromptTimeoutMs}
hooks: {builtin: {...}, custom: [{name, events, module, config, filter, priority, phase}]}
permission: {allow: [], deny: []}
tools: {ToolName: bool}
```

Model resolution runs the `model:` string through the model resolver against the
host model catalog (`src/platform/model-catalog/`); model aliases are documented
in `docs/model-aliases.md`.

## Memory tool interface

Exposed to roles when memory tools are granted:

| Tool | Purpose |
| --- | --- |
| `memory_recall` | Keyword search with Markdown previews; `format: "json"` for full entries |
| `memory_read` | Read a complete entry by id (Markdown or JSON) |
| `memory_list` | Browse summaries; `format/limit/offset` pagination |
| `memory_write` | Save a durable entry; optional `source_sessions` |
| `memory_update` | Revise by id, merging source sessions |

Visibility enforcement (`src/memory/visibility.ts`): `scope: workspace|role|both`;
with no active role, only workspace memories are visible and writes must be
explicitly workspace-scoped.

## Graph worker interface

- Workers submit an **outcome proposal for their own attempt** with the
  credential they were handed (`src/graph/protocol`, `docs/graph-outcome-protocol.md`).
- Acceptance judges proposals against gates pinned in the compiled plan.
- Control commands (stop, retry, approval) go through the control application
  service (`src/graph/control`).
- Host ports: dispatch adapter, execution index + identity binding, credential
  vault, completion bridge, delivery path (`src/graph/host`).
- Canonical graph tools are registered per host by `GraphApplication`
  (`src/graph/application`) via `src/platform/worker-tools/`.

## Hooks interface

Custom hooks are declared in `role.yaml` and implemented as modules:
`events` (e.g. `chat.message`, `tool.execute.before/after`, `system.transform`,
`event`), `filter` (tools, eventTypes), `priority` (lower = earlier, default 50),
`phase` (`before|after` relative to built-in). See `docs/hooks.md`.

## Registry interface (role distribution)

A registry is a Git repo (GitHub, GitLab, or plain HTTP file server) with
`registry.yaml` + `roles/<role>/{role.yaml, skills/}`. CLI: `rolebox registry
list|add|default|remove`. Built-in source: `oh-my-role`; custom sources layer on
top, never replace it. Sources may pin a branch/tag. See `docs/registry.md`.

## CLI interface

`rolebox` (citty-based, `src/cli/main.ts`), commands in `src/cli/commands/`:
`init`, `install`, `update`, `uninstall`, `list`, `search`, `status`, `info`,
`sync`, `config`, `registry`, `memory`, `monitor`, `logs`, `checkpoint`, `bench`,
`host`, `mcp`, `templates`. Docs: `docs/cli.md`.

## Web tool interface

`web_fetch` / `web_search` (`src/web/web-fetch.ts`, `web-search.ts`) with
pluggable backends (cheerio+js-yaml default; crawlee/playwright/readability/
linkedom optional peers), SSRF guard, bot detection, MIME detection. Desktop/
browser gates: `docs/browser-use.md`, `docs/computer-use.md`.

## Internal extension points

- `src/extensions/points/` — plugin assembly extension points
- `src/platform/ports/` — session, tool, event, registration contracts that every
  adapter must implement
- `src/core/service-supervisor.ts` — supervised services lifecycle
- Events flow host-native → adapter normalization (e.g. `normalizeOpencodeEvent`)
  → core event bus → hooks/graph/notification consumers.
