import { createClient } from "@/lib/supabase/server";
import { findAnalysisWork } from "@/lib/photo-analysis-queue";
import { findPhotoIntelligenceWork } from "@/lib/photo-intake-server";
import { analyzePhoto } from "@/app/(app)/pets/[petId]/photos/[photoId]/actions";
import { analyzePhotoIntelligence } from "@/app/(app)/dev/photo-intelligence/actions";
import { analyzeSmartCropPhoto } from "@/app/(app)/dev/smart-crop/actions";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

type IntakeWork = {
  stage: "semantic" | "intelligence";
  photo: { id: string; pet_id: string };
  waitMs: number;
  reusedCount: number;
  geometryRequired?: boolean;
};

async function findWork(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, preferred?: IntakeWork["stage"]): Promise<IntakeWork | null> {
  const semanticWork = async () => {
    const semantic = await findAnalysisWork(supabase, userId);
    return semantic.photo ? { stage: "semantic" as const, photo: semantic.photo, waitMs: semantic.waitMs, reusedCount: 0 } : null;
  };
  const intelligenceWork = async () => {
    const intelligence = await findPhotoIntelligenceWork(supabase, userId);
    return intelligence.photo ? { stage: "intelligence" as const, photo: intelligence.photo, waitMs: 1_000, reusedCount: intelligence.reusedCount, geometryRequired: intelligence.geometryRequired } : null;
  };
  const first = preferred === "intelligence" ? await intelligenceWork() : await semanticWork();
  if (first) return first;
  const second = preferred === "intelligence" ? await semanticWork() : await intelligenceWork();
  if (second) return second;
  return null;
}

async function handle(run: boolean, preferred?: IntakeWork["stage"]) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return json({ stopped: true }, 401);
    if (!process.env.OPENAI_API_KEY?.trim()) {
      // Keep pending durable, spend no attempts and resume after server configuration.
      return json({ ready: false, waitMs: 0, stopped: true });
    }
    const work = await findWork(supabase, user.id, preferred);
    let changed = false;
    let visionCalled = false;
    let analysisReused = work?.reusedCount ?? 0;
    let analysisFailed = false;
    if (run && work) {
      if (work.stage === "intelligence") {
        if (work.geometryRequired) {
          const result = await analyzeSmartCropPhoto(work.photo.pet_id, work.photo.id, { allowLargeImageDegrade: true });
          return json({ ready: result.ok, changed: result.ok, stage: work.stage, waitMs: 1_000 });
        }
        const result = await analyzePhotoIntelligence(work.photo.pet_id, work.photo.id, false, {
          allowLargeImageDegrade: true,
        });
        changed = result.ok;
        visionCalled = result.visionCalled;
        analysisReused += result.fromCache ? 1 : 0;
        analysisFailed = !result.ok || result.visionFailed;
        if (changed) {
          revalidatePath(`/pets/${work.photo.pet_id}`);
          revalidatePath(`/pets/${work.photo.pet_id}/album`);
          revalidatePath("/home");
        }
      } else {
        // Materialize legacy work as pending without ever overwriting an existing result.
        const { error: enqueueError } = await supabase.from("photo_ai_analyses").upsert({ photo_id: work.photo.id, status: "pending" }, { onConflict: "photo_id", ignoreDuplicates: true });
        if (enqueueError) return json({ ready: false, stopped: true, waitMs: 0 });
        const before = await supabase.from("photo_ai_analyses").select("status, attempts, updated_at").eq("photo_id", work.photo.id).maybeSingle();
        if (before.error) return json({ ready: false, stopped: true, waitMs: 0 });
        await analyzePhoto(work.photo.pet_id, work.photo.id, { success: false, message: null }, new FormData());
        const after = await supabase.from("photo_ai_analyses").select("status, attempts, updated_at").eq("photo_id", work.photo.id).maybeSingle();
        if (after.error) return json({ ready: false, stopped: true, waitMs: 0 });
        changed = JSON.stringify(before.data) !== JSON.stringify(after.data);
        if (!changed && after.data && after.data.status !== "completed") {
          // A rejected claim must not create a tight loop on the same queue entry.
          return json({ stopped: true, changed: false });
        }
        analysisFailed = after.data?.status === "failed";
      }
    }
    const next = run && work ? await findWork(supabase, user.id) : work;
    if (run && process.env.NODE_ENV !== "production") {
      console.info("Photo intake analysis", {
        stage: work?.stage ?? null,
        analysisReused,
        visionCalled,
        analysisFailed,
        nextReady: Boolean(next),
      });
    }
    return json({
      ready: Boolean(next),
      waitMs: next?.waitMs ?? 0,
      changed,
      stage: work?.stage ?? null,
      analysisReused,
      visionCalled,
      analysisFailed,
    });
  } catch {
    // Queue lookup failed. Stop this visit instead of answering 503.
    // No raw SDK errors, keys or private image data leave the server.
    return json({ ready: false, stopped: true, waitMs: 0 });
  }
}

export async function GET() {
  return handle(false);
}

export async function POST(request: Request) {
  // Native fetch avoids Next's per-client Server Action queue; enforce CSRF here.
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    // Next may normalize request.url to localhost behind a local/reverse proxy.
    // Compare the actual request Host, as Server Actions do, not that internal URL.
    sameOrigin = ["http:", "https:"].includes(origin.protocol) && origin.host === request.headers.get("host");
  } catch {
    /* Missing or malformed Origin is rejected. */
  }
  if (!sameOrigin || request.headers.get("x-uchinoco-runner") !== "1") {
    return json({ stopped: true }, 403);
  }
  const preferred = request.headers.get("x-uchinoco-intake-stage");
  return handle(true, preferred === "intelligence" ? "intelligence" : "semantic");
}
