import Link from "next/link";
import { notFound } from "next/navigation";
import SignatureShowcase from "@/components/SignatureShowcase";
import { effectivePlanKey, effectiveTier } from "@/lib/access";
import { avatarFor, initials } from "@/lib/avatar";
import { loadPictures, pictureFor } from "@/lib/card-images";
import { loadProducts } from "@/lib/portfolio";
import { firstName, signatureCards } from "@/lib/showcase";
import * as store from "@/lib/store";

// A member's shared profile (Profile -> Share my profile): their picture, first name, plan and signature cards, at a
// private link only they hand out. Nothing else from the account: no email, no rest of the collection, and values only
// if they switched them on. Not for search engines (robots.js and the noindex below).
export const metadata = { title: "Collector profile", robots: { index: false, follow: false } };

export default async function SharedProfile({ params }) {
  const { token } = await params;
  const owner = await store.sharedProfileOwner(token);
  if (!owner) notFound();
  const [items] = await Promise.all([store.listItems(owner.id), loadPictures()]);
  const chosen = signatureCards(items.filter((it) => it.list === "owned"), owner.showcase?.items);
  // Pictures as the collection shows them: a saved one first, then the copy's own, then the catalog's (3 lookups at most).
  const products = await loadProducts(chosen.map((it) => it.productId)).catch(() => ({}));
  const picks = chosen.map((it) => ({ ...it, image: pictureFor(it.productId) || it.image || products[it.productId]?.image || null }));
  const avatar = avatarFor(owner);
  const premium = effectiveTier(owner) === "premium";
  const name = firstName(owner.name);

  return (
    <div className="wrap shared-prof">
      <section className="prof-head">
        <div className="prof-face">
          <span className="avatar-btn prof-avatar" aria-hidden="true">
            {avatar.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar.url} alt="" referrerPolicy="no-referrer" />
              : <span>{initials({ name })}</span>}
          </span>
        </div>
        <div className="prof-who">
          <div className="prof-name">
            <h1>{name}</h1>
            {premium && <span className="home-pro">{effectivePlanKey(owner) === "ultra" ? "ULTRA" : "PREMIUM"}</span>}
          </div>
          <span className="small muted">Collector on TCG Boogie</span>
        </div>
      </section>

      <section className="panel sig">
        <h2 className="sig-title">Signature cards</h2>
        {picks.length
          ? <SignatureShowcase items={picks} showValues={Boolean(owner.showcase?.showValues)} />
          : <p className="muted">{name} hasn&apos;t picked their signature cards yet.</p>}
      </section>

      <div className="panel shared-prof-cta">
        <div>
          <b>Track your own collection</b>
          <p className="small muted">TCG Boogie values your Pokémon cards every day and finds you deals on eBay. Free to start.</p>
        </div>
        <Link href="/" className="btn primary">See TCG Boogie</Link>
      </div>
    </div>
  );
}
