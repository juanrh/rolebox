# rolebox — Knowledge Base Index

This directory contains a structured summary of the rolebox codebase, generated
by the codebase-summary procedure. It is designed to be the primary context file
for AI assistants answering questions about this repository.

## How to use this documentation

1. **Start here** (`index.md`) to decide which file contains the detail you need.
2. For questions about *how the system fits together*, read `architecture.md`.
3. For *what a specific module does*, read `components.md`.
4. For *public APIs, role.yaml fields, tools, CLI*, read `interfaces.md`.
5. For *data structures* (role model, graph state, memory entries), read `data_models.md`.
6. For *end-to-end processes* (install, graph run, memory), read `workflows.md`.
7. For *dependency rationale and host SDK coupling*, read `dependencies.md`.
8. For *known gaps in this summary*, read `review_notes.md`.
9. The repo-root `AGENTS.md` carries the binding working conventions for agents.

## File map

| File | Purpose | Summary |
| --- | --- | --- |
| `codebase_info.md` | Orientation | What rolebox is, stack, harness adapters, top-level structural map, key characteristics |
| `architecture.md` | System design | Kernel/host-adapter architecture, plugin composition, graph engine pipeline, durable state (SQLite), logging/events, hooks/extensions, capability gates |
| `components.md` | Module catalog | Responsibility of every `src/` module with a component map diagram; packaged assets (skills, functions, examples) |
| `interfaces.md` | APIs | Package exports, role.yaml interface, memory tools, graph worker protocol, hooks, registry, CLI, web tools, internal extension points |
| `data_models.md` | Data structures | Role model (with defaults), graph entities (plan/run/attempt/outcome/effects), memory model, project config, registry, dispatch budgets |
| `workflows.md` | Processes | Sequence/flow diagrams: install & sync, role loading, session turn, multi-agent graph run, memory workflow, team workflow, gated capabilities, build/release |
| `dependencies.md` | External packages | Runtime, peer (host SDKs), and dev dependencies with what each is used for; host version policy; dependency rules |
| `review_notes.md` | Quality | Consistency findings, completeness gaps, recommendations |

## Authoritative sources these files summarize

- `README.md` — product overview, install, feature tour
- `docs/` — ~37 feature documents (role-yaml, graph engine, memory, registry, dispatch, hooks, compatibility, project structure, …)
- `AGENTS.md` — binding agent conventions (testing policy, test path mapping, skill maintenance, privacy hygiene)
- `CONTRIBUTING.md`, `skills/rolebox-config/` — contribution and shipped-configuration guidance

## Example queries this knowledge base answers

- "Where is DSH-specific code?" → `components.md` / `architecture.md`: `src/platform/adapters/dsh/`, entry `src/entries/dsh.ts`.
- "How does a graph run commit state?" → `workflows.md` §4 and `architecture.md` §Graph engine: single-transaction commit of state + effects.
- "What fields can a role.yaml contain?" → `interfaces.md` / `data_models.md` (full reference: `docs/role-yaml.md`).
- "Which package export does pi load?" → `interfaces.md` Package public surface: `./pi` → `dist/entries/pi.js`.
- "What are the memory tool names and visibility rules?" → `interfaces.md` Memory tool interface.
