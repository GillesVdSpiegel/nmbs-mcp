import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
}

export function Composer({ onSend, onStop, busy }: Props) {
  const t = useT();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden";
  }, [text]);

  const submit = () => {
    if (busy || !text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder={t.composerPlaceholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {busy ? (
        <button type="button" className="send stop" onClick={onStop} aria-label={t.stop}>
          <span className="stop-square" />
        </button>
      ) : (
        <button type="submit" className="send" disabled={!text.trim()} aria-label={t.send}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </form>
  );
}
