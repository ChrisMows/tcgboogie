import Link from "next/link";

export const metadata = { title: "Check your email" };

export default function CheckEmail() {
  return (
    <div className="wrap">
      <div className="auth-box" style={{ textAlign: "center" }}>
        <h1>Check your email</h1>
        <p className="muted">
          We sent you a sign-in link. It expires in 24 hours and works once. Don't see it? Check your spam or promotions
          folder.
        </p>
        <Link href="/login" className="btn" style={{ marginTop: 12 }}>Back to log in</Link>
      </div>
    </div>
  );
}
