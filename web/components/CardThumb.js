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

function Slab({ item, style, className }) {
  const grade = String(item.grade || "").replace(" Pristine", "");
  const pristine = String(item.grade || "").includes("Pristine");
  return (
    <div className={`thumb slab slab-${String(item.grader).toLowerCase()} ${className}`} style={style}
      title={`${item.grader} ${item.grade}`} aria-label={`${item.grader} ${item.grade} slab`}>
      <div className="slab-label">
        <span className="slab-grader">{item.grader}</span>
        <span className="slab-name">{String(item.name || "").replace(/\s*\(.*\)$/, "")}{item.number ? ` #${String(item.number).split("/")[0]}` : ""}</span>
        <span className="slab-grade">{pristine ? <small>PRISTINE </small> : null}{grade}</span>
      </div>
      <div className="slab-window">
        {item.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={item.image} alt="" loading="lazy" />
          : <span className="slab-noimg">{item.number ? `#${String(item.number).split("/")[0]}` : ""}</span>}
      </div>
    </div>
  );
}
