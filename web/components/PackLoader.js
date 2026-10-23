/**
 * The loading screen between pages: the TCG Boogie pack being torn open (it shakes, the card rises with a sparkle and
 * a foil shine sweeps across). Used by the loading.js files, so it shows the moment a link is tapped. Motion is
 * turned off for members who ask their device for reduced motion.
 */
export default function PackLoader({ label = "Opening your pack…" }) {
  return (
    <div className="pack-loader" role="status" aria-live="polite">
      <div className="pack-art" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/pack.webp" alt="" width={112} height={112} />
        <span className="pack-shine" />
        <span className="pack-spark s1" />
        <span className="pack-spark s2" />
        <span className="pack-spark s3" />
      </div>
      <div className="pack-label">{label}</div>
    </div>
  );
}
