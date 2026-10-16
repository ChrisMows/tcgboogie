/** A card or sealed product picture at card proportions, with a tidy placeholder when there's no image. */
export default function CardThumb({ item, width = 64, className = "" }) {
  const style = { width, minWidth: width };
  if (item?.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`thumb ${className}`} style={style} src={item.image} alt="" loading="lazy" />;
  }
  return (
    <div className={`thumb thumb-ph ${item?.type === "sealed" || item?.productType === "sealed" ? "sealed" : ""} ${className}`} style={style} aria-hidden="true">
      {width >= 40 && <span className="ph-num">{item?.number ? `#${item.number.split("/")[0].replace(/^0+(?=\d)/, "")}` :item?.productType === "sealed" || item?.type === "sealed" ? "Sealed" : ""}</span>}
      {width >= 90 && <span className="ph-name">{item?.name?.replace(/\s*\(.*\)$/, "")}</span>}
    </div>
  );
}
