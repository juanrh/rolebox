/**
 * Vibe platform adapters — barrel export.
 */

export {
  VIBE_MANAGED_END,
  VIBE_MANAGED_MARKERS,
  VIBE_MANAGED_START,
  buildVibeMcpServerBlock,
  registerVibeMcpServer,
  unregisterVibeMcpServer,
  vibeConfigPath,
} from "./installation/mcp-registration.ts";
export {
  vibeAgentName,
  collectVibeAgentDescriptors,
  renderVibeAgent,
  syncVibeAgents,
} from "./installation/agents.ts";
export type {
  VibeAgentDescriptor,
  VibeAgentMappings,
  SyncVibeAgentsOptions,
  SyncVibeAgentsResult,
} from "./installation/agents.ts";
export { createVibeRuntime } from "./runtime.ts";
export type { VibeRuntimeOptions } from "./runtime.ts";
