"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendIdea } from "@/app/ideas/actions";

/** Open the idea box from anywhere: suggestIdea({ source, prompt?, text?, context? }). */
export function suggestIdea(detail = {}) {
  window.dispatchEvent(new CustomEvent("tcgb-idea", { detail }));
}

/** A link or button that opens the idea box. */
export function SuggestIdea({ source = "menu", label = "💡 Suggest an idea", className = "link-btn", prompt, context, title }) {
  return <button type="button" className={className} title={title} aria-label={title} onClick={() => suggestIdea({ source, prompt, context })}>{label}</button>;
}

/**
 * "Suggest an idea": what were you trying to do? Mounted once in the root layout; opened by suggestIdea() from the
 * menus, the footer and the dead ends (lib/ideas.js). The page and anything the opener passes in go along with it.
 */
export default function IdeaBox() {
  const path = usePathname();
  const [open, setOpen] = useState(null); // { source, prompt, context }
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();
  const ref = useRef(null);

  useEffect(() => {
    const show = (e) => {
      const d = e.detail || {};
      window.dispatchEvent(new Event("tcgb-helper-close"));
      setOpen({ source: d.source || "menu", prompt: d.prompt, context: d.context || null });
      setText(d.text || "");
      setResult(null);
    };
    window.addEventListener("tcgb-idea", show);
    return () => window.removeEventListener("tcgb-idea", show);
  }, []);
  useEffect(() => { if (open) setTimeout(() => ref.current?.focus(), 30); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const send = (e) => {
    e.preventDefault();
    start(async () => setResult(await sendIdea({ text, source: open.source, page: path, context: open.context }).catch(() => ({ error: "That didn't send. Try again in a minute." }))));
  };

  return (
    <div className="dq-backdrop idea-backdrop" onClick={() => setOpen(null)}>
      <div className="panel idea-box" role="dialog" aria-label="Suggest an idea" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="helper-x idea-x" onClick={() => setOpen(null)} aria-label="Close">✕</button>
        {result?.ok ? (
          <>
            <h2>Thanks! 🙌</h2>
            <p className="muted">{result.demo ? "Ideas aren't saved in the demo, but on the real site this goes straight to the team." : "It's with the team now. If we build it, we'll email you to let you know it's live."}</p>
            <button type="button" className="btn primary" onClick={() => setOpen(null)}>Done</button>
          </>
        ) : (
          <form onSubmit={send}>
            <h2>💡 Suggest an idea</h2>
            <p className="muted small">{open.prompt || "Something you wanted to do but couldn't? A feature you wish we had? Tell us. We read every one, and this is how TCG Boogie gets better."}</p>
            <textarea ref={ref} rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="I was trying to… / I wish I could…" aria-label="Your idea" />
            {result?.error && <div className="notice bad" style={{ margin: "8px 0 0" }}>{result.error}</div>}
            <div className="idea-foot">
              <span className="small muted">We&apos;ll include which page you&apos;re on.</span>
              <button className="btn primary" disabled={pending || text.trim().length < 3}>{pending ? "Sending…" : "Send idea"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
