import { createClient } from "@/lib/supabase/server";
import { findAnalysisWork } from "@/lib/photo-analysis-queue";
import { analyzePhoto } from "@/app/(app)/pets/[petId]/photos/[photoId]/actions";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

async function handle(run: boolean) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return json({ stopped: true }, 401);
    if (!process.env.OPENAI_API_KEY?.trim()) {
      // Keep pending durable, spend no attempts and resume after server configuration.
      return json({ ready: false, waitMs: 0, stopped: true });
    }
    const work = await findAnalysisWork(supabase, user.id);
    let changed = false;
    if (run && work.photo) {
      // Materialize legacy work as pending without ever overwriting an existing result.
      const { error: enqueueError } = await supabase.from("photo_ai_analyses").upsert(
        { photo_id: work.photo.id, status: "pending" },
        { onConflict: "photo_id", ignoreDuplicates: true },
      );
      if (enqueueError) return json({ stopped: true }, 503);
      const before = await supabase.from("photo_ai_analyses")
        .select("status, attempts, updated_at").eq("photo_id", work.photo.id).maybeSingle();
      if (before.error) return json({ stopped: true }, 503);
      await analyzePhoto(work.photo.pet_id, work.photo.id,
        { success: false, message: null }, new FormData());
      const after = await supabase.from("photo_ai_analyses")
        .select("status, attempts, updated_at").eq("photo_id", work.photo.id).maybeSingle();
      if (after.error) return json({ stopped: true }, 503);
      changed = JSON.stringify(before.data) !== JSON.stringify(after.data);
      if (!changed && after.data && after.data.status !== "completed") {
        // A rejected claim must not create a tight loop on the same queue entry.
        return json({ stopped: true, changed: false });
      }
    }
    const next = run && work.photo ? await findAnalysisWork(supabase, user.id) : work;
    return json({ ready: !!next.photo, waitMs: next.waitMs, changed });
  } catch {
    // No raw SDK errors, keys or private image data leave the server.
    return json({ stopped: true }, 503);
  }
}

export async function GET() { return handle(false); }

export async function POST(request: Request) {
  // Native fetch avoids Next's per-client Server Action queue; enforce CSRF here.
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    // Next may normalize request.url to localhost behind a local/reverse proxy.
    // Compare the actual request Host, as Server Actions do, not that internal URL.
    sameOrigin = ["http:", "https:"].includes(origin.protocol) &&
      origin.host === request.headers.get("host");
  } catch { /* Missing or malformed Origin is rejected. */ }
  if (!sameOrigin || request.headers.get("x-uchinoco-runner") !== "1") {
    return json({ stopped: true }, 403);
  }
  return handle(true);
}
