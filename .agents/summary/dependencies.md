# Dependencies

## Runtime dependencies

| Dependency | Usage |
| --- | --- |
| `citty` | CLI framework for `rolebox` (`src/cli/main.ts`) |
| `zod` (4.x) | Schema validation (CLI inputs, config) |
| `js-yaml` | Role YAML parsing (`role.yaml`, `registry.yaml`) |
| `fast-glob` | File discovery for roles/skills/assets |
| `cheerio` | HTML parsing in web fetch pipeline |
| `turndown` + `turndown-plugin-gfm` | HTML → Markdown conversion |
| `ws` | WebSocket server/client (dsh web client, monitoring) |
| `@clack/prompts` | Interactive CLI prompts |
| `@fontsource/space-grotesk` | TUI/web client font |
| `node-pty` (optional) | Pseudo-terminal support for terminal integration |

## Peer dependencies (host-coupled, all optional)

| Dependency | Used by |
| --- | --- |
| `@opencode-ai/plugin` (^1.3), `@opencode/plugin` (^2.0.18) | opencode adapters (two major plugin SDKs) |
| `@earendil-works/pi-coding-agent` | pi extension host |
| `@deepseek-ai/cordis` (4.0.2) | DSH plugin host (bundle patch `dsh/cordis.patch.yml`) |
| `@opentui/core`, `@opentui/solid`, `solid-js` | TUI rendering |
| `playwright` | Browser automation backend |
| `crawlee` | Alternative fetch backend |
| `@mozilla/readability`, `linkedom` | Readability extraction backend |

Host `@deepseek-ai/dsh-*` packages (agent, session, skill, subagent, tools, …)
are devDependencies tracking the `next` channel; the engine field requires
`dsh >= 0.2.1-alpha.3`. The compatibility matrix is `docs/compatibility.md`;
the policy table lives in `scripts/host-versions.ts` with `npm run check:hosts`
/ `update:hosts`.

## Dev dependencies (notable)

| Dependency | Usage |
| --- | --- |
| `typescript` 5.7+, `tsx` | Typechecking and running `.ts` scripts directly |
| `vitest` 4 | Test framework with isolated fork workers |
| `esbuild` | Build tooling behind `scripts/build-*.ts` |
| `@babel/*`, `babel-preset-solid`, `babel-plugin-module-resolver` | Solid/TUI transform (`scripts/solid-transform.ts`) |
| `semver` | Host version channel checking |
| `yaml` | Additional YAML tooling in scripts/tests |
| `@resvg/resvg-js` | Asset rendering (`scripts/render-assets.mjs`) |
| `playwright` (dev) | E2E tests (`scripts/test-browse-e2e.ts`) |

## Node engine constraints

- `node >= 26.4.0` — required by `engines`.
- Tests run with `node --experimental-ffi --import tsx scripts/test.ts`.
- `opencode ^1.0.0` and `dsh >= 0.2.1-alpha.3` engine fields declare supported hosts.

## Dependency rules observed in the repo

- Host SDK details stay inside their adapter (`src/platform/adapters/<host>/`);
  kernel code imports only the shared platform layer.
- No barrels for path shortening — direct imports between implementation modules.
- Published package contents are limited to `dist/`, `dsh/`, `examples/`,
  `functions/`, `skills/` (the `files` field).
- The shipped configuration skill (`skills/rolebox-config/`) must stay
  self-contained — its references must not rely on a source checkout.
