// Records the marketing video's scenes from the site in demo mode (sample data, no member's information), as
// sharp JPEG frames via Chrome's screencast, then make-video.mjs cuts them together.
//   node record.mjs vertical   -> clips/vertical/*.mp4  (1080x1920, phone layout)
//   node record.mjs wide       -> clips/wide/*.mp4      (1920x1080, desktop layout)
// Needs the site running in demo mode on SITE (default http://localhost:3100: `npx next start -p 3100` in web/).
import { chromium } from "playwright-core";
import ffmpegPath from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE || "http://localhost:3100";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FORMAT = process.argv[2] === "wide" ? "wide" : "vertical";
const ONLY = process.argv[3] || null; // record one scene by name while tuning
const SIZES = {
  vertical: { viewport: { width: 432, height: 768 }, scale: 2.5, out: [1080, 1920] },
  wide: { viewport: { width: 1152, height: 648 }, scale: 1920 / 1152, out: [1920, 1080] },
};
const { viewport, scale, out } = SIZES[FORMAT];
const OUT_DIR = path.join("clips", FORMAT);
fs.mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Captions, a tap marker and the full-screen title/end cards, in the site's own fonts and colours. Demo-only bits
// (the demo bar, the dev badge, the floating helper button) are hidden.
const OVERLAY = `
(() => {
  const css = \`
    .demo-bar, nextjs-portal, .helper-fab, .app-toast, .start-here { display: none !important; }
    html { scroll-behavior: auto !important; }
    #mv-cap { position: fixed; left: 50%; transform: translate(-50%, 16px); z-index: 99999; opacity: 0; pointer-events: none;
      transition: opacity .35s ease, transform .35s ease; text-align: center; width: max-content; max-width: 86vw;
      background: rgba(8, 10, 13, .92); border: 2px solid #d3ff66; border-radius: 18px; padding: .55em .9em .6em;
      box-shadow: 0 18px 50px rgba(0,0,0,.65), 0 0 0 6px rgba(211,255,102,.08); }
    #mv-cap.on { opacity: 1; transform: translate(-50%, 0); }
    #mv-cap b { display: block; font: 700 var(--mv-size) var(--font-head), sans-serif; letter-spacing: -0.02em; line-height: 1.2; color: #d3ff66; }
    #mv-cap span { display: block; margin-top: .3em; font: 600 var(--mv-sub) var(--font-body), sans-serif; color: #f4f5ef; line-height: 1.35; }
    #mv-tap { position: fixed; z-index: 99998; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      background: rgba(211,255,102,.35); border: 3px solid #d3ff66; pointer-events: none; opacity: 0; transition: left .45s ease, top .45s ease, opacity .2s; }
    #mv-tap.on { opacity: 1; }
    #mv-tap.press { animation: mv-press .35s ease; }
    @keyframes mv-press { 50% { transform: scale(.7); background: rgba(211,255,102,.75); } }
    #mv-card { position: fixed; inset: 0; z-index: 99997; background: radial-gradient(ellipse at 50% 35%, #1d2612 0%, #0b0e12 62%);
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; text-align: center; padding: 8vw;
      opacity: 0; transition: opacity .4s ease; }
    #mv-card.on { opacity: 1; }
    #mv-card img.logo { width: min(80vw, 62vh); }
    #mv-card h1 { margin: 0; font: 700 var(--mv-size) var(--font-head), sans-serif; color: #f4f5ef; letter-spacing: -0.03em; line-height: 1.15; }
    #mv-card h1 em { font-style: normal; color: #d3ff66; }
    #mv-card p { margin: 0; font: 500 var(--mv-sub) var(--font-body), sans-serif; color: #c9d1dd; }
    #mv-card .url { margin-top: 6px; font: 700 var(--mv-size) var(--font-head), sans-serif; color: #0b0e12; background: #d3ff66; padding: .15em .5em; border-radius: 12px; }
  \`;
  const add = () => {
    if (document.getElementById('mv-style')) return;
    const s = document.createElement('style'); s.id = 'mv-style'; s.textContent = css; document.head.appendChild(s);
    const c = document.createElement('div'); c.id = 'mv-cap'; document.body.appendChild(c);
    const t = document.createElement('div'); t.id = 'mv-tap'; document.body.appendChild(t);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();`;

async function setVars(page) {
  const vertical = FORMAT === "vertical";
  await page.evaluate(([v]) => {
    const r = document.documentElement.style;
    r.setProperty("--mv-size", v ? "27px" : "40px");
    r.setProperty("--mv-sub", v ? "16px" : "22px");
  }, [vertical]);
}

async function caption(page, title, sub = "", { top = false } = {}) {
  const vertical = FORMAT === "vertical";
  await page.evaluate(([t, s, top, v]) => {
    const c = document.getElementById("mv-cap");
    if (!c) return;
    c.classList.remove("on");
    setTimeout(() => {
      c.style.top = top ? (v ? "9%" : "8%") : "auto";
      c.style.bottom = top ? "auto" : (v ? "12%" : "8%");
      c.innerHTML = t ? `<b>${t}</b>${s ? `<span>${s}</span>` : ""}` : "";
      if (t) c.classList.add("on");
    }, 180);
  }, [title, sub, top, vertical]);
  await sleep(450);
}

async function card(page, html) {
  await page.evaluate((h) => {
    let c = document.getElementById("mv-card");
    if (!c) { c = document.createElement("div"); c.id = "mv-card"; document.body.appendChild(c); }
    c.innerHTML = h;
    requestAnimationFrame(() => c.classList.add("on"));
  }, html);
}

/** Move the tap marker to an element, press, then click it for real. */
async function tap(page, selector, { pause = 450 } = {}) {
  const el = page.locator(selector).first();
  await el.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) e.scrollIntoView({ block: "center" }); });
  await sleep(250);
  const box = await el.boundingBox();
  if (!box) throw new Error(`Can't tap ${selector}: not visible`);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.evaluate(([x, y]) => {
    const t = document.getElementById("mv-tap");
    t.classList.add("on"); t.style.left = `${x}px`; t.style.top = `${y}px`;
  }, [x, y]);
  await sleep(pause);
  await page.evaluate(() => { const t = document.getElementById("mv-tap"); t.classList.remove("press"); void t.offsetWidth; t.classList.add("press"); });
  await el.click();
  await sleep(300);
  await page.evaluate(() => document.getElementById("mv-tap").classList.remove("on"));
}

async function typeInto(page, selector, text) {
  await tap(page, selector, { pause: 350 });
  await page.keyboard.type(text, { delay: 75 });
}

async function smoothScrollTo(page, selector, block = "center") {
  await page.locator(selector).first().evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block);
  await sleep(900);
}

/** Record one scene: frames from Chrome's screencast, timed, then encoded to an MP4 clip. */
async function record(page, name, prep, run) {
  if (ONLY && ONLY !== name) return;
  await prep();
  const dir = path.join(OUT_DIR, `${name}-frames`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: out[0], maxHeight: out[1], everyNthFrame: 1 });
  const start = Date.now() / 1000;
  await run();
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await sleep(200);
  if (!frames.length) throw new Error(`${name}: no frames`);
  // Hold each frame until the next one (Chrome only sends a frame when something changes).
  const lines = [];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : end;
    const from = i === 0 ? Math.max(start, f.t) : f.t;
    lines.push(`file '${path.resolve(f.file).replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - from).toFixed(4)}`);
  });
  lines.push(`file '${path.resolve(frames[frames.length - 1].file).replace(/\\/g, "/")}'`);
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, lines.join("\n"));
  const mp4 = path.join(OUT_DIR, `${name}.mp4`);
  execFileSync(ffmpegPath, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `scale=${out[0]}:${out[1]}:force_original_aspect_ratio=decrease,pad=${out[0]}:${out[1]}:(ow-iw)/2:(oh-ih)/2:color=0x0b0e12,fps=30,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", mp4]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${FORMAT}/${name}: ${(end - start).toFixed(1)}s, ${frames.length} frames`);
}

async function open(page, url, ready) {
  await page.goto(`${SITE}${url}`, { waitUntil: "networkidle" });
  await page.evaluate(OVERLAY);
  await setVars(page);
  if (ready) await page.locator(ready).first().waitFor({ timeout: 15000 });
  await sleep(600);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: "dark", locale: "en-US",
  isMobile: FORMAT === "vertical", hasTouch: FORMAT === "vertical" });
await context.addInitScript(OVERLAY);
const page = await context.newPage();
const V = FORMAT === "vertical";

// 1. Opening: the homepage hero.
await record(page, "01-hero", async () => {
  await open(page, "/?home=1", "h1");
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
}, async () => {
  await caption(page, "Meet TCG Boogie", "Built for Pokémon card collectors");
  await sleep(2600);
});

// 2. Deals: a filter and the deals it caught.
await record(page, "02-deals", async () => {
  await open(page, "/app/deals", '[data-tour="filter-open"]');
}, async () => {
  await caption(page, "We watch every eBay auction, 24/7");
  await tap(page, '[data-tour="filter-open"]');
  await sleep(900);
  await smoothScrollTo(page, ".deal-tiles", V ? "start" : "center");
  await sleep(700);
  await caption(page, "and alert you when a card sells", "way under what it's really worth");
  await page.mouse.wheel(0, V ? 260 : 180);
  await sleep(2400);
});

// 3. Price alerts: find a card, choose selling.
await record(page, "03-alerts", async () => {
  await open(page, "/app/watches", '[data-tour="alert-search"]');
}, async () => {
  await caption(page, "Set your price.", "We'll tell you the moment it hits");
  await typeInto(page, '[data-tour="alert-search"]', "Charizard");
  await page.keyboard.press("Enter");
  await page.locator('[data-tour="alert-results"], [data-tour="alert-direction"]').first().waitFor({ timeout: 10000 });
  await sleep(500);
  if (await page.locator('[data-tour="alert-results"]').count()) await tap(page, '[data-tour="alert-results"] button');
  await page.locator('[data-tour="alert-direction"]').waitFor({ timeout: 10000 });
  await smoothScrollTo(page, '[data-tour="alert-direction"]');
  await tap(page, '[data-tour="alert-direction"] button:nth-child(2)');
  await sleep(1600);
});

// 4. Collection: value, chart, cards and slabs.
await record(page, "04-collection", async () => {
  await open(page, "/app/collection", ".tile-grid, .item-list");
}, async () => {
  await caption(page, "Your whole collection,", "valued every day");
  await sleep(1800);
  await smoothScrollTo(page, ".tile-grid, .item-list", "start");
  await caption(page, "Graded cards show up as real slabs");
  await page.mouse.wheel(0, V ? 300 : 200);
  await sleep(2200);
});

// 5. The pack opening when you add a card.
await record(page, "05-pack", async () => {
  await open(page, "/app/collection?add=1", '[data-tour="add-search"]');
}, async () => {
  await caption(page, "Add a card…");
  await typeInto(page, '[data-tour="add-search"]', "Umbreon");
  await page.locator(".result-tile").first().waitFor({ timeout: 10000 });
  await sleep(600);
  await tap(page, ".result-tile .btn.primary");
  await page.locator(".reveal").first().waitFor({ timeout: 10000 });
  await caption(page, "…and pull it like a real pack ✨", "", { top: true });
  await sleep(5600);
});

// 6. Tools: Worth Grading?
await record(page, "06-grading", async () => {
  await open(page, "/app/collection/grading", "h1, h2");
}, async () => {
  await caption(page, "See which cards are worth grading", "and check any trade before you say yes");
  await sleep(1200);
  await page.mouse.wheel(0, V ? 320 : 220);
  await sleep(2400);
});

// 7. Boogie Bot: an answer, then Show me how.
await record(page, "07-boogie", async () => {
  await page.goto(`${SITE}/app/collection`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    sessionStorage.removeItem("tcgb-tour");
    sessionStorage.setItem("tcgb-helper", JSON.stringify([
      { role: "user", text: "How do I set up a deal filter?" },
      { role: "assistant", text: "Here's how:\n1. Go to [Deals → My filters](/app/deals) and tap \"+ New filter\".\n2. Tap Cards and pick the cards you want.\n3. Set the grade, price and discount.\n4. Tap \"Update this filter\". We'll watch every auction for you.", tour: "deal-filter" },
    ]));
  });
  await open(page, "/app/collection", ".tile-grid, .item-list");
}, async () => {
  await sleep(400);
  await page.evaluate(() => window.dispatchEvent(new Event("tcgb-helper-open")));
  await page.locator(".helper .helper-tour").waitFor({ timeout: 10000 });
  await caption(page, "Stuck? Ask Boogie Bot");
  await sleep(2200);
  await caption(page, "It answers, then shows you", "exactly where to tap", { top: !V });
  await tap(page, ".helper .helper-tour");
  await page.locator(".tour-ring").waitFor({ timeout: 15000 });
  await sleep(3200);
});

// 8. Plans.
await record(page, "08-pricing", async () => {
  await page.evaluate(() => { try { sessionStorage.removeItem("tcgb-tour"); } catch {} });
  await open(page, "/?home=1", "#pricing");
  // Wide: the caption sits where the section heading is, and says the same thing.
  if (!V) await page.addStyleTag({ content: "#pricing > .eyebrow, #pricing > h2, #pricing > .sub { visibility: hidden; }" });
  // The local copy has no Stripe key; say what the live site says.
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) if (n.nodeValue.includes("Card payments launch soon.")) n.nodeValue = n.nodeValue.replace("Card payments launch soon.", "Secure checkout by Stripe.");
  });
  await page.locator("#pricing").evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 10));
  await sleep(600);
}, async () => {
  await caption(page, "Free forever.", "Premium is $9.99/mo with 7 days free", { top: !V });
  await sleep(1300);
  if (V) await page.locator(".plan.featured").evaluate((el, v) => {
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: r.top + scrollY - (v ? 70 : Math.max(70, (innerHeight - r.height) / 2)), behavior: "smooth" });
  }, V);
  await sleep(2600);
});

// 9. End card.
await record(page, "09-end", async () => {
  await open(page, "/?home=1");
}, async () => {
  await page.evaluate(() => document.getElementById("mv-cap")?.classList.remove("on"));
  await card(page, `
    <img class="logo" src="/brand/logo.webp" alt="TCG Boogie">
    <h1>Your next grail.<br>Your kind of <em>price.</em></h1>
    <div class="url">tcgboogie.com</div>
    <p>Start free. No card needed.</p>`);
  await sleep(3400);
});

await browser.close();
