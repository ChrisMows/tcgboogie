import { X_HANDLE, X_URL } from "@/lib/social";

/** The X logo (currentColor). */
export const XIcon = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor" style={{ flex: "none" }}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

/** "Follow @TCGBoogie on X": a link to the X account. children replaces the default label. */
export default function XFollow({ className = "", children }) {
  return (
    <a href={X_URL} target="_blank" rel="noopener noreferrer me" className={`x-follow ${className}`}>
      <XIcon />{children || <span>Follow {X_HANDLE} on X</span>}
    </a>
  );
}
