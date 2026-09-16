import type { ToolName, UiLang } from "@server/events";

export interface ToolResponse {
  ok: boolean;
  tool: ToolName;
  payload: unknown;
}

/**
 * Calls one tool directly, with no model in the loop. Used by UI affordances
 * that want data rather than reasoning — showing a train's carriages should
 * not cost an API call.
 */
export async function callTool(
  tool: ToolName,
  input: Record<string, unknown>,
  lang: UiLang,
  signal?: AbortSignal,
): Promise<ToolResponse> {
  const response = await fetch("/api/tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, input, lang }),
    signal,
  });
  if (!response.ok) throw new Error(`Tool request failed (${response.status})`);
  return (await response.json()) as ToolResponse;
}
