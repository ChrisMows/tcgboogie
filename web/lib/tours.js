// "Show me how" walkthroughs (components/TourRunner.js). Boogie Bot (lib/helper.js) offers one when it fits the
// question; anything can start one with window.dispatchEvent(new CustomEvent("tcgb-tour", { detail: id })).
//
// Each step points at something on the page, marked in the code with data-tour="…" (search for the name):
//   path    open this page first (if the member isn't on it)
//   at      instead of opening a page, wait for the member to get to a page matching this (they tap something)
//   target  CSS selector of what to point at (or a list: the first one on the page); none = a message mid-screen
//   alt     { has, text }: say this instead when `has` is on the page (e.g. already connected)
//   open    if the target isn't there, tap this first (e.g. open a filter so its buttons show)
//   tap     move on when the member taps the target (Next still works)
//   until   move on when this appears on the page (e.g. after typing a search)
//   typed   move on once they've typed something into the target (a short pause after their last key)
//   then    when they tap Next, tap this first (e.g. close a pop-up that would cover the next button)
//   end     if this target is there, it's the last step (e.g. "Connect eBay" first: the rest comes after)
//   wait    don't skip a missing target: show this note and wait for it (it appears after they do something)
// A step whose target never shows up (a plan without that feature, an empty collection) is skipped.
const t = (name) => `[data-tour="${name}"]`;

export const TOURS = {
  "deal-filter": {
    title: "Set up a deal filter",
    about: "creating a deal filter in Deals → My filters: picking cards, grade, condition, value, discount, timing, saving",
    steps: [
      { path: "/app/deals", target: t("filter-new"), text: "Tap + New filter to start one. (Already have a filter? You can open it instead.)", tap: true },
      { target: t("facet-cards"), open: t("filter-open"), text: "Tap Cards to choose which cards you want deals on.", tap: true },
      { target: t("facet-pop-cards"), text: "Search by name and number, then tick the cards you want. Or choose \"Any card named …\" to cover every version of a Pokémon. Tap Done when you're finished.", then: `${t("facet-pop-cards")} .btn.primary` },
      { target: t("facet-product"), text: "Product type: graded slabs, raw cards, sealed product, or a mix." },
      { target: t("facet-gradeRange"), text: "For slabs, pick the grading company and the grade range you want (for example PSA 9 to 10)." },
      { target: t("facet-condition"), text: "For raw cards, pick the conditions you'll accept." },
      { target: t("facet-value"), text: "Set the card values you care about (and, under All filters, the most you'll pay with shipping)." },
      { target: t("facet-discount"), text: "How far below market a listing has to be. 20% is a good start; higher means fewer, better deals." },
      { target: t("facet-time"), text: "How close to the end of the auction you want to hear about it." },
      { target: t("filter-save"), text: "Tap Update this filter to save it. That's it: we watch every ending eBay auction for you.", tap: true },
      { target: t("filter-results"), text: "Deals from the last 7 days that match show here, so you can see what this filter catches." },
    ],
  },
  "price-alert": {
    title: "Add a price alert",
    about: "a price alert on any card or sealed product: buying (drops to a price) or selling (climbs to a price)",
    steps: [
      { path: "/app/watches", target: t("alert-search"), text: "Tap this box and type the card you want an alert on: its name and number, like \"Umbreon VMAX 215\". Sealed products work too.", typed: true, until: `${t("alert-results")}, ${t("alert-direction")}` },
      { target: t("alert-find"), text: "Now tap Find to look it up.", until: `${t("alert-results")}, ${t("alert-direction")}` },
      { target: t("alert-results"), text: "Tap the right card or product.", until: t("alert-direction") },
      { target: t("alert-direction"), text: "Buying? Pick 📉 to hear when it drops. Selling? Pick 📈 to hear when it climbs." },
      { target: t("alert-target"), text: "Enter your price (or switch to a % change)." },
      { target: t("alert-submit"), text: "Tap Add alert. We'll tell you the moment it hits your price.", tap: true },
      { target: t("alert-channels"), text: "Choose where alerts go: email, Discord or text. Tap a switch to turn one on or off." },
    ],
  },
  "add-card": {
    title: "Add a card to your collection",
    about: "adding a card to the collection by searching its name and number",
    steps: [
      { path: "/app/collection?add=1", target: t("add-search"), text: "Type the card's name and its number, like \"Charizard ex 199\". English and Japanese cards both come up.", until: ".result-tile" },
      { target: ".result-tile .btn.primary", text: "Tap + Add to add one Near Mint copy right away…" },
      { target: ".result-tile .result-tile-main", text: "…or tap the card itself to choose condition, grade, quantity, what you paid and a binder first." },
      { target: t("add-more"), text: "Got lots of cards? Tap a whole set, photograph a binder page, or import a file from another app." },
    ],
  },
  "request-card": {
    title: "Add a card from an eBay or TCGplayer link",
    about: "requesting a card or sealed product we don't list by pasting an eBay listing or TCGplayer link",
    steps: [
      { path: "/app/collection?add=1", target: t("add-search"), text: "First search for the card. If it doesn't come up, a request link appears under the search.", until: t("request-open") },
      { target: t("request-open"), text: "Tap \"Can't find it? Request a card or sealed product\".", tap: true },
      { target: t("request-kind"), text: "Choose whether it's a card or sealed product." },
      { target: t("request-link"), text: "Paste a link to it: an eBay listing or a TCGplayer page works best." },
      { target: t("request-send"), text: "Tap Send. TCGplayer and eBay Pokémon cards are usually added on the spot, and then search finds them for everyone.", tap: true },
    ],
  },
  "import": {
    title: "Import your collection",
    about: "importing a collection from a CSV file exported from TCGplayer, Collectr, PriceCharting or a spreadsheet",
    steps: [
      { path: "/app/collection/import", target: t("import-file"), text: "Export a CSV from your other app or spreadsheet, then tap here and choose the file." },
      { text: "If we don't recognise the columns, we'll work out which is which and show you, so you can correct them." },
      { target: t("import-match"), text: "Tap Find these cards to match each row to a card.", tap: true, wait: "Choose your CSV file and I'll show you the next step." },
      { target: t("import-go"), text: "Check the matches (untick any that are wrong), then tap Import.", wait: "Finding your cards… the Import button appears when they're matched." },
    ],
  },
  "binders": {
    title: "Make a binder",
    about: "binders: creating one and putting cards in it",
    steps: [
      { path: "/app/collection?tab=binders", target: t("binder-new"), text: "Name your binder (e.g. \"For trade\") and tap + Add binder." },
      { path: "/app/collection", target: ".tile-link, .item-row .item-name", text: "To put a card in a binder, open the card.", at: "^/app/cards/" },
      { at: "^/app/cards/", target: t("item-edit"), text: "Tap Edit on your copy.", tap: true },
      { at: "^/app/cards/", target: t("item-binder"), text: "Pick the binder here and tap Save changes. When you add new cards, you can choose a binder at the same time." },
      { path: "/app/collection?tab=binders", target: `.binder-grid, ${t("binder-new")}`, text: "Back on the Binders tab, each binder shows its cards and value. Tap one to see just those cards." },
    ],
  },
  "alert-channels": {
    title: "Choose how alerts reach you",
    about: "how alerts reach you: turning on email, Discord or text message (SMS) alerts, adding a phone number, connecting Discord, the email recap",
    steps: [
      { path: "/app/account", target: "#alerts", text: "Under How we reach you, tick Email, Discord or Text message, choose your email recap, then tap Save alert settings." },
      { target: "#phone", text: "For text alerts, add your phone number here and confirm it with the code we text you." },
      { target: "#connections", text: "For Discord alerts, connect your Discord account here." },
    ],
  },
  "connect-ebay": {
    title: "Connect your eBay account",
    about: "connecting (or checking or disconnecting) the eBay seller account in Settings → Connected accounts, so you can sell from your collection",
    steps: [
      { path: "/app/account", target: ["#ebay a[href=\"/api/ebay/connect\"]", "#ebay"],
        text: "Tap Connect eBay. You'll sign in on eBay's own site (we never see your password) and come straight back here.",
        alt: { has: "#ebay .badge.good", text: "You're already connected to eBay ✓ Use Sell on eBay on any card in your collection. Disconnect is here if you ever need it." } },
    ],
  },
  "sell-ebay": {
    title: "Sell a card on eBay",
    about: "listing a card from your collection for sale on eBay with Sell on eBay (only when they want to sell a card)",
    steps: [
      { path: "/app/collection", target: ".tile-link, .item-row .item-name", text: "Tap a card you own to open its page.", at: "^/app/cards/" },
      { at: "^/app/cards/", target: t("sell-open"), text: "Tap Sell on eBay.", tap: true },
      { at: "^/app/collection/sell/", target: "a[href=\"/api/ebay/connect\"]", text: "First, connect your eBay seller account (we never see your eBay password). Then come back to Sell on eBay and ask me again.", end: true },
      { target: t("sell-photos"), text: "Add photos: front, back and any close-ups." },
      { target: "#title", text: "We filled in the title from the card, grade and set. Change anything you like." },
      { target: t("sell-price"), text: "Choose Buy It Now or Auction and your price. We suggest one from recent sales." },
      { target: t("sell-shipping"), text: "Enter your ZIP code and pick your shipping, payment and return policies." },
      { target: t("sell-go"), text: "Tap to list it. The listing is yours, and eBay's normal fees apply." },
    ],
  },
};

export const TOUR_IDS = Object.keys(TOURS);
