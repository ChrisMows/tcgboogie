// Illustrative card art. Drop a real image at web/public/assets/<name>.png and it's used instead.
import fs from "node:fs";
import path from "node:path";

const THEMES = {
  charizard: { name: "Blaze Drake", hp: "330", a: "#ff7a2f", b: "#7a1d3a", c: "#ffd36b", glyph: "🔥" },
  umbreon: { name: "Moonlit Shade", hp: "310", a: "#3a4bd8", b: "#0d1030", c: "#f5d36b", glyph: "☾" },
  arceus: { name: "Prism Titan", hp: "280", a: "#c9b8ff", b: "#3b2a6b", c: "#fff4c2", glyph: "✦" },
};

const cache = {};
function realImage(name) {
  if (!(name in cache)) {
    // cwd is web/ in production, but the repo root when the local preview runs `next dev web`.
    const dirs = [path.join(process.cwd(), "public"), path.join(process.cwd(), "web", "public")];
    const file = ["png", "webp", "jpg"].find((ext) =>
      dirs.some((d) => fs.existsSync(path.join(d, "assets", `${name}.${ext}`))),
    );
    cache[name] = file ? `/assets/${name}.${file}` : null;
  }
  return cache[name];
}

export default function CardArt({ name, className = "", alt }) {
  const src = realImage(name);
  if (src) return <img className={className} src={src} alt={alt} />;
  const t = THEMES[name] || THEMES.arceus;
  return (
    <div
      className={`art-card ${className}`}
      role="img"
      aria-label={alt}
      style={{ "--a": t.a, "--b": t.b, "--c": t.c }}
    >
      <div className="ac-top"><span>{t.name}</span><span>HP {t.hp}</span></div>
      <div className="ac-window"><span className="ac-glyph">{t.glyph}</span></div>
      <div className="ac-lines"><i /><i /><i style={{ width: "60%" }} /></div>
    </div>
  );
}
