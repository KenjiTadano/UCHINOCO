import Link from "next/link";

type Props = {
  title: string;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
};

/** PDF: simple order header — back chevron + centered title */
export function OrderFlowHeader({
  title,
  backHref,
  onBack,
  backLabel = "戻る",
}: Props) {
  return (
    <header className="of-header">
      {onBack ? (
        <button type="button" className="of-back" aria-label={backLabel} onClick={onBack}>
          ‹
        </button>
      ) : backHref ? (
        <Link href={backHref} className="of-back" aria-label={backLabel}>
          ‹
        </Link>
      ) : null}
      <h1 className="of-title">{title}</h1>
    </header>
  );
}
