import { installImageTimingDiagnostics } from "./lib/diagnostics/image-timing-client";

// Build-time flag is enabled only by VERCEL_ENV=preview. No credential/env value is exposed.
if (process.env.NEXT_PUBLIC_IMAGE_TIMING_DIAGNOSTICS === "1") {
  try { installImageTimingDiagnostics(); } catch { /* Diagnostics must never break the app. */ }
}
