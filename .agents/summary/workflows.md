# Key Workflows

## 1. Installing and using a role

```mermaid
sequenceDiagram
    participant User
    participant CLI as rolebox CLI (src/cli)
    participant FS as rolebox dirs
    participant Host as Harness (opencode/pi/dsh/codex)
    User->>CLI: rolebox init / install <role> / registry add <repo>
    CLI->>FS: fetch role from registry source (oh-my-role + custom)
    CLI->>FS: write role.yaml, skills, prompts under rolebox dirs
    CLI->>Host: sync agent files + skill symlinks (src/sync)
    Host->>Host: load plugin entry (src/entries/<host>.ts)
    Host->>Host: resolveRoleboxDirectories, load roles, register agents
    User->>Host: pick role (chip/switcher) and chat
```

Installation is per-workspace; roles resolve from the rolebox directory
configuration (`docs/directory-structure.md`, `docs/configuration.md` topics in
the packaged skill).

## 2. Role loading and prompt assembly

```mermaid
flowchart TB
    A[role.yaml on disk] --> B[role-loader parses + validates]
    B --> C[Apply capability gates: browse / computer-use]
    C --> D[Resolve model against host catalog]
    D --> E[prompt assembly (src/prompt)]
    E --> F[role prompt + memory summaries + workflow guidance + available assets]
    F --> G[Register agent, skills, functions, hooks with host]
```

## 3. Session turn with role active

```mermaid
sequenceDiagram
    participant U as User
    participant H as Host adapter
    participant K as Kernel (core/event-bus)
    participant M as Memory store
    participant Tools as Role tools
    U->>H: message
    H->>K: normalized event (chat.message)
    K->>M: DSH: build turn recall block / session focus
    K->>Tools: tool.execute.before hooks
    Tools-->>K: results
    K->>Tools: tool.execute.after hooks
    K->>H: errors trigger recovery strategies (src/recovery)
    H-->>U: response
```

## 4. Multi-agent graph run

```mermaid
sequenceDiagram
    participant S as Declaring session
    participant C as Compiler
    participant P as Plan
    participant L as Ledger/Store (SQLite)
    participant W as Dispatched worker
    participant A as Acceptance core
    S->>C: declare graph (v3)
    C->>P: compile (preflight, structural guard)
    S->>L: start/resume run (control service)
    L->>W: dispatch intent committed, then delivery
    W->>W: run commands in platform sandbox
    W->>A: propose outcome for own attempt
    A->>A: judge against pinned gates
    A->>L: single commit: state + effects (next dispatch intents, notifications)
    L-->>S: notifications delivered after commit
    Note over A,L: Controls: stop, retry, approval (control application service)
```

Key invariants: one-directional pipeline (declaration → plan → run → attempt →
proposal → acceptance → effects); dispatch is a durable intent before execution;
the kernel never starts an execution on its own; approvals are decided by the
named approver while the authorizing policy is installed.

## 5. Persistent memory workflow

1. Before repeating research, `memory_recall` by keywords.
2. `memory_read` the full entry by id; verify it still applies.
3. `memory_write` new durable decisions/preferences/facts/lessons (with
   `source_sessions` provenance) or `memory_update` by id.
4. Consolidation function (`functions: [memory]`) available in ordinary
   OpenCode/Pi sessions; in DSH, request consolidation directly.
5. Search or browse before creating a near-duplicate; preserve unresolved
   disagreements rather than overwriting.

## 6. Engineering-team workflow

`examples/review-team*/`, `examples/team-lead/`: a lead role declares a graph
dispatching specialist subagents (code-reviewer, tech-writer, etc.) with per-role
budgets; outcomes are accepted against the plan's gates. `src/team/` provides the
team runtime, store, and tools; `src/loop/` supports repeatable loops.

## 7. Capability-gated tools

`browse` and `computer` tools activate only when the grant and project config
allow it (`src/loader/*-gate.ts`). Computer-use uses per-OS drivers
(`src/computer/drivers/{darwin,linux,win32}/`) whose scripts are inlined by the
build. Browser-use has pluggable fetch backends (default cheerio/turndown;
optional crawlee/playwright).

## 8. Build and release workflow

- Build: `npm run build` → `scripts/build-all.ts` (esbuild-based) → `dist/`
  (library, TUI, dsh web client, entry aliases).
- Release: manual; no tag-triggered publish. `prepack` rewrites README links to
  absolute for npm; `postpack` restores relative.
- Host version policy: devDependencies track published channels; daily
  `host-versions.yml` workflow fails on drift; `npm run update:hosts` bumps.
