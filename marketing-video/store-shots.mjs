// Google Play listing images from the site in demo mode (sample data, no member's information):
//   node store-shots.mjs  -> ../android-app/store-assets/feature-graphic.png (1024x500) and phone-1..6.png (1080x1920)
// Each phone image is a phone-sized screenshot under a caption, in the site's own fonts and colours.
// Needs the site running in demo mode on SITE (default http://localhost:3000, the dev preview).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.SITE || "http://localhost:3000";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.resolve("../android-app/store-assets");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Demo-only bits (the demo bar, the dev badge, the helper button, tips) stay out of the pictures.
const HIDE = `.demo-bar, nextjs-portal, .helper-fab, .app-toast, .start-here, .install-app, .tabbar a[href^="/app/admin"], .demo-hint { display: none !important; }`;

const SHOTS = [
  { url: "/app/home", title: "Your collection,", accent: "valued daily", sub: "Totals, gains and a chart that updates every day" },
  { url: "/app/deals", title: "Catch deals", accent: "before the auction ends", sub: "We price every eBay auction against real sales",
    // Open the first filter and show the deals it caught.
    prepare: async (page) => {
      await page.locator('[data-tour="filter-open"]').first().click();
      await page.locator(".deal-tiles").first().waitFor({ timeout: 15000 });
      await sleep(1200);
      await page.locator(".deal-tiles").first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 78));
    } },
  { url: "/app/collection", title: "Cards, slabs", accent: "and sealed", sub: "Every graded card and sealed product, valued" },
  { url: "CARD", title: "Real sales,", accent: "not guesses", sub: "Market prices and graded sales for every card" },
  { url: "/app/collection/photo", title: "Snap a card,", accent: "we find it", sub: "Point your camera at any card for its price" },
  { url: "/app/profile", title: "Show off your", accent: "signature cards", sub: "Your profile, shared only if you want",
    // Pick the 3 most valuable demo cards (the picker lists them first), then show them.
    prepare: async (page) => {
      for (let i = 0; i < 3; i++) {
        const open = page.locator(i === 0 ? "button.sig-empty" : ".sig-head button", { hasText: i === 0 ? "" : "Add" });
        if (!(await open.count())) break;
        await open.first().waitFor(); await sleep(800); await open.first().click();
        await page.locator(".sig-picker li button").first().click();
        await page.locator(".sig-picker").waitFor({ state: "detached" });
        await sleep(1200);
      }
      await page.locator(".sig-cards").first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90));
    } },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// Phone screenshots: 432x624 CSS pixels at 2.5x, framed 1080 wide under the caption.
const phone = await browser.newContext({ viewport: { width: 432, height: 624 }, deviceScaleFactor: 2.5, colorScheme: "dark",
  locale: "en-US", isMobile: true, hasTouch: true });
const page = await phone.newPage();
let cardUrl = null;
const raws = [];
for (const s of SHOTS) {
  if (s.url === "CARD") {
    if (!cardUrl) {
      await page.goto(`${SITE}/app/collection`, { waitUntil: "networkidle" });
      cardUrl = await page.locator('a[href^="/app/cards/"]').first().getAttribute("href");
    }
    s.url = cardUrl;
  }
  await page.goto(`${SITE}${s.url}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: HIDE });
  await sleep(800);
  // Close the "New" feature tip if it opened.
  if (await page.locator("dialog.intro-dialog[open]").count()) { await page.keyboard.press("Escape"); await sleep(400); }
  if (s.prepare) await s.prepare(page);
  await sleep(700);
  raws.push((await page.screenshot({ type: "png" })).toString("base64"));
  console.log("shot", s.url);
}

// Compose on a page of the site itself, so its fonts are loaded.
const canvas = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, colorScheme: "dark" });
const c = await canvas.newPage();
await c.goto(`${SITE}/`, { waitUntil: "networkidle" });
const frame = (s, raw) => `
  <style>
    body { margin: 0; background: radial-gradient(ellipse at 50% 0%, #1d2612 0%, #0b0e12 60%); width: 1080px; height: 1920px; overflow: hidden; }
    .cap { position: absolute; top: 96px; left: 0; right: 0; text-align: center; padding: 0 70px; }
    .cap h1 { margin: 0; font: 600 82px/1.08 var(--font-head), sans-serif; letter-spacing: -0.03em; color: #f4f5ef; }
    .cap h1 em { font-style: normal; color: #d3ff66; display: block; }
    .cap p { margin: 26px 0 0; font: 500 38px/1.3 var(--font-body), sans-serif; color: #c9d1dd; }
    .shot { position: absolute; left: 90px; top: 470px; width: 900px; border-radius: 44px; overflow: hidden;
      border: 6px solid #2a313b; box-shadow: 0 40px 90px rgba(0,0,0,.6); }
    .shot img { display: block; width: 100%; }
  </style>
  <div class="cap"><h1>${s.title}<em>${s.accent}</em></h1><p>${s.sub}</p></div>
  <div class="shot"><img src="data:image/png;base64,${raw}" /></div>`;
for (let i = 0; i < SHOTS.length; i++) {
  await c.evaluate((html) => { document.body.className = ""; document.body.innerHTML = html; }, frame(SHOTS[i], raws[i]));
  await c.waitForFunction(() => [...document.images].every((im) => im.complete));
  await c.screenshot({ path: path.join(OUT, `phone-${i + 1}.png`), clip: { x: 0, y: 0, width: 1080, height: 1920 } });
}

// Feature graphic: logo, headline and the foil pack.
await c.setViewportSize({ width: 1024, height: 500 });
await c.evaluate(() => {
  document.body.className = "";
  document.body.innerHTML = `
  <style>
    body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: radial-gradient(ellipse at 78% 50%, #26331a 0%, #0b0e12 62%); }
    .fg { position: relative; height: 500px; display: flex; align-items: center; padding: 0 64px; box-sizing: border-box; }
    .txt { width: 600px; }
    .txt img { width: 300px; display: block; margin-bottom: 26px; }
    .txt h1 { margin: 0; font: 600 54px/1.08 var(--font-head), sans-serif; letter-spacing: -0.03em; color: #f4f5ef; }
    .txt h1 em { font-style: normal; color: #d3ff66; }
    .txt p { margin: 18px 0 0; font: 500 24px/1.35 var(--font-body), sans-serif; color: #c9d1dd; }
    .pack { position: absolute; right: 80px; top: 50%; height: 400px; transform: translateY(-50%) rotate(8deg); filter: drop-shadow(0 30px 50px rgba(0,0,0,.6)); }
  </style>
  <div class="fg">
    <div class="txt">
      <img src="/brand/logo.webp" alt="" />
      <h1>Your next grail.<br /><em>Your kind of price.</em></h1>
      <p>eBay deals, daily collection values and price alerts for card collectors.</p>
    </div>
    <img class="pack" src="/brand/foil-pack.webp" alt="" />
  </div>`;
});
await c.waitForFunction(() => [...document.images].every((im) => im.complete && im.naturalWidth));
await sleep(300);
await c.screenshot({ path: path.join(OUT, "feature-graphic.png"), clip: { x: 0, y: 0, width: 1024, height: 500 } });

await browser.close();
console.log("done ->", OUT);
