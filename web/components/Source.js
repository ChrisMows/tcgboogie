// A marketplace name badge (styled text, not the marketplaces' official logo files).
const NAMES = { ebay: "eBay", tcgplayer: "TCGplayer" };

export default function Source({ name, className = "" }) {
  if (name === "ebay") {
    return (
      <span className={`src src-ebay ${className}`} aria-label="eBay">
        <i style={{ color: "#e53238" }}>e</i><i style={{ color: "#0064d2" }}>b</i><i style={{ color: "#f5af02" }}>a</i><i style={{ color: "#86b817" }}>y</i>
      </span>
    );
  }
  return <span className={`src src-${name} ${className}`}>{NAMES[name] || name}</span>;
}
