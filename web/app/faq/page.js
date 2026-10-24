import Link from "next/link";
import AskHelper from "@/components/AskHelper";
import { SuggestIdea } from "@/components/IdeaBox";
import { currentFaq } from "@/lib/faq";

export const metadata = { title: "FAQ" };

export default async function FAQ() {
  const list = await currentFaq();
  return (
    <div className="wrap doc">
      <h1>Questions? Answers.</h1>
      <p className="updated">Still stuck? <AskHelper /> or email support@tcgboogie.com. Wish we did something we don&apos;t? <SuggestIdea source="faq" label="Suggest an idea" /></p>
      <nav className="faq-topics" aria-label="FAQ topics">
        {list.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}
      </nav>
      {list.map(([id, title, items]) => (
        <section key={id} id={id} className="faq-group">
          <h2>{title}</h2>
          {items.map(([q, a]) => (
            <details className="faq" key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      ))}
      <p className="hint" style={{ marginTop: 20 }}>
        Values are estimates from past sales, not financial advice. More in our <Link href="/terms">Terms</Link> and{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </div>
  );
}
