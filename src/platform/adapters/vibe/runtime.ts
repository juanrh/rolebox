/**
 * Vibe runtime — assembles the canonical tool surface served to Vibe over
 * the stdio MCP transport.
 *
 * Vibe documents no programmatic session protocol, so no session client,
 * dispatch adapter or graph host exists for this platform: the tool set is
 * the canonical intersection plus the gated computer-use/browser families
 * and `load_role_skill`, exactly what `vibeCapabilities` declares.
 */

import type { ResolvedRole } from "../../../types.ts";
import { createLoadRoleSkillTool } from "../../../asset/skill-tool.ts";
import { buildCanonicalTools } from "../../tool-assembly.ts";
import { vibeCapabilities } from "../../capabilities.ts";
import type { CanonicalToolDef } from "../../types.ts";

export interface VibeRuntimeOptions {
  directory: string;
  roles: readonly ResolvedRole[];
  computerUse?: boolean;
  browseUse?: boolean;
}

export function createVibeRuntime(options: VibeRuntimeOptions) {
  const tools: Record<string, CanonicalToolDef> = buildCanonicalTools({
    directory: options.directory,
    resolvedRoles: [...options.roles],
    capabilities: vibeCapabilities(),
    computerUse: options.computerUse,
    browseUse: options.browseUse,
    extraTools: { load_role_skill: createLoadRoleSkillTool([...options.roles]) },
  });
  return {
    tools,
    close() {},
  };
}
