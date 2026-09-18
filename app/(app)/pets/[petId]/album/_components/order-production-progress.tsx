export type ProductionPhase = "received" | "preparing" | "shipping" | "delivered";

type Props = {
  /** Current honest phase — do not advance past known facts. */
  phase: ProductionPhase;
  /** Optional short date label under ご注文受付 (e.g. 9/15) */
  orderedLabel?: string;
  className?: string;
};

const STEPS: Array<{
  id: ProductionPhase;
  label: string;
  icon: string;
}> = [
  { id: "received", label: "ご注文受付", icon: "✓" },
  { id: "preparing", label: "制作準備中", icon: "◇" },
  { id: "shipping", label: "発送準備", icon: "▷" },
  { id: "delivered", label: "お届け", icon: "⌂" },
];

const PHASE_ORDER: ProductionPhase[] = [
  "received",
  "preparing",
  "shipping",
  "delivered",
];

/**
 * Production progress for paid orders.
 * Only mark phases that are factually known — never imply shipped/delivered early.
 */
export function OrderProductionProgress({
  phase,
  orderedLabel,
  className = "",
}: Props) {
  const currentIndex = PHASE_ORDER.indexOf(phase);

  return (
    <section
      aria-labelledby="production-progress-heading"
      className={`rounded-xl bg-surface-warm/80 px-3 py-5 sm:px-5 ${className}`}
    >
      <h2 id="production-progress-heading" className="sr-only">
        制作の進行状況
      </h2>
      <ol className="flex items-start justify-between gap-1">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const connectorDone = index < currentIndex;

          return (
            <li key={step.id} className="relative flex flex-1 flex-col items-center">
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(50%+0.95rem)] right-[calc(-50%+0.95rem)] top-[0.85rem] h-px ${
                    connectorDone ? "bg-brand-terracotta" : "bg-border"
                  }`}
                />
              ) : null}

              <span
                className={`relative z-10 flex size-7 items-center justify-center rounded-full text-[11px] ${
                  active || done
                    ? "bg-brand-terracotta text-white"
                    : "border border-border bg-surface text-muted"
                }`}
                aria-current={active ? "step" : undefined}
              >
                <span aria-hidden="true">{done || active ? step.icon : index + 1}</span>
                <span className="sr-only">
                  {done ? "完了:" : active ? "現在:" : "未着手:"}
                  {step.label}
                </span>
              </span>

              <span
                className={`mt-2 max-w-[4.5rem] text-center text-[10px] leading-snug sm:text-[11px] ${
                  active ? "font-medium text-brand-terracotta-strong" : "text-muted"
                }`}
              >
                <span className="block">{step.label}</span>
                {step.id === "received" && orderedLabel ? (
                  <span className="mt-0.5 block opacity-80">{orderedLabel}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Honest copy for the current production phase (Provider未接続前提). */
export function getProductionPhaseCopy(phase: ProductionPhase): {
  title: string;
  body: string;
} {
  switch (phase) {
    case "received":
      return {
        title: "ご注文を受け付けました",
        body: "お支払いが確認できました。まもなく制作準備に入ります。",
      };
    case "preparing":
      return {
        title: "ただいま制作準備中です",
        body: "ご注文を受け付けました。印刷・製本の準備を進めています。発送が完了しましたらお知らせします。",
      };
    case "shipping":
      return {
        title: "発送準備を進めています",
        body: "フォトブックの発送準備中です。まもなくお届けの案内をお送りします。",
      };
    case "delivered":
      return {
        title: "お届けが完了しました",
        body: "フォトブックはお手元に届いているはずです。素敵な時間をお楽しみください。",
      };
  }
}
