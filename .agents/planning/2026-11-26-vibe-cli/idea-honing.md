# Idea honing

This task runs fully unattended (skill: unattended-coding), so requirements were
clarified by research and repo evidence instead of user Q&A. Decisions:

**Q1: What does "same level of support as opencode" mean for a CLI host?**
OpenCode is the reference host with an in-process plugin API; rolebox reaches
its full CLI-only parity through the Codex target (native agent files, MCP
server, config registration, skills, registry descriptor, capabilities, tests,
docs). Vibe support is scoped to Codex parity. Vibe documents no programmatic
session/app-server protocol, so host-driven session execution (session browse,
fork, sandboxed graph workers) is out of scope and declared as a limitation —
the same honest capability-based degradation the repo applies elsewhere.

**Q2: Which Vibe extension surfaces does rolebox use?**
- MCP stdio server registered as a managed `[[mcp_servers]]` block in
  `~/.vibe/config.toml` (documented, stable).
- Native agent files in `~/.vibe/agents/` (documented user-level agents).
- User-level skills in `~/.vibe/skills/` (documented).
- `VIBE_HOME` overrides `~/.vibe` (documented).
Plugins (Agent Plugins 1.0) are explicitly experimental and reject symlinks
resolving outside the plugin directory, so they are NOT used.

**Q3: Sync target id and naming?**
`vibe`; server entry `dist/entries/vibe.js`; package export `./vibe`;
native agents named `rolebox--<role-id>` (same convention as Codex).

**Q4: Model mapping?**
Vibe resolves models by `[[models]]` alias / built-in model ID via
`active_model`. Only bare model IDs are projected into agent files;
provider-qualified models warn and are omitted (mirrors Codex mapping).
`MODEL_SOURCES` gets a seed-only entry like Codex (rolebox has no TOML reader).

**Q5: Delivery?**
Branch + pull request to juanrh/rolebox with PDD artifacts and implementation.
