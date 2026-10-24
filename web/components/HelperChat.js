"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { TOURS } from "@/lib/tours";
import { suggestIdea } from "@/components/IdeaBox";

const STORE = "tcgb-helper"; // this tab's chat, so it survives moving between pages
const MAX = 600;
const HIDDEN = /^\/(app\/admin|app\/logs|login|unsubscribe)(\/|$)/;
const STARTERS = [
  "How do I set up a deal filter?",
  "How do I add a card from an eBay link?",
  "How do price alerts work?",
  "What does Premium add?",
];

/** [text](/path) links (site paths only) and line breaks; everything else stays plain text. */
function Answer({ text }) {
  return text.split("\n").map((line, i) => {
    const parts = [];
    const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      parts.push(line.slice(last, m.index));
      const href = m[2];
      if (/^\/(?!\/)/.test(href)) parts.push(<Link key={m.index} href={href}>{m[1]}</Link>);
      else if (/^mailto:/.test(href)) parts.push(<a key={m.index} href={href}>{m[1]}</a>);
      else parts.push(m[1]);
      last = m.index + m[0].length;
    }
    parts.push(line.slice(last));
    return <Fragment key={i}>{i > 0 && <br />}{parts}</Fragment>;
  });
}

/**
 * Boogie Bot, the "Ask" helper in the corner of every page (app/api/helper, lib/helper.js): questions about how the
 * site works and where things are, with a "Show me how" walkthrough (components/TourRunner.js) when one fits.
 * Anything can open it with window.dispatchEvent(new Event("tcgb-helper-open")); a walkthrough closes it.
 */
export default function HelperChat({ signedIn }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(STORE) || "null"); if (Array.isArray(saved)) setMessages(saved); } catch { /* storage blocked */ }
    const show = () => setOpen(true);
    const hide = () => setOpen(false);
    window.addEventListener("tcgb-helper-open", show);
    window.addEventListener("tcgb-helper-close", hide);
    return () => { window.removeEventListener("tcgb-helper-open", show); window.removeEventListener("tcgb-helper-close", hide); };
  }, []);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-20))); } catch { /* storage blocked */ } }, [messages]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDDEN.test(path || "")) return null;

  async function ask(text) {
    const q = text.trim().slice(0, MAX);
    if (!q || busy) return;
    const next = [...messages, { role: "user", text: q }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const r = await fetch("/api/helper", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.local), page: path }) });
      const j = await r.json().catch(() => ({}));
      setMessages([...next, { role: "assistant", text: j.answer || j.error || "Something went wrong. Try again in a minute.", ...(j.tour ? { tour: j.tour } : {}), ...(j.idea ? { idea: q } : {}), ...(j.failed || j.limited || !j.answer ? { local: true } : {}) }]);
    } catch {
      setMessages([...next, { role: "assistant", text: "Couldn't reach the helper. Check your connection and try again.", local: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button type="button" className="helper-fab" onClick={() => setOpen(true)} aria-label="Ask Boogie Bot">
          <span aria-hidden="true">🤖</span> Ask Boogie Bot
        </button>
      )}
      {open && (
        <section className="helper" role="dialog" aria-label="Boogie Bot">
          <header className="helper-head">
            <span className="helper-avatar" aria-hidden="true">🤖</span>
            <div><b>Boogie Bot</b><span>Ask how anything works. I can show you, too.</span></div>
            {messages.length > 0 && <button type="button" className="helper-x" onClick={() => setMessages([])} title="Start over">↺</button>}
            <button type="button" className="helper-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </header>
          <div className="helper-list" ref={listRef} aria-live="polite">
            {messages.length === 0 && (
              <div className="helper-hello">
                <p>Hi, I&apos;m Boogie Bot! Ask me how anything on TCG Boogie works or where to find it. I can explain it, or tap &quot;Show me how&quot; and I&apos;ll point at every button for you.</p>
                <div className="helper-starters">
                  {STARTERS.map((s) => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`helper-msg ${m.role}`}>
                {m.role === "assistant" ? <Answer text={m.text} /> : m.text}
                {m.idea && (
                  <button type="button" className="btn sm helper-tour" onClick={() => suggestIdea({ source: "helper", text: m.idea,
                    prompt: "Here's what you asked Boogie Bot. Add anything that would help us build it." })}>
                    💡 Send this idea to the team
                  </button>
                )}
                {m.tour && TOURS[m.tour] && (
                  <button type="button" className="btn sm primary helper-tour" onClick={() => window.dispatchEvent(new CustomEvent("tcgb-tour", { detail: m.tour }))}>
                    ▶ Show me how
                  </button>
                )}
              </div>
            ))}
            {busy && <div className="helper-msg assistant helper-typing" aria-label="Thinking"><i /><i /><i /></div>}
          </div>
          <form className="helper-form" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
            <textarea ref={inputRef} rows={1} value={draft} maxLength={MAX} placeholder="Ask a question…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(draft); } }} />
            <button type="submit" className="btn primary sm" disabled={busy || !draft.trim()}>Send</button>
          </form>
          <p className="helper-foot">
            Boogie Bot is an AI helper: it can be wrong and can&apos;t see or change your account. {signedIn ? "" : "Visitors get a few questions a day. "}
            Questions are kept 30 days to improve the site (<Link href="/privacy#helper">Privacy</Link>).
          </p>
        </section>
      )}
    </>
  );
}
