type OrderFlowStep = 1 | 2 | 3;

const STEPS: Array<{ step: OrderFlowStep; label: string }> = [
  { step: 1, label: "商品選択" },
  { step: 2, label: "確認" },
  { step: 3, label: "完了" },
];

/** PDF step — 円22px + 1px線 + 下ラベル10px（p14実測） */
export function OrderFlowSteps({ current }: { current: OrderFlowStep }) {
  return (
    <nav aria-label="注文の手順" className="mx-auto w-[240px]">
      <ol className="flex items-start">
        {STEPS.map((item, index) => {
          const active = item.step === current;
          const done = item.step < current;
          return (
            <li key={item.step} className="relative flex flex-1 flex-col items-center">
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[calc(50%+12px)] right-[calc(-50%+12px)] top-[11px] h-px"
                  style={{
                    background: item.step < current ? "var(--of-accent)" : "#ddd0c8",
                  }}
                />
              ) : null}
              <span
                className="relative z-10 flex size-[22px] items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{
                  background: active || done ? "var(--of-accent)" : "var(--of-step-idle)",
                }}
                aria-current={active ? "step" : undefined}
              >
                {done ? "✓" : item.step}
              </span>
              <span
                className={`mt-1 text-[10px] ${
                  active ? "font-medium" : ""
                }`}
                style={{ color: active ? "var(--of-text)" : "#9a8b84" }}
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
