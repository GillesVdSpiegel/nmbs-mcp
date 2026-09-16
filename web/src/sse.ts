import type { ChatEvent, ChatRequest } from "@server/events";

import { en } from "./i18n/en";

// The stream can fail before any component renders, so this one string cannot
// come from the hook; the UI replaces it with the translated version.
const UNREACHABLE = en.serverUnreachable;

/**
 * POSTs a chat turn and yields the server's events as they stream in.
 * EventSource only speaks GET, so the SSE framing is parsed by hand here.
 */
export async function* streamChat(request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (e) {
    // A dead backend surfaces as a bare "Failed to fetch"; say what to do about it.
    if (signal.aborted) throw e;
    throw new Error(UNREACHABLE);
  }

  if (!response.ok || !response.body) {
    // In dev the Vite proxy answers 5xx itself when the backend is down, so the
    // fetch above resolves instead of throwing.
    if (response.status >= 500) throw new Error(UNREACHABLE);
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield JSON.parse(data) as ChatEvent;
    }
  }
}
