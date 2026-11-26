# Summary — Vibe CLI support for rolebox

## Artifacts created

- `.agents/planning/2026-11-26-vibe-cli/rough-idea.md` — the starting request
- `.agents/planning/2026-11-26-vibe-cli/idea-honing.md` — decisions (unattended)
- `.agents/planning/2026-11-26-vibe-cli/research/` — Vibe CLI extension surfaces; rolebox integration points
- `.agents/planning/2026-11-26-vibe-cli/design/detailed-design.md` — standalone design
- `.agents/planning/2026-11-26-vibe-cli/implementation/plan.md` — 8-step plan + notes (all steps checked)

## Implementation (one commit per step)

1. `src/platform/managed-config-block.ts` — shared managed TOML block machinery, extracted from the Codex plugin-bundle writer (Codex behavior byte-identical, its tests unchanged and green).
2. `vibePlatformPaths` (`$VIBE_HOME`/`~/.vibe`), `vibeCapabilities`, `SyncTarget.Vibe`, `MODEL_SOURCES` seed entry.
3. `src/platform/adapters/vibe/installation/mcp-registration.ts` — managed `[[mcp_servers]]` stdio block in `~/.vibe/config.toml`.
4. `src/platform/adapters/vibe/installation/agents.ts` — native agent TOML sync with fingerprint manifest.
5. `src/platform/adapters/vibe/runtime.ts` + `src/entries/vibe.ts` + `./vibe` package export.
6. Registry descriptor (paths, capabilities, `postSync`, registration detection) + CLI wiring.
7. `docs/vibe.md` + compatibility/limitations/README/CHANGELOG/AGENTS updates.
8. Full verification + registry-fixture test updates.

## Verification

- `npm run typecheck` (all three tsconfigs) green; `npm run build` emits `dist/entries/vibe.js`.
- New suites green: `tests/platform/vibe-platform.test.ts`, `tests/platform/adapters/vibe/{installation/*,runtime}.test.ts`.
- Full suite: identical failure set on a clean tree and on this branch (49 pre-existing failures in 8 process/FFI/TUI files — sandbox Node 22 vs the repo's required Node 26.4+); no regressions.

## Review

Ponytail review ran two rounds: one should-fix applied (duplicate capability assertion removed); round 2 verdict "Ship".

## Next steps / refinement areas

- If Mistral documents a programmatic Vibe session protocol later, a session adapter can lift the no-session limitation the same way the Codex app-server adapter did.
- The experimental Agent Plugins 1.0 format could replace the config.toml block once stable (rejected today: experimental + symlink restriction).
