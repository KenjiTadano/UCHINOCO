import type { DecorationId } from "@/lib/album-polish/types";

const STROKE = "#8d7364";

export function PolishMark({ id }: { id: DecorationId }) {
  const common = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: STROKE,
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (id === "paw") {
    return (
      <svg {...common}>
        <ellipse cx="16" cy="20" rx="5" ry="4" fill={STROKE} fillOpacity="0.18" />
        <circle cx="9" cy="13" r="2.1" fill={STROKE} fillOpacity="0.35" />
        <circle cx="14" cy="10" r="2.1" fill={STROKE} fillOpacity="0.35" />
        <circle cx="19" cy="10" r="2.1" fill={STROKE} fillOpacity="0.35" />
        <circle cx="23" cy="14" r="1.8" fill={STROKE} fillOpacity="0.35" />
      </svg>
    );
  }
  if (id === "heart") {
    return (
      <svg {...common}>
        <path d="M16 25s-8-5.2-8-10a4.2 4.2 0 0 1 8-2 4.2 4.2 0 0 1 8 2c0 4.8-8 10-8 10z" fill={STROKE} fillOpacity="0.16" />
      </svg>
    );
  }
  if (id === "star") {
    return (
      <svg {...common}>
        <path d="M16 6.5l2.2 6.2h6.3l-5 4 2 6.3-5.5-3.6-5.5 3.6 2-6.3-5-4h6.3z" fill={STROKE} fillOpacity="0.16" />
      </svg>
    );
  }
  if (id === "tape") {
    return (
      <svg {...common}>
        <rect x="6" y="12" width="20" height="8" rx="1.5" transform="rotate(-18 16 16)" fill="#e7d3b0" stroke="#c4a57a" />
      </svg>
    );
  }
  if (id === "leaf") {
    return (
      <svg {...common}>
        <path d="M8 22c8-1 14-8 16-14-6 1-13 6-16 14z" fill="#9aab8c" fillOpacity="0.35" stroke="#7f9470" />
        <path d="M10 20c4-3 8-6 12-8" />
      </svg>
    );
  }
  if (id === "flower") {
    return (
      <svg {...common}>
        <circle cx="16" cy="16" r="2" fill="#d7a08a" stroke="none" />
        <circle cx="16" cy="10" r="3" fill="#e7c3b4" stroke={STROKE} />
        <circle cx="21.2" cy="13.5" r="3" fill="#e7c3b4" stroke={STROKE} />
        <circle cx="19.2" cy="19.5" r="3" fill="#e7c3b4" stroke={STROKE} />
        <circle cx="12.8" cy="19.5" r="3" fill="#e7c3b4" stroke={STROKE} />
        <circle cx="10.8" cy="13.5" r="3" fill="#e7c3b4" stroke={STROKE} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M16 7v4M16 21v4M7 16h4M21 16h4M10 10l2.2 2.2M19.8 19.8L22 22M22 10l-2.2 2.2M12.2 19.8L10 22" />
    </svg>
  );
}
