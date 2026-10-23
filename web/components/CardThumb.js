/**
 * A card or sealed product picture at card proportions, with a tidy placeholder when there's no image. Graded copies
 * show slabbed: the card inside a clear case under the grader's label (PSA, BGS, CGC, SGC, TAG) with its grade, so a
 * raw copy and a graded copy of the same card look different side by side.
 */
export default function CardThumb({ item, width = 64, className = "" }) {
  const style = { width, minWidth: width };
  if (item?.kind === "graded" && item.grader) return <Slab item={item} style={style} className={className} />;
  if (item?.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`thumb ${className}`} style={style} src={item.image} alt="" loading="lazy" />;
  }
  return <Placeholder item={item} width={width} style={style} className={className} />;
}

function Placeholder({ item, width, style, className = "" }) {
  return (
    <div className={`thumb thumb-ph ${item?.type === "sealed" || item?.productType === "sealed" ? "sealed" : ""} ${className}`} style={style} aria-hidden="true">
      {width >= 40 && <span className="ph-num">{item?.number ? `#${item.number.split("/")[0].replace(/^0+(?=\d)/, "")}` :item?.productType === "sealed" || item?.type === "sealed" ? "Sealed" : ""}</span>}
      {width >= 90 && <span className="ph-name">{item?.name?.replace(/\s*\(.*\)$/, "")}</span>}
    </div>
  );
}

// The short condition each grader prints next to the number. Half grades take the whole grade's words plus "+".
const WORDS = {
  PSA: { 10: "GEM MT", 9: "MINT", 8: "NM-MT", 7: "NM", 6: "EX-MT", 5: "EX", 4: "VG-EX", 3: "VG", 2: "GOOD", 1.5: "FR", 1: "PR" },
  BGS: { 10: "PRISTINE", 9.5: "GEM MINT", 9: "MINT", 8: "NM-MT", 7: "NM", 6: "EX-MT", 5: "EX", 4: "VG-EX", 3: "VG", 2: "GOOD", 1: "POOR" },
  CGC: { 10: "GEM MINT", 9.5: "MINT+", 9: "MINT", 8: "NM/MINT", 7: "NM", 6: "EX/NM", 5: "EX", 4: "VG/EX", 3: "VG", 2: "GOOD", 1: "POOR" },
  SGC: { 10: "GEM MINT", 9.5: "MINT+", 9: "MINT", 8: "NM/MT", 7: "NM", 6: "EX/NM", 5: "EX", 4: "VG/EX", 3: "VG", 2: "GOOD", 1: "POOR" },
  TAG: { 10: "GEM MINT", 9: "MINT", 8: "NM-MT", 7: "NM", 6: "EX-MT", 5: "EX", 4: "VG-EX", 3: "VG", 2: "GOOD", 1: "POOR" },
};
export function gradeWords(grader, grade) {
  if (/pristine/i.test(String(grade))) return "PRISTINE";
  const n = Number(String(grade).replace(/[^\d.]/g, ""));
  const table = WORDS[grader] || WORDS.PSA;
  if (table[n]) return table[n];
  return table[Math.floor(n)] ? `${table[Math.floor(n)]}+` : "";
}

function Slab({ item, style, className }) {
  const grade = String(item.grade || "").replace(" Pristine", "");
  // Each company's special labels: black and gold for CGC Pristine 10 and BGS 10, gold for BGS 9.5.
  const tier = (item.grader === "CGC" && /pristine/i.test(String(item.grade))) || (item.grader === "BGS" && Number(grade) === 10) ? "slab-black"
    : item.grader === "BGS" && Number(grade) === 9.5 ? "slab-gold" : "";
  return (
    <div className={`thumb slab slab-${String(item.grader).toLowerCase()} ${tier} ${className}`} style={style}
      title={`${item.grader} ${item.grade}`} aria-label={`${item.grader} ${item.grade} slab`}>
      <div className="slab-case">
      <div className="slab-label">
        <span className="slab-words">{gradeWords(item.grader, item.grade)}</span>
        <span className="slab-score"><span className="slab-grader">{item.grader}</span><span className="slab-grade">{grade}</span></span>
      </div>
      <div className="slab-window">
        {item.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.image} alt="" loading="lazy" />
          : <span className="slab-noimg">{item.number ? `#${String(item.number).split("/")[0]}` : ""}</span>}
      </div>
      </div>
    </div>
  );
}
