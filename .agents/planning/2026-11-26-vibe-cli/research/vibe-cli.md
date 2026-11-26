# Research: Mistral Vibe CLI extension surfaces

Sources (fetched 2026-11-26):
- https://docs.mistral.ai/llms/vibe/code/llms.txt (index)
- https://docs.mistral.ai/llms/vibe/code/cli/mcp-servers/llms.txt
- https://docs.mistral.ai/llms/vibe/code/cli/configuration-reference/llms.txt
- https://docs.mistral.ai/llms/vibe/code/cli/plugins/llms.txt
- https://docs.mistral.ai/llms/vibe/code/cli/skills/llms.txt

## Home and config
- Home: `~/.vibe`, overridable with `VIBE_HOME` (all state: config, prompts,
  agents, skills, logs).
- Config: `~/.vibe/config.toml`; `VIBE_<KEY>` env overrides; `strict_config`
  refuses unknown keys — a managed block must only contain documented keys.

## MCP servers (`[[mcp_servers]]`)
- stdio transport fields: `name`, `transport = "stdio"`, `command`, `args`,
  `env` (table), `startup_timeout_sec` (default 10), `tool_timeout_sec`
  (default 60), `disabled`.
- Tool names exposed as `{server_name}_{tool_name}`; per-tool permissions in
  `[tools.<name>]`.
- `vibe mcp add` / `/mcp add` are the interactive paths; direct `config.toml`
  editing is documented. No evidence that stdio child env is filtered (unlike
  Codex), so no explicit env forwarding list is required.

## Agent definition files (`~/.vibe/agents/<name>.toml` or `./.vibe/agents/`)
Keys (configuration reference "Agent definition files"): `agent_type`
("agent" user-selectable / "subagent" delegation-only), `display_name`,
`description`, `instructions` (inline prompt; appended after system prompt for
agents), `safety` (visual hint only), `system_prompt_id`, `active_model`,
`enabled_tools`, `disabled_tools`, plus most top-level config keys as overrides.
No `schema_version` key for standalone agent files (that key is required only
for plugin subagent files).

## Skills
- User-level skills live in `~/.vibe/skills/` (also `~/.agents/skills/`);
  project skills in `./.vibe/skills/`; extra dirs via `skill_paths`.
- Format: directory with `SKILL.md`, YAML frontmatter (`name`, `description`,
  `user-invocable`, ...). Symlinks are not restricted for standalone skill dirs.

## Plugins (NOT used)
- Agent Plugins 1.0 format at `~/.vibe/plugins/<name>/`: `plugin.json` +
  `mcp.json` + `skills/` + `ai.mistral.vibe/` (hooks, knowledge, agents).
- Explicitly **experimental** ("the plugin format ... will change").
- "Every path must stay inside the plugin directory. A file or symbolic link
  that resolves outside it is rejected" — breaks rolebox's symlink-based skill
  deployment.
- Decision: use the stable default locations instead.

## Session protocol
- No documented app-server/programmatic session API for workers (the docs
  describe interactive/programmatic *user* sessions only). rolebox therefore
  cannot browse/fork vibe sessions or run sandboxed graph workers through the
  host. Capabilities must declare this honestly.
