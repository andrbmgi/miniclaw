// Defaults for agent metadata when upstream does not supply them.
// Model id uses pi-ai's built-in Anthropic catalog.
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-opus-4-5";
// Context window: Modified for local models (original: 200k for Opus 4.5)
// For local models (Llama, Qwen, etc.), use 4k-32k depending on model
export const DEFAULT_CONTEXT_TOKENS = 8_192;
