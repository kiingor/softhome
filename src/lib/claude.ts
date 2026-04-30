/**
 * Claude API wrapper for SoftHouse.
 *
 * Thin layer over `@anthropic-ai/sdk` used by:
 *  - Edge Functions (admission-document-validate, recruitment-cv-screen, agent-mcp-bridge)
 *  - Server-side agent code (Analista G&C, Recruiter)
 *
 * IMPORTANT — environment:
 *  - This file targets Vite's bundler context and reads the API key from
 *    `import.meta.env.VITE_ANTHROPIC_API_KEY`. It is NOT meant to ship to the
 *    browser: the API key would leak. Treat it as build-time/server-side only.
 *  - For Deno-based Edge Functions, use the parallel implementation at
 *    `supabase/functions/_shared/claude.ts`, which reads `ANTHROPIC_API_KEY`
 *    via `Deno.env.get(...)` and imports the SDK from `esm.sh`.
 *
 * Defaults (per CLAUDE.md):
 *  - Model: `claude-sonnet-4-6` (Sonnet 4.6 — best speed/intelligence balance)
 *  - Prompt caching: enabled by default on the last system block + last user
 *    message via `cache_control: { type: 'ephemeral' }`.
 *  - `max_tokens`: 4096 (raise per call when generating long content).
 *
 * What this wrapper does NOT do (intentionally — add when needed):
 *  - Streaming (Edge Functions can opt in directly when required).
 *  - Memory / conversation history (deferred to agent scaffolding).
 *  - Tool execution loop (agent-specific; callers handle their own loop).
 *  - Retry/backoff (the SDK already retries 429 / 5xx with exponential backoff).
 */

import Anthropic from "@anthropic-ai/sdk";

/** Default model used by every SoftHouse agent unless explicitly overridden. */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

/** Default max output tokens. Bump per-call for long extractions / reports. */
export const DEFAULT_MAX_TOKENS = 4096;

/**
 * Re-exported SDK types so callers don't need to import from `@anthropic-ai/sdk`
 * directly. Keeps the dependency surface centralized.
 */
export type ClaudeMessage = Anthropic.MessageParam;
export type ClaudeTool = Anthropic.Tool;
export type ClaudeToolChoice = Anthropic.MessageCreateParams["tool_choice"];
export type ClaudeResponse = Anthropic.Message;
export type ClaudeContentBlock = Anthropic.ContentBlock;
export type ClaudeTextBlock = Anthropic.TextBlock;
export type ClaudeToolUseBlock = Anthropic.ToolUseBlock;

/**
 * Lazily-instantiated singleton client. Reused across calls to avoid re-creating
 * connections on each invocation (matters for agents that fire many calls).
 */
let _client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic client.
 *
 * Reads the API key from `VITE_ANTHROPIC_API_KEY`. Throws if absent so we fail
 * loudly during server-side boot rather than silently calling the API
 * unauthenticated.
 *
 * @example
 *   const client = getClaudeClient();
 *   const res = await client.messages.create({ ... });
 */
export function getClaudeClient(): Anthropic {
  if (_client) return _client;

  const apiKey = import.meta.env?.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[claude] VITE_ANTHROPIC_API_KEY is not set. " +
        "For Edge Functions, use supabase/functions/_shared/claude.ts instead.",
    );
  }

  // Optional custom router endpoint (ex: omnirouter via softcom).
  const baseURL = import.meta.env?.VITE_ANTHROPIC_BASE_URL || undefined;

  _client = new Anthropic({ apiKey, baseURL });
  return _client;
}

/**
 * Options for {@link callClaude}. Mirrors a subset of the Anthropic SDK
 * `MessageCreateParams` shape, with caching applied automatically.
 */
export interface CallClaudeOptions {
  /** System prompt — string or structured blocks. */
  system?: string | Anthropic.TextBlockParam[];
  /** Conversation messages (user/assistant). Required. */
  messages: ClaudeMessage[];
  /** Optional tool definitions for tool-use flows. */
  tools?: ClaudeTool[];
  /** Optional `tool_choice` directive. */
  toolChoice?: ClaudeToolChoice;
  /** Override the default model. */
  model?: string;
  /** Override the default `max_tokens` (4096). */
  maxTokens?: number;
  /**
   * Disable automatic prompt caching. Default: false (caching ON).
   * Set true for one-off ad-hoc calls where the prefix won't be reused.
   */
  disableCache?: boolean;
}

/**
 * Calls Claude with sensible SoftHouse defaults.
 *
 * Behaviors:
 *  - Defaults to Sonnet 4.6 + 4096 max tokens.
 *  - When `disableCache` is not set, attaches `cache_control: { type: 'ephemeral' }`
 *    to (a) the last system text block and (b) the last content block of the
 *    last user message. This caches the stable prefix (system prompt + few-shot
 *    examples) across calls. See `docs/adr/0003-agents.md`.
 *  - Returns the raw `Anthropic.Message` so callers can inspect
 *    `usage.cache_creation_input_tokens` / `cache_read_input_tokens` and the
 *    full content blocks (text, tool_use, etc.).
 *
 * Errors are propagated as the SDK's typed exceptions (`Anthropic.APIError`
 * and subclasses: `BadRequestError`, `AuthenticationError`, `RateLimitError`,
 * etc.). Callers should branch on `instanceof Anthropic.RateLimitError`,
 * not on string matching the message.
 *
 * @example
 *   const res = await callClaude({
 *     system: "You are a document validator for SoftHouse admissions.",
 *     messages: [{ role: "user", content: "Is this RG legible?" }],
 *   });
 *   console.log(extractTextFromResponse(res));
 */
export async function callClaude(
  options: CallClaudeOptions,
): Promise<ClaudeResponse> {
  const {
    system,
    messages,
    tools,
    toolChoice,
    model = DEFAULT_CLAUDE_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    disableCache = false,
  } = options;

  const client = getClaudeClient();

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    messages: disableCache ? messages : applyCacheToLastUserMessage(messages),
  };

  if (system !== undefined) {
    params.system = disableCache ? system : applyCacheToSystem(system);
  }
  if (tools !== undefined) params.tools = tools;
  if (toolChoice !== undefined) params.tool_choice = toolChoice;

  return await client.messages.create(params);
}

/**
 * Extracts concatenated text from a Claude response, ignoring non-text blocks
 * (tool_use, thinking, etc.). Returns the empty string when the response has
 * no text content.
 *
 * For tool-use responses, inspect `response.content` directly to read the
 * tool_use blocks — this helper deliberately drops them.
 *
 * @example
 *   const res = await callClaude({ messages: [...] });
 *   const text = extractTextFromResponse(res);
 */
export function extractTextFromResponse(response: ClaudeResponse): string {
  return response.content
    .filter((block): block is ClaudeTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// ---------------------------------------------------------------------------
// Internal helpers — caching placement.
// ---------------------------------------------------------------------------

/**
 * Adds `cache_control: ephemeral` to the LAST text block of the system prompt.
 * Accepts either a plain string (which is converted to a single-block array)
 * or a pre-structured array of text blocks.
 */
function applyCacheToSystem(
  system: string | Anthropic.TextBlockParam[],
): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] =
    typeof system === "string" ? [{ type: "text", text: system }] : [...system];

  if (blocks.length === 0) return blocks;

  const lastIdx = blocks.length - 1;
  blocks[lastIdx] = {
    ...blocks[lastIdx],
    cache_control: { type: "ephemeral" },
  };
  return blocks;
}

/**
 * Adds `cache_control: ephemeral` to the last content block of the last
 * USER message. Walks back to find the most recent user turn (multi-turn
 * conversations may end on assistant when the caller is replaying history).
 *
 * Returns a shallow-cloned messages array so the input isn't mutated.
 */
function applyCacheToLastUserMessage(
  messages: ClaudeMessage[],
): ClaudeMessage[] {
  if (messages.length === 0) return messages;

  // Find the index of the last user message.
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx === -1) return messages;

  const cloned = [...messages];
  const target = cloned[lastUserIdx];

  // Normalize content to block array form so we can attach cache_control.
  const blocks: Anthropic.ContentBlockParam[] =
    typeof target.content === "string"
      ? [{ type: "text", text: target.content }]
      : [...target.content];

  if (blocks.length === 0) return messages;

  const lastBlockIdx = blocks.length - 1;
  blocks[lastBlockIdx] = {
    ...blocks[lastBlockIdx],
    cache_control: { type: "ephemeral" },
  } as Anthropic.ContentBlockParam;

  cloned[lastUserIdx] = { ...target, content: blocks };
  return cloned;
}
