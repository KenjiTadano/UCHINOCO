import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PlusUpgradeCta } from "../plus/plus-checkout-button";

export function PlusUpsell({
  title,
  description,
  returnTo,
}: {
  title: string;
  description: string;
  returnTo?: string;
}) {
  const href = returnTo ? `/plus?next=${encodeURIComponent(returnTo)}` : "/plus";
  return (
    <aside className="grid gap-3 rounded-[var(--radius-medium)] border border-[var(--color-border)] bg-[var(--color-surface-warm)] p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-terracotta-strong" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        </div>
      </div>
      <PlusUpgradeCta next={href} />
      <Link className="ds-focus min-h-11 self-center px-3 py-2 text-sm text-muted underline underline-offset-4" href={returnTo ?? "/home"}>
        今はFREEのまま使う
      </Link>
    </aside>
  );
}
