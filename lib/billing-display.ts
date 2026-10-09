export type BillingPlan = "FREE" | "PLUS";

const STATUS_LABELS: Record<string, string> = {
  none: "登録なし",
  trialing: "トライアル中",
  active: "有効",
  past_due: "お支払い確認中",
  canceled: "解約済み",
  unpaid: "未払い",
  incomplete: "手続き確認中",
  incomplete_expired: "手続き期限切れ",
  paused: "一時停止中",
};

export function getBillingSubscriptionPresentation(input: {
  plan: BillingPlan;
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: string | null;
}) {
  const isPlus = input.plan === "PLUS";
  const cancellationScheduled = isPlus && Boolean(input.cancelAtPeriodEnd);
  const periodEnd = isPlus && input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null;
  const formattedPeriodEnd = periodEnd && Number.isFinite(periodEnd.getTime())
    ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeZone: "Asia/Tokyo" }).format(periodEnd)
    : null;

  return {
    plan: input.plan,
    contractStatus: isPlus
      ? cancellationScheduled
        ? "解約予定"
        : STATUS_LABELS[input.status ?? "none"] ?? "確認中"
      : null,
    periodEndLabel: formattedPeriodEnd
      ? cancellationScheduled ? "利用終了日" : "次回更新日"
      : null,
    formattedPeriodEnd,
    cancellationNotice: cancellationScheduled && formattedPeriodEnd
      ? "この日まではPLUSをご利用いただけます"
      : null,
  };
}