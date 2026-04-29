/**
 * Claude API wrapper for SoftHome — Deno (Edge Functions) edition.
 *
 * Mirror of `src/lib/claude.ts` adapted for the Supabase Edge Functions
 * runtime (Deno). Key differences from the Node/Vite version:
 *  - Imports the SDK from `esm.sh` (no npm available in Deno deploy).
 *  - Reads the API key from `Deno.env.get("ANTHROPIC_API_KEY")` (not from
 *    `import.meta.env.VITE_*`).
 *
 * Otherwise the surface and semantics match: same defaults (Sonnet 4.6,
 * 4096 max tokens), same automatic prompt caching on the last system block
 * + last user message, same `extractTextFromResponse` helper.
 *
 * Used by:
 *  - admission-document-validate
 *  - recruitment-cv-screen
 *  - agent-mcp-bridge
 *  - any future Edge Function that calls Claude.
 */

// SDK pinned to a known version. Bump deliberately; changing the URL is the
// equivalent of a version bump in package.json for the Node side.
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.91.1";

/** Default model used by every SoftHome agent unless explicitly overridden. */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

/** Default max output tokens. Bump per-call for long extractions / reports. */
export const DEFAULT_MAX_TOKENS = 4096;

// Re-exported types so callers can stay decoupled from the SDK URL.
export type ClaudeMessage = Anthropic.MessageParam;
export type ClaudeTool = Anthropic.Tool;
export type ClaudeToolChoice = Anthropic.MessageCreateParams["tool_choice"];
export type ClaudeResponse = Anthropic.Message;
export type ClaudeContentBlock = Anthropic.ContentBlock;
export type ClaudeTextBlock = Anthropic.TextBlock;
export type ClaudeToolUseBlock = Anthropic.ToolUseBlock;

let _client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic client. Reads `ANTHROPIC_API_KEY` from the
 * Edge Function environment (set via `supabase secrets set`).
 *
 * @example
 *   const client = getClaudeClient();
 *   const res = await client.messages.create({ ... });
 */
export function getClaudeClient(): Anthropic {
  if (_client) return _client;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error(
      "[claude] ANTHROPIC_API_KEY is not set in the Edge Function environment.",
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

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
  /** Disable automatic prompt caching. Default: false (caching ON). */
  disableCache?: boolean;
}

/**
 * Calls Claude with sensible SoftHome defaults. See `src/lib/claude.ts` for
 * the full doc — behavior is identical here.
 *
 * @example
 *   const res = await callClaude({
 *     system: "You are a CV screener.",
 *     messages: [{ role: "user", content: cvText }],
 *   });
 *   const summary = extractTextFromResponse(res);
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
 * (tool_use, thinking, etc.).
 *
 * @example
 *   const text = extractTextFromResponse(res);
 */
export function extractTextFromResponse(response: ClaudeResponse): string {
  return response.content
    .filter((block): block is ClaudeTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// ---------------------------------------------------------------------------
// Internal helpers — caching placement (must match src/lib/claude.ts).
// ---------------------------------------------------------------------------

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

function applyCacheToLastUserMessage(
  messages: ClaudeMessage[],
): ClaudeMessage[] {
  if (messages.length === 0) return messages;

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
