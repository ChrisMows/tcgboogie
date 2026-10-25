import Link from "next/link";
import { RELEASES } from "@/lib/release-notes";

// What's new: release notes, newest first (lib/release-notes.js).
export const metadata = {
  title: "What's new",
  description: "New features, improvements and fixes on TCG Boogie, newest first.",
  alternates: { canonical: "/updates" },
};

const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function Updates() {
  return (
    <div className="wrap doc updates">
      <h1>What&apos;s new</h1>
      <p className="muted">New features, improvements and fixes, newest first. Have an idea? Use Suggest an idea in the menu.</p>
      {RELEASES.map((r) => (
        <section key={r.date} className="release" id={r.date}>
          <div className="release-head">
            <time dateTime={r.date}>{longDate(r.date)}</time>
            <h2>{r.title}</h2>
          </div>
          <ul className="release-items">
            {r.items.map((it) => (
              <li key={it.title}>
                <span className={`release-tag ${it.tag.toLowerCase()}`}>{it.tag}</span>
                <div>
                  <b>{it.href ? <Link href={it.href}>{it.title}</Link> : it.title}</b>
                  <p>{it.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
