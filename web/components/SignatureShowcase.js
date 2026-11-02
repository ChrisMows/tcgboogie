import CardThumb from "@/components/CardThumb";
import { itemLabel, money } from "@/lib/collection";

/**
 * Signature cards, shown big (the Profile and the shared profile page). items: lib/showcase.js showcaseItem.
 * showValues: the value under each card (on the member's own Profile it follows the hide-values eye).
 * renderActions(item, index): buttons under a card (the member's own Profile only).
 */
export default function SignatureShowcase({ items, showValues = true, renderActions = null }) {
  return (
    <ul className={`sig-cards n${items.length}`}>
      {items.map((it, i) => (
        <li key={it.id} className="sig-card">
          <div className="sig-pic"><CardThumb item={it} width={220} /></div>
          <b className="sig-name">{String(it.name).replace(/\s*\(.*\)$/, "")}</b>
          <span className="small muted">{[it.setName, it.number && `#${it.number}`].filter(Boolean).join(" · ")}</span>
          <span className="small">{itemLabel(it)}{showValues && it.value != null && <> · <b className="sensitive">{money(it.value)}</b></>}</span>
          {renderActions?.(it, i)}
        </li>
      ))}
    </ul>
  );
}
