"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, Lightbulb } from "lucide-react";

type StepStatus = "completed" | "current" | "pending";

type Step = {
  title: string;
  sub?: string;
};

const AI_POINTS = [
  "表情がよく写っている写真を優先",
  "季節やイベントのバランスを考慮",
  "似た写真をまとめてストーリーに",
] as const;

type Props = {
  petName: string;
  photoCount: number;
  backHref: string;
  /** Cosmetic step while server action runs (1–4). */
  activeStep: number;
};

function statusFor(index: number, activeStep: number): StepStatus {
  if (index < activeStep) return "completed";
  if (index === activeStep) return "current";
  return "pending";
}

export function AlbumGeneratingScreen({
  petName,
  photoCount,
  backHref,
  activeStep,
}: Props) {
  const steps: Step[] = [
    {
      title: "写真を分析しています",
      sub:
        photoCount > 0
          ? `${photoCount.toLocaleString()}枚の写真を解析しました`
          : "写真を解析しています…",
    },
    {
      title: "ベストショットを選んでいます",
      sub: "大切な思い出を厳選中…",
    },
    {
      title: "アルバムを作成しています",
      sub: "まもなく完成します…",
    },
    {
      title: "プレビューを準備しています",
    },
  ];

  const points = [
    ...AI_POINTS,
    `${petName}のベストショットを選定`,
  ];

  return (
    <main className="ai-gen-page">
      <header className="ai-gen-header">
        <Link
          href={backHref}
          className="ai-gen-header-side ai-gen-back ds-focus"
          aria-label="戻る"
        >
          <ChevronLeft size={22} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <h1 className="ai-gen-header-title">AIアルバムを作る</h1>
        <Link href={backHref} className="ai-gen-header-side ai-gen-cancel ds-focus">
          キャンセル
        </Link>
      </header>

      <div className="ai-gen-body">
        <h2 className="ai-gen-title">
          思い出を選んで
          <br />
          アルバムを作成中です…
        </h2>
        <p className="ai-gen-desc">
          {petName}との大切な時間から、
          <br />
          ベストな写真を選んでいます。
          <br />
          もう少しお待ちください。
        </p>

        <div className="ai-gen-illust">
          <Image
            src="/album/ai_generating_illustration.png"
            alt=""
            width={305}
            height={280}
            priority
            unoptimized
            className="ai-gen-illust-img"
          />
        </div>

        <ol className="ai-gen-progress" aria-label="生成の進行状況">
          {steps.map((step, index) => {
            const status = statusFor(index + 1, activeStep);
            return (
              <li key={step.title} className={`ai-gen-step is-${status}`}>
                <span className="ai-gen-step-rail" aria-hidden="true">
                  <span className="ai-gen-step-dot">
                    {status === "completed" ? (
                      <Check size={14} strokeWidth={2.4} />
                    ) : null}
                  </span>
                  {index < steps.length - 1 ? (
                    <span className="ai-gen-step-line" />
                  ) : null}
                </span>
                <span className="ai-gen-step-copy">
                  <span className="ai-gen-step-title">{step.title}</span>
                  {step.sub ? (
                    <span className="ai-gen-step-sub">{step.sub}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>

        <section
          className="ai-gen-points"
          aria-labelledby="ai-gen-points-heading"
        >
          <h3 id="ai-gen-points-heading" className="ai-gen-points-head">
            <Lightbulb size={18} strokeWidth={1.8} aria-hidden="true" />
            AIのこだわりポイント
          </h3>
          <ul className="ai-gen-points-list">
            {points.map((text) => (
              <li key={text}>
                <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

/** Advances cosmetic steps while the server action is pending. */
export function useGeneratingStep(pending: boolean): number {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!pending) {
      setStep(1);
      return;
    }
    setStep(1);
    const t1 = window.setTimeout(() => setStep(2), 900);
    const t2 = window.setTimeout(() => setStep(3), 2200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pending]);

  return pending ? step : 1;
}
