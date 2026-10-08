"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CheckoutReturnStatus() {
  const router = useRouter();

  useEffect(() => {
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      timer = setTimeout(() => {
        attempts += 1;
        router.refresh();
        if (attempts < 6) refresh();
      }, 2500);
    };
    refresh();
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <p className="rounded-xl bg-surface-warm p-4 text-sm text-muted" role="status" aria-live="polite">
      お申し込みを確認しています。Stripeからの通知後にPLUSへ反映されます。
    </p>
  );
}