"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

/** const [toast, show] = useToast(); show("Added", { href: "/app/collection", label: "View" }) */
export function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const show = useCallback((text, action = null, kind = "good") => {
    setMsg({ text, action, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4200);
  }, []);
  const node = msg ? (
    <div className={`app-toast ${msg.kind}`} role="status">
      <span>{msg.text}</span>
      {msg.action?.href && <Link href={msg.action.href}>{msg.action.label} →</Link>}
      {msg.action?.onClick && <button type="button" onClick={() => { msg.action.onClick(); setMsg(null); }}>{msg.action.label}</button>}
    </div>
  ) : null;
  return [node, show];
}
