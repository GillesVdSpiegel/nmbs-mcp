import type { Message } from "../App";
import { useT } from "../i18n";
import { ToolResult } from "../renderers";
import { ToolChip } from "./ToolChip";

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="msg user">
      <div className="bubble">{text}</div>
    </div>
  );
}

interface AssistantProps {
  message: Extract<Message, { role: "assistant" }>;
  onPick: (text: string) => void;
}

export function AssistantMessage({ message, onPick }: AssistantProps) {
  const t = useT();
  const { parts, streaming, error } = message;
  const running = parts.filter((p) => p.kind === "tool" && p.status === "running");

  return (
    <div className="msg assistant">
      {parts.length === 0 && streaming && (
        <div className="thinking">
          {t.thinking}
          <span className="dots" />
        </div>
      )}

      {parts.map((part, i) => {
        if (part.kind === "text") {
          const isLast = i === parts.length - 1;
          return (
            <div key={i} className="prose">
              {renderText(part.text)}
              {streaming && isLast && <span className="caret" />}
            </div>
          );
        }
        return (
          <div key={part.id || i} className="tool-block">
            <ToolChip name={part.name} status={part.status} input={part.input} />
            {part.status !== "running" && (
              <ToolResult name={part.name} ok={part.status === "done"} payload={part.payload} onPick={onPick} />
            )}
          </div>
        );
      })}

      {running.length > 0 && parts[parts.length - 1]?.kind === "tool" && streaming && (
        <div className="thinking">
          {t.checking}
          <span className="dots" />
        </div>
      )}

      {error && <div className="error-note">{error}</div>}
    </div>
  );
}

/** Minimal markdown: paragraphs, bullet lists, **bold** and `code`. */
function renderText(text: string) {
  return text.split(/\n{2,}/).map((block, i) => {
    const lines = block.split("\n");
    const bullets = lines.filter((l) => /^\s*[-*]\s+/.test(l));

    // A block is a list only if every non-empty line is a bullet; otherwise a
    // lead-in line like "Alternatives:" would be swallowed.
    if (bullets.length > 0 && bullets.length === lines.filter((l) => l.trim()).length) {
      return (
        <ul key={i}>
          {bullets.map((l, j) => (
            <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }

    const leadIn: string[] = [];
    const listItems: string[] = [];
    for (const line of lines) {
      if (/^\s*[-*]\s+/.test(line)) listItems.push(line.replace(/^\s*[-*]\s+/, ""));
      else if (listItems.length === 0) leadIn.push(line);
    }

    if (listItems.length > 0) {
      return (
        <div key={i}>
          {leadIn.some((l) => l.trim()) && <p>{inline(leadIn.join("\n"))}</p>}
          <ul>
            {listItems.map((l, j) => (
              <li key={j}>{inline(l)}</li>
            ))}
          </ul>
        </div>
      );
    }

    return <p key={i}>{inline(block)}</p>;
  });
}

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((chunk, j) => {
    if (chunk.startsWith("**")) return <strong key={j}>{chunk.slice(2, -2)}</strong>;
    if (chunk.startsWith("`")) return <code key={j}>{chunk.slice(1, -1)}</code>;
    return chunk.split("\n").flatMap((line, k) => (k === 0 ? [line] : [<br key={`${j}-${k}`} />, line]));
  });
}
