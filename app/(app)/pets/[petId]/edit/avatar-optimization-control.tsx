"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createAvatarWebp } from "@/lib/avatar-image";
import { createClient } from "@/lib/supabase/client";
import {
  discardReplacementAvatar,
  finalizeReplacementAvatar,
  prepareAvatarOptimization,
} from "../../actions";

export function AvatarOptimizationControl({ petId }: { petId: string }) {
  const router = useRouter();
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function optimize() {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setMessage(null);
    setError(null);

    let pendingPath: string | null = null;
    try {
      const prepared = await prepareAvatarOptimization(petId);
      if (
        !prepared.success ||
        !prepared.upload ||
        !prepared.originalSignedUrl
      ) {
        throw new Error(
          prepared.message ?? "プロフィール画像を最適化できませんでした。",
        );
      }
      pendingPath = prepared.upload.storagePath;

      const response = await fetch(prepared.originalSignedUrl, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("現在のプロフィール画像を取得できませんでした。");
      }
      const avatar = await createAvatarWebp(await response.blob());
      const { error: uploadError } = await createClient()
        .storage.from("pet-avatars")
        .uploadToSignedUrl(
          prepared.upload.storagePath,
          prepared.upload.token,
          avatar,
          { contentType: "image/webp", upsert: false },
        );
      if (uploadError) {
        throw new Error("最適化した画像を保存できませんでした。");
      }

      const finalized = await finalizeReplacementAvatar(
        petId,
        prepared.upload.storagePath,
      );
      if (!finalized.success) {
        throw new Error(
          finalized.message ?? "プロフィール画像を最適化できませんでした。",
        );
      }

      pendingPath = null;
      setMessage("プロフィール画像を最適化しました。");
      router.refresh();
    } catch (cause) {
      if (pendingPath) {
        await discardReplacementAvatar(petId, pendingPath);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "プロフィール画像を最適化できませんでした。もう一度お試しください。",
      );
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  return (
    <section className="app-card-flat" aria-labelledby="avatar-optimization-heading">
      <h2 id="avatar-optimization-heading" className="font-semibold">
        プロフィール画像を軽量化
      </h2>
      <p className="app-help mt-1">
        表示を速くするため画像を最適化します。見た目や登録内容は変わりません。
      </p>
      {message ? <p className="app-success mt-3" role="status">{message}</p> : null}
      {error ? <p className="app-error mt-3" role="alert">{error}</p> : null}
      <button
        className="app-button-secondary mt-4 w-full"
        type="button"
        onClick={optimize}
        disabled={pending}
      >
        {pending ? "画像を最適化しています..." : "プロフィール画像を軽量化"}
      </button>
    </section>
  );
}
