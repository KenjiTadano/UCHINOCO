type OrderFlowStep = 1 | 2 | 3;

const STEPS: Array<{ step: OrderFlowStep; label: string }> = [
  { step: 1, label: "商品選択" },
  { step: 2, label: "確認" },
  { step: 3, label: "完了" },
];

type Props = {
  current: OrderFlowStep;
  className?: string;
};

/**
 * Shared checkout-flow step indicator (商品選択 → 確認 → 完了).
 * Stripe Checkout itself is external and is not represented as its own step.
 */
export function OrderFlowSteps({ current, className = "" }: Props) {
  return (
    <nav
      aria-label="注文の手順"
      className={`mx-auto w-full max-w-sm ${className}`}
    >
      <ol className="flex items-start justify-between">
        {STEPS.map((item, index) => {
          const done = item.step < current;
          const active = item.step === current;
          const connectorDone = item.step < current;

          return (
            <li key={item.step} className="relative flex flex-1 flex-col items-center">
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(50%+1.1rem)] right-[calc(-50%+1.1rem)] top-[0.9rem] h-px ${
                    connectorDone ? "bg-brand-terracotta" : "bg-border"
                  }`}
                />
              ) : null}

              <span
                className={`relative z-10 flex size-8 items-center justify-center rounded-full text-xs font-semibold ${
                  active || done
                    ? "bg-brand-terracotta text-white"
                    : "border border-border bg-surface text-muted"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  item.step
                )}
                <span className="sr-only">
                  {done ? "完了:" : active ? "現在:" : ""}
                  {item.label}
                </span>
              </span>

              <span
                className={`mt-2 text-center text-[11px] leading-tight ${
                  active ? "font-medium text-brand-terracotta-strong" : "text-muted"
                }`}
              >
                {item.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
