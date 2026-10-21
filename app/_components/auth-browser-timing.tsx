"use client";

import { useEffect, type ReactNode } from "react";

function record(phase: "login.submit" | "home.committed") {
  // Preview instrumentation only: no form values, IDs, URLs, session or storage access.
  console.info("Auth browser timing", JSON.stringify({ phase, atMs: Date.now() }));
}
export function AuthTimingForm({ action, children, enabled }: { action: (data: FormData) => void | Promise<void>; children: ReactNode; enabled: boolean }) {
  return <form action={action} className="flex flex-col gap-4" onSubmit={() => { if (enabled) record("login.submit"); }}>{children}</form>;
}
export function AuthHomeTiming({ enabled }: { enabled: boolean }) {
  useEffect(() => { if (enabled) record("home.committed"); }, [enabled]);
  return null;
}
