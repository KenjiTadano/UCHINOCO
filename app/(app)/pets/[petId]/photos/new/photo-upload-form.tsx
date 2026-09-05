"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  convertHeicToJpeg,
  extractExifDateTime,
  isHeicCandidate,
} from "@/lib/exif-date";
import { parseTokyoLocalDateTime } from "@/lib/photo-timeline";
import {
  finalizePhotoUploads,
  preparePhotoUploads,
} from "../actions";

type SelectedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  takenAt: string;
  dateSource: "checking" | "exif" | "manual" | "none";
};

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FUTURE_TOLERANCE_MILLISECONDS = 5 * 60 * 1000;

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
  const [preparing, setPreparing] = useState(false);
  const exifChecking = photos.some((photo) => photo.dateSource === "checking");

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  async function selectPhotos(event: React.ChangeEvent<HTMLInputElement>) {
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
        (!ACCEPTED_TYPES.has(file.type) && !isHeicCandidate(file)) ||
        file.size <= 0 ||
        file.size > MAX_FILE_SIZE,
    );
    if (invalid) {
      setError(
        "JPEG・PNG・WebP・HEIC・HEIF形式で、1枚10MB以下の有効な写真を選択してください。",
      );
      return;
    }

    setPreparing(true);
    let conversionFailures = 0;
    const additions: SelectedPhoto[] = [];
    try {
      for (const originalFile of selected) {
        try {
          const originalTakenAt = await extractExifDateTime(originalFile);
          const file = isHeicCandidate(originalFile)
            ? await convertHeicToJpeg(originalFile, MAX_FILE_SIZE)
            : originalFile;
          if (!file) {
            conversionFailures += 1;
            continue;
          }

          const takenAt = originalTakenAt ?? (await extractExifDateTime(file));
          const previewUrl = URL.createObjectURL(file);
          objectUrls.current.add(previewUrl);
          additions.push({
            id: crypto.randomUUID(),
            file,
            previewUrl,
            takenAt: takenAt ?? "",
            dateSource: takenAt ? "exif" : "none",
          });
        } catch {
          conversionFailures += 1;
        }
      }
      if (additions.length > 0) {
        setPhotos((current) => [...current, ...additions]);
      }
      if (conversionFailures > 0) {
        setError(
          `${conversionFailures}枚の写真を変換できませんでした。別の写真を選択してください。`,
        );
      }
    } finally {
      setPreparing(false);
    }
  }

  function updateTakenAt(id: string, value: string) {
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id
          ? { ...photo, takenAt: value, dateSource: "manual" }
          : photo,
      ),
    );
    setError(null);
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
    if (pending || preparing) {
      return;
    }
    if (photos.length === 0) {
      setError("写真を1枚以上選択してください。");
      return;
    }
    if (exifChecking) {
      setError("撮影日時の確認が終わるまでお待ちください。");
      return;
    }
    for (const [index, photo] of photos.entries()) {
      if (!photo.takenAt) continue;
      const parsedTakenAt = parseTokyoLocalDateTime(photo.takenAt);
      if (!parsedTakenAt) {
        setError(`写真${index + 1}の撮影日時を確認してください。`);
        return;
      }
      if (
        parsedTakenAt.getTime() >
        Date.now() + FUTURE_TOLERANCE_MILLISECONDS
      ) {
        setError(`写真${index + 1}に未来の撮影日時は指定できません。`);
        return;
      }
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

          return uploadError
            ? null
            : { clientId: upload.clientId, storagePath: upload.path };
        }),
      );
      const uploadedPhotos = uploadResults.filter(
        (
          upload,
        ): upload is { clientId: string; storagePath: string } =>
          upload !== null,
      );
      const uploadFailedCount =
        prepared.failedCount + prepared.uploads.length - uploadedPhotos.length;

      if (uploadedPhotos.length === 0) {
        router.replace(
          `/pets/${petId}?${new URLSearchParams({
            message: resultMessage(photos.length, 0, photos.length),
          }).toString()}`,
        );
        return;
      }

      setStatus("写真を保存中...");
      const finalized = await finalizePhotoUploads(
        petId,
        uploadedPhotos.map((upload) => ({
          storagePath: upload.storagePath,
          takenAt: photoById.get(upload.clientId)?.takenAt || null,
        })),
      );
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
        <p role="alert" className="app-error">
          {error}
        </p>
      ) : null}

      <div className="app-card-flat">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">思い出写真</p>
            <p className="app-help mt-1">
              JPEG・PNG・WebP・HEIC・HEIF、1枚10MBまで、最大10枚
            </p>
          </div>
          <button
            className="app-button-secondary shrink-0"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending || preparing || photos.length >= MAX_FILES}
          >
            写真を選択
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          multiple
          onChange={selectPhotos}
          disabled={pending || preparing}
        />

        <p className="mt-3 text-sm">
          {preparing
            ? "HEIC画像を変換しています..."
            : `${photos.length}枚選択中`}
        </p>

        {photos.length > 0 ? (
          <ul className="mt-4 grid gap-3">
            {photos.map((photo, index) => (
              <li key={photo.id} className="app-card-flat flex gap-3 p-3">
                <div className="app-photo-frame size-24 shrink-0 sm:size-28">
                  <Image
                    className="size-full object-cover"
                    src={photo.previewUrl}
                    alt={`選択した写真${index + 1}`}
                    fill
                    sizes="112px"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor={`photo-taken-at-${photo.id}`}
                    >
                      写真{index + 1}の撮影日時
                    </label>
                    <button
                      className="app-button-ghost min-h-11 shrink-0 px-2"
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      disabled={pending}
                      aria-label={`写真${index + 1}を選択から外す`}
                    >
                      外す
                    </button>
                  </div>
                  <input
                    id={`photo-taken-at-${photo.id}`}
                    type="datetime-local"
                    value={photo.takenAt}
                    disabled={pending || photo.dateSource === "checking"}
                    onChange={(event) =>
                      updateTakenAt(photo.id, event.target.value)
                    }
                    className="app-input mt-1"
                  />
                  <p className="app-help mt-1">
                    {photo.dateSource === "checking"
                      ? "撮影日時を確認中..."
                      : photo.dateSource === "exif"
                        ? "写真から取得・変更できます"
                        : photo.takenAt
                          ? "手動で設定"
                          : "未設定の場合は登録日時で表示されます"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {status ? (
        <p role="status" className="app-status text-center">
          {status}
        </p>
      ) : null}

      <button
        className="app-button-primary w-full"
        type="submit"
        disabled={pending || preparing || exifChecking || photos.length === 0}
      >
        {preparing
          ? "写真を準備しています..."
          : pending
            ? "アップロード中..."
            : "写真を保存する"}
      </button>

      <Link className="app-back-link self-center" href={`/pets/${petId}`}>
        {petName}のページへ戻る
      </Link>
    </form>
  );
}
