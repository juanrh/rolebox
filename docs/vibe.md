# Vibe

> Part of the rolebox documentation. See [README](../README.md) for overview.

Rolebox integrates with the Mistral Vibe CLI through its documented extension
surfaces: a stdio MCP server registered in `config.toml`, native custom-agent
files, and user-level skills. Public roles become native Vibe agents; private
children remain scoped rolebox execution targets. The MCP runtime supplies the
canonical rolebox tool set (memory, assets/references, web, hashline, signal,
terminal, plus the gated computer-use and browser families).

Vibe documents no programmatic session protocol, so session browsing, session
forks, dispatch and declared-graph execution through the host are not available
on this target; the capability set declares that honestly (see
[limitations.md](limitations.md)).

Parity is enforced by the Vibe tests: `tests/platform/vibe-platform.test.ts`
(path resolution, the registry descriptor, capabilities, registration detection
and the post-sync install step),
`tests/platform/adapters/vibe/installation/mcp-registration.test.ts` (the
managed `[[mcp_servers]]` block) and
`tests/platform/adapters/vibe/installation/agents.test.ts` (native-agent
mapping and sync), plus `tests/platform/adapters/vibe/runtime.test.ts` (tool
surface and a stdio initialize/tools/list/tools/call boot smoke over in-memory
streams). They do not establish live model behavior.

## Vibe home resolution

The Vibe home resolves as `$VIBE_HOME` when it is set and non-blank, otherwise
`~/.vibe`; a blank value is treated as unset. It is read at call time, not
captured at module load, so a redirected `VIBE_HOME` applies to the next
command.

| Path | Purpose |
|---|---|
| `$VIBE_HOME` or `~/.vibe` | Vibe home (rolebox's `configDir` for this target) |
| `{vibeHome}/rolebox` | Sync target: one symlink per installed role |
| `{vibeHome}/agents` | Generated public native-agent TOML files |
| `{vibeHome}/rolebox-agents.json` | Fingerprints of managed native-agent files |
| `{vibeHome}/skills` | User-level skills directory Vibe discovers skills from |
| `{vibeHome}/config.toml` | Host config carrying the managed MCP registration block |

As on every other harness, a `rolebox/` directory in the current working
directory takes precedence over `{vibeHome}/rolebox` when the MCP server boots.
Workspace roles generate native files under `{cwd}/.vibe/agents` and a
`{cwd}/.vibe/rolebox-agents.json` manifest; they are never exported into the
global agent directory.

## Install and use

1. Install rolebox the usual way — `npm install -g rolebox`, or run from a
   checkout that has been built with `npm run build`. The registered server
   entry is the built `dist/entries/vibe.js` artifact.
2. Run the sync target:

   ```bash
   rolebox sync vibe
   ```

3. Start (or restart) Vibe so it re-reads `{vibeHome}/config.toml` and the
   native agents; in a running session `/reload` refreshes skills and MCP
   servers. Ask Vibe to delegate using a generated public agent such as
   `rolebox--reviewer`.

`rolebox sync vibe` deploys installed roles as symlinks (the same role sync
every target gets), prints the usual `Synced N roles to vibe` line, registers
the MCP server, then reports `Vibe MCP server: registered in <config path>`
and the public/private agent counts.

A registered server entry that does not exist (a source checkout that was
never built) does not fail the sync: the block is still written and a warning
names the missing `dist/entries/vibe.js` path and suggests `npm run build`.

## What `rolebox sync vibe` writes

| Path | Contents |
|---|---|
| `{vibeHome}/rolebox/<role>` | Symlink per installed role pointing at its shared source |
| `{vibeHome}/config.toml` | Exactly one managed `[[mcp_servers]]` block (below) |
| `{vibeHome}/agents/rolebox--<role-id>.toml` | Native public role: `agent_type`, `display_name`, `description`, `instructions`, optional `active_model` |
| `{vibeHome}/rolebox-agents.json` | Managed filenames and content fingerprints |
| `{vibeHome}/skills` | Created if missing; role skills deploy here as symlinks |

The managed block written to `config.toml` is:

```toml
# >>> rolebox (managed) — do not edit; `rolebox sync vibe` rewrites this block >>>
[[mcp_servers]]
name = "rolebox"
transport = "stdio"
command = "node"
args = ["<absolute path to dist/entries/vibe.js>"]
startup_timeout_sec = 60
tool_timeout_sec = 600
# <<< rolebox (managed) <<<
```

The block is comment-delimited and idempotent: re-running the sync replaces it
in place (byte-identical when unchanged), repairs duplicate blocks, and never
touches any other byte of the user's file. A stray start marker without an end
marker is refused with instructions instead of producing a duplicate table.
Only documented `[[mcp_servers]]` keys are used, so a `strict_config = true`
configuration stays valid.

## Native agent mapping

Only public roles become native Vibe agent files; private children stay
rolebox-internal and appear only in the parent's instructions roster. The
mapping is idempotent and preserves unmanaged files, symlinks and local edits:
a generated agent is updated or removed only while its content matches the
recorded fingerprint, and a collision or edited stale file is preserved with a
warning. Edit `role.yaml`, sync again, and restart Vibe rather than editing
generated TOML.

- `display_name` ← role `name` (falls back to the role ID)
- `description` ← role `description` (falls back to a run-the-role line)
- `instructions` ← role prompt plus a mapping block: the canonical rolebox
  agent ID, the note that Vibe inherits approvals/permissions/models from the
  session, and the private-child roster
- `active_model` ← the role `model` when it is a bare Vibe model ID or
  `[[models]]` alias; a provider-qualified `provider/model` value cannot be
  projected and warns instead
- Sampling parameters (`temperature`, `top_p`) and model variants are not
  exposed by Vibe agent files; they warn and are omitted.

## The MCP tool surface

The server started from `dist/entries/vibe.js` (package export `./vibe`) boots
the standard role runtime for `platformId: vibe`, syncs skill symlinks and
native agents, then serves the canonical intersection tool set over
newline-framed JSON-RPC 2.0 on stdio: `hashline_read`/`hashline_edit`,
`memory_*`, `web_search`/`web_read`/`web_fetch`, `signal`,
`interactive_terminal`, `asset_*`/`reference_search`/`load_reference`,
`load_role_skill`, plus the `computer_*` and `browse_*` families when their
gates enable them. Session tools (`session_*`), dispatch and the graph tools
are not registered: Vibe supplies no session protocol for them. Tool names are
prefixed by the server name, so Vibe exposes them as `rolebox_<tool>`.

MCP metadata cannot identify which native agent made a call, so role-scoped
asset tools run without per-session role attribution on this host; the
generated agent instructions carry the role identity instead.

## Capabilities

`vibeCapabilities` (`src/platform/capabilities.ts`): `hasAgentFileSync` and
`hasMultiStepTools` are true; every session-execution flag
(`hasBackgroundTasks`, `hasSessionFork`, `hasSessionCreate`,
`hasSessionAbort`, `hasEventStream`, `hasSessionStatus`, `hasRoleSwitch`) is
false. Delegation through rolebox's dispatch or graph engine is therefore not
available on Vibe; ask the native agent directly instead.

## Models

Vibe selects models through `[[models]]` presets and `active_model` in
`config.toml`. rolebox has no TOML reader, so the vibe sync target is served
from the opencode model catalog seed, exactly like the Codex target. Configure
models with `rolebox config <role-name>` as usual.

## Troubleshooting

- **Tools missing after sync** — restart Vibe or run `/reload`; MCP servers
  reconnect when a session starts, resumes or reloads.
- **Agent not in the picker** — check `enabled_agents`/`disabled_agents`
  patterns in `config.toml`, and that the role is public.
- **Registration warning about a missing entry** — run `npm run build` in the
  rolebox checkout (or reinstall the package), then `rolebox sync vibe` again.
