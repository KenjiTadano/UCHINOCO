import Link from "next/link";

type RecoveryAction = { label: string; href?: string; onClick?: () => void };
export function RecoveryState({ title, description, progress, primaryAction, secondaryAction }: { title: string; description: string; progress?: { ready: number; total: number }; primaryAction?: RecoveryAction; secondaryAction?: RecoveryAction }) {
  const action = (item: RecoveryAction, primary: boolean) =>
    item.href ? (
      <Link className={`ds-focus min-h-11 ${primary ? "app-button-primary" : "app-button-secondary"}`} href={item.href} onClick={item.onClick}>
        {item.label}
      </Link>
    ) : (
      <button type="button" className={`ds-focus min-h-11 ${primary ? "app-button-primary" : "app-button-secondary"}`} onClick={item.onClick}>
        {item.label}
      </button>
    );
  return (
    <section className="grid min-w-0 gap-3 rounded-md border border-border bg-surface-warm p-4" aria-label={title}>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        {progress ? (
          <p className="mt-3 text-sm font-semibold tabular-nums">
            {progress.ready} / {progress.total}枚
          </p>
        ) : null}
      </div>
      {primaryAction ? action(primaryAction, true) : null}
      {secondaryAction ? action(secondaryAction, false) : null}
    </section>
  );
}
