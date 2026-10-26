import Link from "next/link";
import { RELEASES } from "@/lib/release-notes";

// What's new: release notes by version, newest first (lib/release-notes.js). Each release is a row that opens to its
// changes, grouped New / Improved / Fixed; the newest starts open. Plain <details>, so it works without JavaScript and
// a link to /updates#v1-0 opens that release.
export const metadata = {
  title: "What's new",
  description: "Release notes for TCG Boogie: new features, improvements and fixes in every version, newest first.",
  alternates: { canonical: "/updates" },
};

const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const GROUPS = [["New", "New"], ["Improved", "Improved"], ["Fixed", "Fixed"]];
const releaseAnchor = (r) => `v${r.version.replace(/\./g, "-")}`;

export default function Updates() {
  return (
    <div className="wrap doc updates">
      <h1>What&apos;s new</h1>
      <p className="muted">Release notes for every version of TCG Boogie, newest first. Open a release to see what changed. Have an idea? Use Suggest an idea in the menu.</p>
      <div className="releases">
        {RELEASES.map((r, i) => (
          <details key={r.version} className="release" id={releaseAnchor(r)} open={i === 0}>
            <summary>
              <span className="release-version">v{r.version}</span>
              <span className="release-summary">
                <b>{r.title}</b>
                <span className="release-meta">
                  <time dateTime={r.date}>{longDate(r.date)}</time>
                  {i === 0 && <span className="release-latest">Latest</span>}
                </span>
              </span>
              <span className="release-counts" aria-label="Changes in this release">
                {GROUPS.map(([tag]) => {
                  const n = r.items.filter((it) => it.tag === tag).length;
                  return n ? <span key={tag} className={`release-tag ${tag.toLowerCase()}`}>{n} {tag}</span> : null;
                })}
              </span>
              <span className="release-chevron" aria-hidden="true" />
            </summary>
            <div className="release-body">
              {GROUPS.map(([tag, heading]) => {
                const items = r.items.filter((it) => it.tag === tag);
                if (!items.length) return null;
                return (
                  <section key={tag}>
                    <h3 className={`release-group ${tag.toLowerCase()}`}>{heading}</h3>
                    <ul className="release-items">
                      {items.map((it) => (
                        <li key={it.title}>
                          <b>{it.href ? <Link href={it.href}>{it.title}</Link> : it.title}</b>
                          <p>{it.text}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
