import { LANGUAGES, useLanguage } from "../i18n";
import type { Mode } from "../App";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  onReset?: () => void;
  canReset: boolean;
  onShowDisruptions: () => void;
}

export function Header({ mode, onMode, onReset, canReset, onShowDisruptions }: Props) {
  const { lang, setLang, t } = useLanguage();

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">{t.appName}</span>
      </div>

      <nav className="tabs" aria-label={t.appName}>
        <button className={mode === "chat" ? "tab active" : "tab"} onClick={() => onMode("chat")} aria-current={mode === "chat"}>
          {t.modeAssistant}
        </button>
        <button
          className={mode === "direct" ? "tab active" : "tab"}
          onClick={() => onMode("direct")}
          aria-current={mode === "direct"}
        >
          {t.modeDirect}
        </button>
      </nav>

      <div className="topbar-right">
        <button className="ghost disruptions-button" onClick={onShowDisruptions} title={t.disruptionsTitle}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 1.8 20.5h20.4L12 3zM12 9v5M12 17.5v.01" />
          </svg>
          {t.disruptionsNav}
        </button>
        <div className="langs" role="group">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              className={l.code === lang ? "lang active" : "lang"}
              onClick={() => setLang(l.code)}
              aria-pressed={l.code === lang}
            >
              {l.label}
            </button>
          ))}
        </div>
        {mode === "chat" && (
          <button className="ghost" onClick={onReset} disabled={!canReset}>
            {t.newChat}
          </button>
        )}
      </div>
    </header>
  );
}
