"use client";

import { useEffect, useRef, useState } from "react";
import { hasMatchingImageSignature } from "@/lib/image-signature";
import { createPhotoPreview, createPhotoThumbnail } from "@/lib/photo-thumbnail";
import { PHOTO_IMAGE_DELIVERY } from "@/lib/photo-image-delivery";
import { createClient } from "@/lib/supabase/client";
import { finalizeThumbnailBackfill, prepareThumbnailBackfillBatch, refreshThumbnailBackfillViews } from "../thumbnail-backfill-actions";

type Progress = {
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
};

export function PhotoThumbnailBackfill({ petId, initialPendingCount }: { petId: string; initialPendingCount: number | null }) {
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
          if (item.previewReady && !item.needsThumbnail) {
            succeeded += 1;
            processed += 1;
            setProgress({ processed, total, succeeded, failed });
            continue;
          }
          if (!item.originalSignedUrl) {
            failed += 1;
            processed += 1;
            setProgress({ processed, total, succeeded, failed });
            continue;
          }
          const controller = new AbortController();
          abortController.current = controller;
          try {
            if (!item.originalSignedUrl) throw new Error("元画像を取得できませんでした。");
            const response = await fetch(item.originalSignedUrl, {
              signal: controller.signal,
              cache: "no-store",
            });
            if (!response.ok) throw new Error("元画像を取得できませんでした。");
            const original = await response.blob();
            const thumbnail = item.needsThumbnail ? await createPhotoThumbnail(original) : null;
            const preview = item.previewReady ? null : await createPhotoPreview(original);
            if (thumbnail && !(await hasMatchingImageSignature(thumbnail, "image/webp"))) throw new Error("サムネイルを作成できませんでした。");
            if (preview && !(await hasMatchingImageSignature(preview, "image/webp"))) throw new Error("PREVIEWを作成できませんでした。");

            const storage = createClient().storage.from("pet-photo-thumbnails");
            const [thumbnailUpload, previewUpload] = await Promise.all([
              thumbnail && item.thumbnailPath && item.thumbnailToken ? storage.uploadToSignedUrl(item.thumbnailPath, item.thumbnailToken, thumbnail, { contentType: "image/webp", cacheControl: PHOTO_IMAGE_DELIVERY.thumbnail.cacheControl, upsert: false }) : Promise.resolve({ error: null }),
              preview && item.previewToken ? storage.uploadToSignedUrl(item.previewPath, item.previewToken, preview, { contentType: "image/webp", cacheControl: PHOTO_IMAGE_DELIVERY.preview.cacheControl, upsert: false }) : Promise.resolve({ error: null }),
            ]);
            void thumbnailUpload;
            void previewUpload;

            const finalized = await finalizeThumbnailBackfill(petId, item.photoId);
            if (!finalized.success) {
              throw new Error(finalized.message ?? "PREVIEWの保存に失敗しました。");
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
        setMessage(failed === 0 ? "すべての写真を軽量化しました。" : `${succeeded}枚成功 / ${failed}枚失敗しました。失敗した写真は再実行できます。`);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : "写真の軽量化に失敗しました。もう一度お試しください。");
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section className="app-card-flat" aria-labelledby="thumbnail-backfill-heading">
      <h2 id="thumbnail-backfill-heading" className="font-semibold">
        写真表示用の画像を準備
      </h2>
      <p className="app-help mt-1">一覧用thumbnailとアルバム編集用previewを用意します。元写真は変更されません。</p>

      {progress && pending ? (
        <p className="mt-3 text-sm" role="status" aria-live="polite">
          {progress.processed} / {progress.total}枚を処理中...
        </p>
      ) : null}
      {message ? (
        <p className="app-success mt-3" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="app-error mt-3" role="alert">
          {error}
        </p>
      ) : null}

      <button className="app-button-secondary mt-4 w-full sm:w-auto" type="button" onClick={startBackfill} disabled={pending || pendingCount === 0}>
        {pending ? "表示用画像を準備中..." : pendingCount === 0 ? "表示用画像は準備済みです" : pendingCount === null ? "既存写真を確認する" : `既存写真を確認する（${pendingCount}枚）`}
      </button>
    </section>
  );
}
