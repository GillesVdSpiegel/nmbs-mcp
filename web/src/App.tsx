import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, ToolName } from "@server/events";
import { Composer } from "./components/Composer";
import { Header } from "./components/Header";
import { AssistantMessage, UserMessage } from "./components/Message";
import { DirectSearch } from "./DirectSearch";
import { useLanguage } from "./i18n";
import { streamChat } from "./sse";

export type Mode = "chat" | "direct";

export type Part =
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      id: string;
      name: ToolName;
      status: "running" | "done" | "error";
      input?: Record<string, unknown>;
      payload?: unknown;
    };

export type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; parts: Part[]; streaming: boolean; error?: string };

function applyEvent(message: Message, event: ChatEvent): Message {
  if (message.role !== "assistant") return message;
  const parts = [...message.parts];

  switch (event.type) {
    case "text": {
      const last = parts[parts.length - 1];
      if (last?.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + event.delta };
      else parts.push({ kind: "text", text: event.delta });
      return { ...message, parts };
    }
    case "tool_start":
      parts.push({ kind: "tool", id: event.id, name: event.name, status: "running" });
      return { ...message, parts };
    case "tool_end": {
      let index = parts.findIndex((p) => p.kind === "tool" && p.id === event.id);
      if (index === -1) {
        index = parts.findIndex((p) => p.kind === "tool" && p.name === event.name && p.status === "running");
      }
      const resolved: Part = {
        kind: "tool",
        id: event.id,
        name: event.name,
        status: event.ok ? "done" : "error",
        input: event.input,
        payload: event.payload,
      };
      if (index === -1) parts.push(resolved);
      else parts[index] = resolved;
      return { ...message, parts };
    }
    case "done":
      return { ...message, streaming: false };
    case "error":
      return { ...message, streaming: false, error: event.message };
  }
}

function initialMode(): Mode {
  return new URLSearchParams(location.search).get("mode") === "direct" ? "direct" : "chat";
}

export function App() {
  const { lang, t } = useLanguage();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [disruptionsRequest, setDisruptionsRequest] = useState(0);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = threadRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onPop = () => setMode(initialMode());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo")) {
      void import("./demo").then((m) => setMessages(m.demoMessages()));
    }
  }, []);

  const goTo = useCallback((next: Mode) => {
    setMode(next);
    const url = next === "direct" ? "?mode=direct" : location.pathname;
    history.pushState({}, "", url);
  }, []);

  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const assistantId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", text: trimmed },
        { id: assistantId, role: "assistant", parts: [], streaming: true },
      ]);
      setBusy(true);
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;

      const update = (event: ChatEvent) =>
        setMessages((m) => m.map((msg) => (msg.id === assistantId ? applyEvent(msg, event) : msg)));

      try {
        for await (const event of streamChat({ sessionId, message: trimmed, lang }, controller.signal)) {
          update(event);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          update({ type: "error", message: e instanceof Error ? e.message : t.serverUnreachable });
        }
      } finally {
        update({ type: "done", usage: { input: 0, output: 0 } });
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, sessionId, lang, t],
  );

  const askAssistant = useCallback(
    (text: string) => {
      goTo("chat");
      void send(text);
    },
    [goTo, send],
  );

  const reset = async () => {
    abortRef.current?.abort();
    await fetch(`/api/session/${sessionId}`, { method: "DELETE" }).catch(() => undefined);
    setSessionId(crypto.randomUUID());
    setMessages([]);
  };

  return (
    <div className="app">
      <Header
        mode={mode}
        onMode={goTo}
        onReset={reset}
        canReset={messages.length > 0}
        onShowDisruptions={() => {
          // Disruptions are data, not a conversation — always answer on the
          // direct page, whichever mode the button was pressed from.
          goTo("direct");
          setDisruptionsRequest((n) => n + 1);
        }}
      />

      {mode === "direct" ? (
        <DirectSearch onAskAssistant={askAssistant} disruptionsRequest={disruptionsRequest} />
      ) : (
        <>
          <div className="thread" ref={threadRef} onScroll={onScroll}>
            {messages.length === 0 ? (
              <div className="empty">
                <h1>{t.emptyTitle}</h1>
                <p>{t.emptyBody}</p>
                <div className="suggestions">
                  {t.suggestions.map((s) => (
                    <button key={s} className="suggestion" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <UserMessage key={m.id} text={m.text} />
                  ) : (
                    <AssistantMessage key={m.id} message={m} onPick={send} />
                  ),
                )}
              </div>
            )}
          </div>

          <Composer onSend={send} onStop={() => abortRef.current?.abort()} busy={busy} />
        </>
      )}
    </div>
  );
}
