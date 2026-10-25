import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { money } from "@/lib/collection";

// A sale as a 1080x1080 share image (the /sales page's "Share image", and what Admin -> Sales posts to X): our
// background (public/share/sales-bg.jpg), the card in a slab drawn in its grader's colours with the grade, then the
// price and what makes it news on the floor. Served at tcgboogie.com/sales/image/high-123.png.
const S = 1080;
const LIME = "#d3ff66";

const read = (rel) => fs.readFile(path.join(process.cwd(), rel)).catch(() => fs.readFile(path.join(process.cwd(), "web", rel)));
let assets;
async function load() {
  assets ??= Promise.all([read("public/share/sales-bg.jpg"), read("lib/fonts/space-grotesk-latin-700-normal.woff"), read("lib/fonts/space-grotesk-latin-500-normal.woff")])
    .then(([bg, bold, medium]) => ({ bg: `data:image/jpeg;base64,${bg.toString("base64")}`, bold, medium }));
  return assets;
}

/** The card picture as a data URI (null if it won't load: the slab then shows the card's name). */
async function picture(url) {
  if (!url) return null;
  try {
    const r = await fetch(url.replace(/_in_\d+x\d+\./, "_in_800x800."), { signal: AbortSignal.timeout(6000) });
    const ok = r.ok ? r : await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!ok.ok) return null;
    const type = ok.headers.get("content-type") || "image/jpeg";
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await ok.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

// Each grader's label, in its own colours (their names as text, no logos).
const LABEL = {
  PSA: { bg: "#ffffff", border: "#c8102e", ink: "#111111", accent: "#c8102e" },
  CGC: { bg: "#ffffff", border: "#1d3f8f", ink: "#111111", accent: "#1d3f8f" },
  BGS: { bg: "#d9dde3", border: "#9aa3ad", ink: "#111111", accent: "#111111" },
  SGC: { bg: "#111111", border: "#2b2b2b", ink: "#ffffff", accent: "#ffffff" },
  TAG: { bg: "#ffffff", border: "#111111", ink: "#111111", accent: "#111111" },
};

function Slab({ x, img }) {
  const l = LABEL[x.grader] || LABEL.PSA;
  const special = /pristine|black/i.test(String(x.grade));
  const gold = (x.grader === "CGC" && special) || (x.grader === "BGS" && /black/i.test(String(x.grade)));
  const lab = gold ? { bg: "#111111", border: "#c9a227", ink: "#f2d27a", accent: "#f2d27a" } : l;
  const num = String(x.grade).replace(/\s.*$/, "");
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 400, height: 600, padding: 14, borderRadius: 22, background: "rgba(225,232,240,0.16)",
      border: "3px solid rgba(255,255,255,0.45)", boxShadow: "0 0 60px rgba(211,255,102,0.25)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 104, padding: "0 22px", borderRadius: 10,
        background: lab.bg, border: `5px solid ${lab.border}`, color: lab.ink }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: lab.accent, letterSpacing: 1 }}>{x.grader}</span>
          <span style={{ fontSize: 18, fontWeight: 500 }}>{special ? (/black/i.test(String(x.grade)) ? "BLACK LABEL" : "PRISTINE") : "GRADED"}</span>
        </div>
        <span style={{ fontSize: 64, fontWeight: 700 }}>{num}</span>
      </div>
      <div style={{ display: "flex", flex: 1, marginTop: 14, alignItems: "center", justifyContent: "center", borderRadius: 10, background: "#05070a" }}>
        {img ? <img src={img} width={316} height={440} style={{ objectFit: "contain", borderRadius: 12 }} alt="" />
          : <span style={{ fontSize: 34, color: "#c9d1dd", textAlign: "center", padding: 20 }}>{x.name}</span>}
      </div>
    </div>
  );
}

function Raw({ x, img }) {
  return img ? <img src={img} width={400} height={558} style={{ objectFit: "contain", borderRadius: 18, boxShadow: "0 0 70px rgba(211,255,102,0.35)" }} alt="" />
    : <div style={{ display: "flex", width: 400, height: 558, alignItems: "center", justifyContent: "center", borderRadius: 18, background: "#11161d", color: "#c9d1dd", fontSize: 36 }}>{x.name}</div>;
}

const TAG = { New: { bg: LIME, ink: "#15200c" }, Improved: { bg: "#3fb950", ink: "#06180a" }, Fixed: { bg: "#d29922", ink: "#1f1503" } };

/** Release notes on the same background: "What's new", the date and title, then the list (New first). */
function releaseImage(x, { bg, bold, medium }) {
  const order = ["New", "Improved", "Fixed"];
  const items = [...x.items].sort((a, b) => order.indexOf(a.tag) - order.indexOf(b.tag));
  const shown = items.slice(0, 8);
  const more = items.length - shown.length;
  const date = new Date(`${x.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: S, height: S, fontFamily: "Grotesk", color: "#f4f5ef",
        backgroundImage: `url(${bg})`, backgroundSize: `${S}px ${S}px` }}>
        <div style={{ display: "flex", marginTop: 150, padding: "6px 18px", borderRadius: 999, background: LIME, color: "#15200c", fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>WHAT&apos;S NEW</div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#929ba7", marginTop: 14 }}>{date}</div>
        <div style={{ display: "flex", fontSize: 50, fontWeight: 700, lineHeight: 1.1, marginTop: 6, maxWidth: 640, textAlign: "center", justifyContent: "center",
          textShadow: "0 0 24px rgba(211,255,102,0.35)" }}>{x.title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 30, width: 560 }}>
          {shown.map((it) => (
            <div key={it.title} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ display: "flex", justifyContent: "center", width: 140, padding: "4px 0", borderRadius: 999, fontSize: 18, fontWeight: 700, letterSpacing: 1,
                background: TAG[it.tag]?.bg || LIME, color: TAG[it.tag]?.ink || "#15200c" }}>{it.tag.toUpperCase()}</span>
              <span style={{ display: "flex", fontSize: 28, fontWeight: 500 }}>{it.title}</span>
            </div>
          ))}
          {more > 0 && <span style={{ display: "flex", fontSize: 24, color: "#929ba7", marginLeft: 154 }}>+ {more} more</span>}
        </div>
      </div>
    ),
    {
      width: S, height: S,
      fonts: [{ name: "Grotesk", data: bold, weight: 700, style: "normal" }, { name: "Grotesk", data: medium, weight: 500, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}

/** The share image for one post (lib/market.js: a sale, a caught deal, or release notes), as an ImageResponse (a PNG). */
export async function saleImage(x) {
  if (x.kind === "release") return releaseImage(x, await load());
  const [{ bg, bold, medium }, img] = await Promise.all([load(), picture(x.image)]);
  const kicker = x.kind === "high" ? "NEW HIGH" : x.kind === "deal" ? `SOLD ${x.off}% UNDER MARKET` : "BIG SALE";
  const sub = x.kind === "high" ? `Last high ${money(x.prevHigh, 0)}` : x.kind === "deal" ? `Market ${money(x.market, 0)}` : "Sold on eBay";
  const label = [x.grader ? `${x.grader} ${x.grade}` : x.condition, x.name].filter(Boolean).join(" · ");
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: S, height: S, fontFamily: "Grotesk", color: "#f4f5ef",
        backgroundImage: `url(${bg})`, backgroundSize: `${S}px ${S}px` }}>
        <div style={{ display: "flex", marginTop: 128, height: 600, alignItems: "center" }}>
          {x.grader ? <Slab x={x} img={img} /> : <Raw x={x} img={img} />}
        </div>
        <div style={{ display: "flex", marginTop: 18, padding: "6px 18px", borderRadius: 999, background: LIME, color: "#15200c", fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>{kicker}</div>
        <div style={{ display: "flex", fontSize: 118, fontWeight: 700, lineHeight: 1.05, marginTop: 6, textShadow: "0 0 30px rgba(211,255,102,0.45)" }}>{money(x.price, 0)}</div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: "#c9d1dd", maxWidth: 900, textAlign: "center" }}>{label}</div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#929ba7", marginTop: 4 }}>{[x.set, sub].filter(Boolean).join(" · ")}</div>
      </div>
    ),
    {
      width: S, height: S,
      fonts: [{ name: "Grotesk", data: bold, weight: 700, style: "normal" }, { name: "Grotesk", data: medium, weight: 500, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
