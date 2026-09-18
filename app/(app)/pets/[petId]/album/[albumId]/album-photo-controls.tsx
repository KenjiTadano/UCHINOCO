"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";
import {
  removeAlbumPhoto,
  reorderAlbumPhotos,
  type AlbumMutationState,
} from "./actions";

type Photo = {
  photo_id: string;
  position: number;
  src: string | null;
  alt: string;
};

const initialState: AlbumMutationState = { success: false, message: null };

export function AlbumPhotoControls({
  petId,
  albumId,
  initialPhotos,
}: {
  petId: string;
  albumId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState(
    [...initialPhotos].sort((a, b) => a.position - b.position),
  );
  const reorderAction = reorderAlbumPhotos.bind(null, petId, albumId);
  const [reorderState, reorderFormAction, reorderPending] = useActionState(reorderAction, initialState);
  const [removePending, startRemove] = useTransition();

  function moveUp(index: number) {
    if (index === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    if (index === photos.length - 1) return;
    setPhotos((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function handleRemove(photoId: string) {
    startRemove(async () => {
      await removeAlbumPhoto(petId, albumId, photoId);
      setPhotos((prev) => prev.filter((p) => p.photo_id !== photoId));
    });
  }

  return (
    <section aria-labelledby="album-photos-heading" className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="album-photos-heading" className="app-section-title">
          写真 <span className="text-sm font-normal text-muted">（{photos.length}枚）</span>
        </h2>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-muted">写真がありません。</p>
      ) : (
        <ul className="grid gap-2" aria-live="polite" aria-atomic="false">
          {photos.map((photo, index) => (
            <li key={photo.photo_id} className="flex items-center gap-3 rounded-xl bg-surface p-2">
              {/* Thumbnail */}
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-warm">
                {photo.src ? (
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted">
                    ×
                  </div>
                )}
              </div>

              {/* Order info */}
              <span className="w-6 shrink-0 text-center text-xs text-muted">{index + 1}</span>

              {/* Reorder buttons — min-h-11 min-w-11 (44px) for tap target */}
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0 || reorderPending || removePending}
                  aria-label={`${photo.alt}を1つ前に移動`}
                  className="ds-focus flex min-h-11 min-w-11 items-center justify-center rounded text-sm text-muted hover:bg-surface-warm disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === photos.length - 1 || reorderPending || removePending}
                  aria-label={`${photo.alt}を1つ後ろに移動`}
                  className="ds-focus flex min-h-11 min-w-11 items-center justify-center rounded text-sm text-muted hover:bg-surface-warm disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              {/* Remove — min-h-11 (44px) for tap target */}
              <button
                type="button"
                onClick={() => handleRemove(photo.photo_id)}
                disabled={removePending || reorderPending}
                aria-label={`${photo.alt}をアルバムから外す`}
                className="ds-focus ml-auto flex min-h-11 items-center rounded-lg px-3 text-xs text-danger hover:bg-danger-soft disabled:opacity-40"
              >
                外す
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Save reorder */}
      {photos.length > 1 ? (
        <form action={reorderFormAction}>
          {photos.map((p) => (
            <input key={p.photo_id} type="hidden" name="photo_order" value={p.photo_id} />
          ))}
          <button
            type="submit"
            disabled={reorderPending || removePending}
            className="app-button-secondary w-fit text-sm"
          >
            {reorderPending ? "保存中..." : "並び順を保存"}
          </button>
          {reorderState.message ? (
            <p
              role={reorderState.success ? "status" : "alert"}
              className={`mt-2 text-sm ${reorderState.success ? "text-success" : "text-danger"}`}
            >
              {reorderState.message}
            </p>
          ) : null}
        </form>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {removePending ? "写真を外しています" : ""}
      </p>
    </section>
  );
}
