/**
 * Convert OpenAI-format stored messages into the frontend ChatMessage model.
 *
 * Stored history may contain: user, assistant (with tool_calls), tool, and
 * plain assistant messages.  This function groups them into the flattened
 * ChatMessage[] the UI components expect.
 */

import type { ChatMessage, ToolCallEntry } from "../state/app-state.js";

interface StoredToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface StoredMessage {
  role: string;
  content?: string | null;
  tool_calls?: StoredToolCall[];
  tool_call_id?: string;
  cancelled?: boolean;
}

export function convertStoredMessages(
  raw: StoredMessage[],
  chatId: string,
  timestamp: number,
): ChatMessage[] {
  const result: ChatMessage[] = [];
  let msgIndex = 0;

  const makeId = () => `${chatId}-${msgIndex++}`;

  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];

    if (m.role === "user") {
      result.push({
        id: makeId(),
        role: "user",
        content: m.content ?? "",
        timestamp,
      });
      continue;
    }

    if (m.role === "assistant" && m.tool_calls?.length) {
      const toolCalls: ToolCallEntry[] = [];

      for (const tc of m.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          /* keep empty */
        }
        const entry: ToolCallEntry = { name: tc.function.name, arguments: args };

        // Look ahead for the matching tool-result message
        for (let j = i + 1; j < raw.length; j++) {
          if (raw[j].role === "tool" && raw[j].tool_call_id === tc.id) {
            entry.result = raw[j].content ?? "";
            break;
          }
        }
        toolCalls.push(entry);
      }

      // If the next non-tool message is an assistant with content, merge it
      let finalContent = m.content ?? "";
      let merged: StoredMessage | undefined;
      let skip = i + 1;
      while (skip < raw.length && raw[skip].role === "tool") skip++;
      if (skip < raw.length && raw[skip].role === "assistant" && !raw[skip].tool_calls?.length) {
        merged = raw[skip];
        finalContent = merged.content ?? "";
      }

      result.push({
        id: makeId(),
        role: "assistant",
        content: finalContent,
        toolCalls,
        cancelled: merged?.cancelled || undefined,
        timestamp,
      });
      continue;
    }

    if (m.role === "assistant") {
      // Plain assistant message (final answer without tool calls).
      // Skip if already merged into a preceding tool-call assistant message.
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (prev.role === "assistant" && prev.toolCalls?.length && prev.content === m.content) {
          continue;
        }
      }
      result.push({
        id: makeId(),
        role: "assistant",
        content: m.content ?? "",
        cancelled: m.cancelled || undefined,
        timestamp,
      });
      continue;
    }

    // tool messages are consumed by the assistant block above -- skip
  }

  return result;
}
