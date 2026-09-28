export type ProductionPhase = "received" | "preparing" | "shipping" | "delivered";

const PHASES: ProductionPhase[] = ["received", "preparing", "shipping", "delivered"];

type Props = {
  phase: ProductionPhase;
  orderedLabel?: string;
};

/** PDF p17 4-step production timeline — honest phase only */
export function OrderProductionProgress({ phase, orderedLabel }: Props) {
  const current = PHASES.indexOf(phase);
  const labels: Record<ProductionPhase, string> = {
    received: orderedLabel ? `ご注文\n(${orderedLabel})` : "ご注文",
    preparing: "制作準備中",
    shipping: "発送準備",
    delivered: "お届け予定",
  };

  return (
    <section aria-labelledby="production-progress-heading" className="rounded-[14px] bg-[#f4ece6] px-2.5 py-4">
      <h2 id="production-progress-heading" className="sr-only">制作の進行状況</h2>
      <ol className="flex items-start justify-between">
        {PHASES.map((id, index) => {
          const active = index === current;
          const done = index < current;
          const lit = active || done;
          return (
            <li key={id} className="relative flex flex-1 flex-col items-center">
              {index < PHASES.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(50%+11px)] right-[calc(-50%+11px)] top-[11px] h-px ${
                    index < current ? "bg-[#b95d47]" : "bg-[#ddd0c8]"
                  }`}
                />
              ) : null}
              <span
                className={`relative z-10 flex size-[22px] items-center justify-center rounded-full text-[10px] ${
                  lit ? "bg-[#b95d47] text-white" : "bg-[#d5c9c1] text-white"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : active ? "◆" : index + 1}
              </span>
              <span
                className={`mt-1.5 max-w-[4.5rem] whitespace-pre-line text-center text-[9px] leading-snug ${
                  active ? "font-medium text-[#b95d47]" : "text-[#9a8b84]"
                }`}
              >
                {labels[id]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
