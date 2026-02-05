import type { CommandHandler } from "./commands-types.js";
import { logVerbose } from "../../globals.js";

/**
 * Memory organization command handler
 * Triggers background agent to organize MEMORY.md and memory/*.md files
 */
export const handleMemoryOrganizeCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }

  const match = params.command.commandBodyNormalized.match(/^\/organize[-_]?memory(?:\s|$)/);
  if (!match) {
    return null;
  }

  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /organize-memory from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  logVerbose("Memory organization command triggered");

  // Spawn background agent to organize memory
  // This will use sessions_spawn tool in the agent run
  const organizationPrompt = [
    "Organize memory files (MEMORY.md and memory/*.md):",
    "",
    "1. Review all memory files",
    "2. Extract 3-5 most important facts to keep in MEMORY.md summary (first section, max 500 chars)",
    "3. Consolidate duplicate or related entries",
    "4. Archive completed/outdated projects to memory/archive/",
    "5. Ensure summary includes: active projects, key preferences, recent important decisions",
    "6. Keep summary section concise - it gets injected into every prompt",
    "",
    "Structure MEMORY.md as:",
    "```markdown",
    "# Quick Reference",
    "- Active: [list current focus]",
    "- Prefs: [key preferences]",
    "- Recent: [important recent decisions]",
    "",
    "---",
    "",
    "# Detailed Memory",
    "[Full searchable history]",
    "```",
    "",
    "After organizing, summarize what you changed.",
  ].join("\n");

  // Return directive to spawn memory organizer
  // The agent will handle this using sessions_spawn tool
  return {
    shouldContinue: true,
    reply: {
      text: "🗂️ Starting memory organization in background...",
    },
    // Inject the organization task into the message body
    // This will be processed by the agent run
    modifyBody: (originalBody: string) => {
      return `${organizationPrompt}\n\n[Original user message: ${originalBody}]`;
    },
  };
};

/**
 * Trigger memory organization on /new or /reset
 * This runs automatically without user confirmation
 */
export async function triggerMemoryOrganizationOnReset(params: {
  sessionKey: string;
  workspaceDir: string;
}): Promise<void> {
  logVerbose(`Auto-organizing memory after session reset: ${params.sessionKey}`);

  // Note: Actual implementation would spawn a subagent here
  // For now, just log the intent
  // The full implementation would use the sessions_spawn tool
  // which requires access to the agent runner context

  // This is a placeholder - actual spawn would happen via agent tools
  // when we integrate this with the agent runner in get-reply-run.ts
}
