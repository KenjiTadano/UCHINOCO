"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  finalizePhotoUploads,
  preparePhotoUploads,
} from "../actions";

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function resultMessage(total: number, saved: number, failed: number) {
  if (failed === 0) {
    return `${saved}枚の写真を保存しました。`;
  }
  return `${total}枚中${saved}枚を保存しました。${failed}枚の保存に失敗しました。`;
}

export function PhotoUploadForm({
  petId,
  petName,
}: {
  petId: string;
  petName: string;
}) {
  const router = useRouter();
  const objectUrls = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  function selectPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError(null);

    if (selected.length === 0) {
      return;
    }
    if (photos.length + selected.length > MAX_FILES) {
      setError("写真は1回につき10枚まで選択できます。");
      return;
    }

    const invalid = selected.find(
      (file) =>
        !ACCEPTED_TYPES.has(file.type) ||
        file.size <= 0 ||
        file.size > MAX_FILE_SIZE,
    );
    if (invalid) {
      setError(
        "JPEG・PNG・WebP形式で、1枚10MB以下の有効な写真を選択してください。不正な写真は追加されていません。",
      );
      return;
    }

    const additions = selected.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.add(previewUrl);
      return { id: crypto.randomUUID(), file, previewUrl };
    });
    setPhotos((current) => [...current, ...additions]);
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrls.current.delete(target.previewUrl);
      }
      return current.filter((photo) => photo.id !== id);
    });
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    if (photos.length === 0) {
      setError("写真を1枚以上選択してください。");
      return;
    }

    setPending(true);
    setError(null);
    setStatus("アップロードを準備中...");

    try {
      const prepared = await preparePhotoUploads(
        petId,
        photos.map((photo) => ({
          clientId: photo.id,
          mimeType: photo.file.type,
          size: photo.file.size,
        })),
      );

      if (!prepared.success || prepared.uploads.length === 0) {
        setError(prepared.message ?? "写真のアップロード準備に失敗しました。");
        return;
      }

      setStatus("写真をアップロード中...");
      const photoById = new Map(photos.map((photo) => [photo.id, photo]));
      const supabase = createClient();
      const uploadResults = await Promise.all(
        prepared.uploads.map(async (upload) => {
          const selectedPhoto = photoById.get(upload.clientId);
          if (!selectedPhoto) {
            return null;
          }

          const { error: uploadError } = await supabase.storage
            .from("pet-photos")
            .uploadToSignedUrl(upload.path, upload.token, selectedPhoto.file, {
              contentType: selectedPhoto.file.type,
            });

          return uploadError ? null : upload.path;
        }),
      );
      const uploadedPaths = uploadResults.filter(
        (path): path is string => path !== null,
      );
      const uploadFailedCount =
        prepared.failedCount + prepared.uploads.length - uploadedPaths.length;

      if (uploadedPaths.length === 0) {
        router.replace(
          `/pets/${petId}?${new URLSearchParams({
            message: resultMessage(photos.length, 0, photos.length),
          }).toString()}`,
        );
        return;
      }

      setStatus("写真を保存中...");
      const finalized = await finalizePhotoUploads(petId, uploadedPaths);
      const failedCount = uploadFailedCount + finalized.failedCount;
      router.replace(
        `/pets/${petId}?${new URLSearchParams({
          message: resultMessage(
            photos.length,
            finalized.savedCount,
            failedCount,
          ),
        }).toString()}`,
      );
      router.refresh();
    } catch {
      setError("写真を保存できませんでした。通信状態を確認して再度お試しください。");
    } finally {
      setPending(false);
      setStatus(null);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="rounded border border-zinc-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">思い出写真</p>
            <p className="mt-1 text-xs text-zinc-500">
              JPEG・PNG・WebP、1枚10MBまで、最大10枚
            </p>
          </div>
          <button
            className="shrink-0 rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending || photos.length >= MAX_FILES}
          >
            写真を選択
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={selectPhotos}
          disabled={pending}
        />

        <p className="mt-3 text-sm">{photos.length}枚選択中</p>

        {photos.length > 0 ? (
          <ul className="mt-4 grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <li key={photo.id} className="relative aspect-square overflow-hidden rounded bg-zinc-100">
                <Image
                  className="size-full object-cover"
                  src={photo.previewUrl}
                  alt={`選択した写真${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 30vw, 180px"
                  unoptimized
                />
                <button
                  className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white"
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  disabled={pending}
                  aria-label={`写真${index + 1}を選択から外す`}
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {status ? (
        <p role="status" className="text-center text-sm text-zinc-600">
          {status}
        </p>
      ) : null}

      <button
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={pending || photos.length === 0}
      >
        {pending ? "アップロード中..." : "写真を保存する"}
      </button>

      <Link className="text-center text-sm underline" href={`/pets/${petId}`}>
        {petName}のページへ戻る
      </Link>
    </form>
  );
}
