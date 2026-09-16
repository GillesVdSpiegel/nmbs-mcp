import type Anthropic from "@anthropic-ai/sdk";

type History = Anthropic.Beta.BetaMessageParam[];

const MAX_SESSIONS = 200;

const sessions = new Map<string, History>();

export function getHistory(sessionId: string): History {
  return sessions.get(sessionId) ?? [];
}

export function setHistory(sessionId: string, history: History): void {
  // Re-insert so the map stays in least-recently-used order.
  sessions.delete(sessionId);
  sessions.set(sessionId, history);
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

export function clearHistory(sessionId: string): void {
  sessions.delete(sessionId);
}
