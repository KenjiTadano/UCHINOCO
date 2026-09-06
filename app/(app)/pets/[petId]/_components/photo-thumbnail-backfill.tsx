"use client";

import { useEffect, useRef, useState } from "react";
import { hasMatchingImageSignature } from "@/lib/image-signature";
import { createPhotoThumbnail } from "@/lib/photo-thumbnail";
import { createClient } from "@/lib/supabase/client";
import {
  finalizeThumbnailBackfill,
  prepareThumbnailBackfillBatch,
  refreshThumbnailBackfillViews,
} from "../thumbnail-backfill-actions";

type Progress = {
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
};

export function PhotoThumbnailBackfill({
  petId,
  initialPendingCount,
}: {
  petId: string;
  initialPendingCount: number | null;
}) {
  const mounted = useRef(true);
  const abortController = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(initialPendingCount);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      mounted.current = false;
      abortController.current?.abort();
    };
  }, []);

  async function startBackfill() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    setError(null);
    let cursor: { createdAt: string; id: string } | null = null;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let total = initialPendingCount ?? 0;

    try {
      while (mounted.current) {
        const batch = await prepareThumbnailBackfillBatch(petId, cursor);
        if (!batch.success) {
          throw new Error(batch.message ?? "対象の写真を取得できませんでした。");
        }
        if (cursor === null) {
          total = batch.remainingCount;
          setPendingCount(total);
        }
        failed += batch.failedCount;
        processed += batch.failedCount;
        setProgress({ processed, total, succeeded, failed });

        if (batch.items.length === 0) {
          if (!batch.nextCursor) break;
          cursor = batch.nextCursor;
          continue;
        }

        for (const item of batch.items) {
          if (!mounted.current) break;
          const controller = new AbortController();
          abortController.current = controller;
          try {
            const response = await fetch(item.originalSignedUrl, {
              signal: controller.signal,
              cache: "no-store",
            });
            if (!response.ok) throw new Error("元画像を取得できませんでした。");
            const original = await response.blob();
            const thumbnail = await createPhotoThumbnail(original);
            if (!(await hasMatchingImageSignature(thumbnail, "image/webp"))) {
              throw new Error("サムネイルを作成できませんでした。");
            }

            const upload = await createClient()
              .storage.from("pet-photo-thumbnails")
              .uploadToSignedUrl(
                item.thumbnailPath,
                item.thumbnailToken,
                thumbnail,
                { contentType: "image/webp", upsert: false },
              );
            if (upload.error) {
              // A previous interrupted run or another tab may already have
              // uploaded this deterministic path. Let the server validate it
              // before treating the item as failed.
              const recovered = await finalizeThumbnailBackfill(petId, item.photoId);
              if (!recovered.success) {
                throw new Error("サムネイルを保存できませんでした。");
              }
              succeeded += 1;
              continue;
            }

            const finalized = await finalizeThumbnailBackfill(petId, item.photoId);
            if (!finalized.success) {
              throw new Error(finalized.message ?? "写真の軽量化に失敗しました。");
            }
            succeeded += 1;
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") break;
            failed += 1;
          } finally {
            abortController.current = null;
            processed += 1;
            if (mounted.current) {
              setProgress({ processed, total, succeeded, failed });
            }
          }
        }

        if (!mounted.current || !batch.nextCursor) break;
        cursor = batch.nextCursor;
      }

      if (mounted.current) {
        if (succeeded > 0) {
          await refreshThumbnailBackfillViews(petId);
        }
        setPendingCount(failed);
        setMessage(
          failed === 0
            ? "すべての写真を軽量化しました。"
            : `${succeeded}枚成功 / ${failed}枚失敗しました。失敗した写真は再実行できます。`,
        );
      }
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "写真の軽量化に失敗しました。もう一度お試しください。",
        );
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section className="app-card-flat" aria-labelledby="thumbnail-backfill-heading">
      <h2 id="thumbnail-backfill-heading" className="font-semibold">
        既存の写真を軽量化
      </h2>
      <p className="app-help mt-1">
        過去に登録した写真の一覧表示を高速化します。写真本体は変更されません。
      </p>

      {progress && pending ? (
        <p className="mt-3 text-sm" role="status" aria-live="polite">
          {progress.processed} / {progress.total}枚を処理中...
        </p>
      ) : null}
      {message ? <p className="app-success mt-3" role="status">{message}</p> : null}
      {error ? <p className="app-error mt-3" role="alert">{error}</p> : null}

      <button
        className="app-button-secondary mt-4 w-full sm:w-auto"
        type="button"
        onClick={startBackfill}
        disabled={pending || pendingCount === 0}
      >
        {pending
          ? "写真を軽量化中..."
          : pendingCount === 0
            ? "軽量化は完了しています"
            : pendingCount === null
              ? "写真を軽量化する"
              : `写真を軽量化する（${pendingCount}枚）`}
      </button>
    </section>
  );
}
