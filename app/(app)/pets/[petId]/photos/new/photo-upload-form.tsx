"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Camera, ChevronRight, Cloud, Heart, Image as ImageIcon, Plus, Smartphone, Tag, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { convertHeicToJpeg, extractExifDateTime, isHeicCandidate } from "@/lib/exif-date";
import { parseTokyoLocalDateTime } from "@/lib/photo-timeline";
import { hasMatchingImageSignature } from "@/lib/image-signature";
import { createPhotoPreview, createPhotoThumbnail } from "@/lib/photo-thumbnail";
import { PHOTO_IMAGE_DELIVERY } from "@/lib/photo-image-delivery";
import { finalizePhotoUploads, preparePhotoUploads } from "../actions";
import { FavoriteButton } from "@/app/_components/ui";

type SelectedPhoto = {
  id: string;
  file: File;
  thumbnail: Blob | null;
  preview: Blob | null;
  previewUrl: string;
  takenAt: string;
  dateSource: "checking" | "exif" | "manual" | "none";
  favorite: boolean;
  contentHash: string;
};

type RecentPhoto = {
  id: string;
  src: string;
  href: string;
};

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FUTURE_TOLERANCE_MILLISECONDS = 5 * 60 * 1000;
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function resultMessage(total: number, saved: number, failed: number) {
  if (failed === 0) {
    return `${saved}枚の写真を保存しました。`;
  }
  return `${total}枚中${saved}枚を保存しました。${failed}枚の保存に失敗しました。`;
}

function formatJaDate(isoLocal: string) {
  if (!isoLocal) return "未設定";
  const [datePart] = isoLocal.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return "未設定";
  return `${y}年${m}月${d}日`;
}

export function PhotoUploadForm({ petId, returnTo, recentPhotos = [], allPhotosHref }: { petId: string; returnTo: string; recentPhotos?: RecentPhoto[]; allPhotosHref: string }) {
  const router = useRouter();
  const objectUrls = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const exifChecking = photos.some((photo) => photo.dateSource === "checking");

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  async function ingestFiles(selected: File[]) {
    setError(null);
    setDuplicateNotice(null);

    if (selected.length === 0) {
      return;
    }
    if (photos.length + selected.length > MAX_FILES) {
      setError("写真は1回につき10枚まで選択できます。");
      return;
    }

    const invalid = selected.find((file) => (!ACCEPTED_TYPES.has(file.type) && !isHeicCandidate(file)) || file.size <= 0 || file.size > MAX_FILE_SIZE);
    if (invalid) {
      setError("JPEG・PNG・WebP・HEIC・HEIF形式で、1枚10MB以下の有効な写真を選択してください。");
      return;
    }

    setPreparing(true);
    let conversionFailures = 0;
    let batchDuplicates = 0;
    const additions: SelectedPhoto[] = [];
    const knownHashes = new Set(photos.map((photo) => photo.contentHash));
    try {
      for (const originalFile of selected) {
        try {
          const originalTakenAt = await extractExifDateTime(originalFile);
          const file = isHeicCandidate(originalFile) ? await convertHeicToJpeg(originalFile, MAX_FILE_SIZE) : originalFile;
          if (!file) {
            conversionFailures += 1;
            continue;
          }

          if (!(await hasMatchingImageSignature(file, file.type))) {
            conversionFailures += 1;
            continue;
          }
          let thumbnail: Blob | null = null;
          try {
            const generatedThumbnail = await createPhotoThumbnail(file);
            if (await hasMatchingImageSignature(generatedThumbnail, "image/webp")) {
              thumbnail = generatedThumbnail;
            }
          } catch {
            // WebP canvas encoding is not available in every browser.
          }
          let preview: Blob | null = null;
          try {
            const generatedPreview = await createPhotoPreview(file);
            if (await hasMatchingImageSignature(generatedPreview, "image/webp")) preview = generatedPreview;
          } catch {
            // Original uploads remain valid when preview encoding is unavailable.
          }

          const takenAt = originalTakenAt ?? (await extractExifDateTime(file));
          const contentHash = await sha256Hex(file);
          if (knownHashes.has(contentHash)) {
            batchDuplicates += 1;
            continue;
          }
          knownHashes.add(contentHash);
          const previewUrl = URL.createObjectURL(file);
          objectUrls.current.add(previewUrl);
          additions.push({
            id: crypto.randomUUID(),
            file,
            thumbnail,
            preview,
            previewUrl,
            takenAt: takenAt ?? "",
            dateSource: takenAt ? "exif" : "none",
            favorite: false,
            contentHash,
          });
        } catch {
          conversionFailures += 1;
        }
      }
      if (additions.length > 0) {
        setPhotos((current) => [...current, ...additions]);
      }
      if (conversionFailures > 0) {
        setError(`${conversionFailures}枚の画像形式を確認できませんでした。別の写真を選択してください。`);
      }
      if (batchDuplicates > 0) {
        setDuplicateNotice(`${batchDuplicates}枚は同じ写真のため追加しません。`);
      }
    } finally {
      setPreparing(false);
    }
  }

  async function selectPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    await ingestFiles(selected);
  }

  function updateTakenAt(id: string, value: string) {
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, takenAt: value, dateSource: "manual" } : photo)));
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
      if (parsedTakenAt.getTime() > Date.now() + FUTURE_TOLERANCE_MILLISECONDS) {
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
          contentHash: photo.contentHash,
        })),
      );

      if (!prepared.success) {
        setError(prepared.message ?? "写真のアップロード準備に失敗しました。");
        return;
      }
      if (prepared.duplicateCount > 0) {
        setDuplicateNotice(`${prepared.duplicateCount}枚はすでに保存されているため追加しません。`);
      }
      if (prepared.uploads.length === 0) {
        setStatus(null);
        setPending(false);
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

          const { error: uploadError } = await supabase.storage.from("pet-photos").uploadToSignedUrl(upload.path, upload.token, selectedPhoto.file, {
            contentType: selectedPhoto.file.type,
            cacheControl: PHOTO_IMAGE_DELIVERY.thumbnail.cacheControl,
          });

          if (uploadError) return null;

          const thumbnailUploadError = selectedPhoto.thumbnail ? (await supabase.storage.from("pet-photo-thumbnails").uploadToSignedUrl(upload.thumbnailPath, upload.thumbnailToken, selectedPhoto.thumbnail, { contentType: "image/webp", cacheControl: PHOTO_IMAGE_DELIVERY.thumbnail.cacheControl })).error : true;
          const previewUploadError = selectedPhoto.preview && upload.previewPath && upload.previewToken ? (await supabase.storage.from("pet-photo-thumbnails").uploadToSignedUrl(upload.previewPath, upload.previewToken, selectedPhoto.preview, { contentType: "image/webp", cacheControl: PHOTO_IMAGE_DELIVERY.preview.cacheControl })).error : true;

          return {
            clientId: upload.clientId,
            storagePath: upload.path,
            thumbnailPath: thumbnailUploadError ? null : upload.thumbnailPath,
            previewPath: previewUploadError ? null : upload.previewPath,
            contentHash: upload.contentHash,
          };
        }),
      );
      const uploadedPhotos = uploadResults.filter(
        (
          upload,
        ): upload is {
          clientId: string;
          storagePath: string;
          thumbnailPath: string | null;
          previewPath: string | null;
          contentHash: string;
        } => upload !== null,
      );
      const uploadFailedCount = prepared.failedCount + prepared.uploads.length - uploadedPhotos.length;

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
          thumbnailPath: upload.thumbnailPath,
          previewPath: upload.previewPath,
          takenAt: photoById.get(upload.clientId)?.takenAt || null,
          favorite: photoById.get(upload.clientId)?.favorite,
          contentHash: upload.contentHash,
        })),
      );
      const failedCount = uploadFailedCount + finalized.failedCount;
      const duplicateCount = prepared.duplicateCount + finalized.duplicateCount;
      const intakeNotice = finalized.savedCount > 0 ? (finalized.candidateBecameReady ? " AIがアルバムをまとめられる枚数になりました。写真の整理はあとで続けます。" : " AIが思い出を整理しています。完了を待たずに写真を見ることができます。") : "";
      const destination = new URL(finalized.savedCount > 0 ? returnTo : `/pets/${petId}`, window.location.origin);
      destination.searchParams.set("message", `${resultMessage(photos.length, finalized.savedCount, failedCount)}${duplicateCount ? `${duplicateCount}枚はすでに保存されています。` : ""}${intakeNotice}`);
      router.replace(`${destination.pathname}${destination.search}`);
      router.refresh();
    } catch {
      setError("写真を保存できませんでした。通信状態を確認して再度お試しください。");
    } finally {
      setPending(false);
      setStatus(null);
    }
  }

  const busy = pending || preparing;
  const primaryTakenAt = photos[0]?.takenAt ?? "";
  const dateLabel = photos.length > 0 ? formatJaDate(primaryTakenAt) : "撮影日を設定";
  const tagLabel = photos.length > 0 ? `${photos.length}枚を選択中` : "あとで設定できます";

  return (
    <form onSubmit={submit} className="add-form">
      {error ? (
        <p role="alert" className="app-error">
          {error}
        </p>
      ) : null}
      {duplicateNotice ? (
        <p role="status" className="app-status">
          {duplicateNotice}
        </p>
      ) : null}

      <input ref={fileInputRef} className="sr-only" type="file" accept={FILE_ACCEPT} multiple onChange={selectPhotos} disabled={busy || photos.length >= MAX_FILES} />
      <input ref={cameraInputRef} className="sr-only" type="file" accept={FILE_ACCEPT} capture="environment" onChange={selectPhotos} disabled={busy || photos.length >= MAX_FILES} />

      <div
        className={`add-dropzone ${dragging ? "is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void ingestFiles(Array.from(event.dataTransfer.files ?? []));
        }}
      >
        <div className="add-dropzone-icon-wrap" aria-hidden="true">
          <div className="add-dropzone-icon">
            <ImageIcon className="add-dropzone-icon-art" strokeWidth={1.7} />
            <span className="add-dropzone-icon-badge">
              <Plus strokeWidth={2.4} />
            </span>
          </div>
        </div>
        <p className="add-dropzone-title">写真を選んで追加する</p>
        <p className="add-dropzone-help">{preparing ? "HEIC画像を変換しています..." : "ドラッグ＆ドロップでも追加できます"}</p>
        <button type="button" className="add-dropzone-cta ds-focus" onClick={() => fileInputRef.current?.click()} disabled={busy || photos.length >= MAX_FILES}>
          写真を選択
        </button>
      </div>

      <div className="add-methods" role="group" aria-label="追加方法">
        <button type="button" className="add-method ds-focus" onClick={() => cameraInputRef.current?.click()} disabled={busy || photos.length >= MAX_FILES}>
          <span className="add-method-icon" aria-hidden="true">
            <Camera strokeWidth={1.7} />
          </span>
          <span className="add-method-label">カメラで撮影</span>
        </button>
        <button type="button" className="add-method ds-focus" onClick={() => fileInputRef.current?.click()} disabled={busy || photos.length >= MAX_FILES}>
          <span className="add-method-icon" aria-hidden="true">
            <Video strokeWidth={1.7} />
          </span>
          <span className="add-method-label">動画を選択</span>
        </button>
        <button type="button" className="add-method ds-focus" onClick={() => fileInputRef.current?.click()} disabled={busy || photos.length >= MAX_FILES}>
          <span className="add-method-icon" aria-hidden="true">
            <Smartphone strokeWidth={1.7} />
          </span>
          <span className="add-method-label">スマホから選択</span>
        </button>
        <button type="button" className="add-method ds-focus" onClick={() => fileInputRef.current?.click()} disabled={busy || photos.length >= MAX_FILES}>
          <span className="add-method-icon" aria-hidden="true">
            <Cloud strokeWidth={1.7} />
          </span>
          <span className="add-method-label">クラウドから選択</span>
        </button>
      </div>

      {photos.length > 0 ? (
        <section className="add-selected" aria-label="選択中の写真">
          <div className="add-section-head">
            <h2 className="add-section-title">選択中の写真</h2>
            <p className="add-section-meta">{photos.length}枚</p>
          </div>
          <ul className="add-selected-list">
            {photos.map((photo, index) => (
              <li key={photo.id} className="add-selected-item">
                <div className="add-selected-thumb">
                  <Image className="object-cover" src={photo.previewUrl} alt={`選択した写真${index + 1}`} fill sizes="72px" unoptimized />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-medium" htmlFor={`photo-taken-at-${photo.id}`}>
                      写真{index + 1}の撮影日時
                    </label>
                    <div className="flex items-center gap-1">
                      <FavoriteButton favorite={photo.favorite} disabled={pending} onClick={() => setPhotos((current) => current.map((item) => (item.id === photo.id ? { ...item, favorite: !item.favorite } : item)))} />
                      <button className="add-remove ds-focus" type="button" onClick={() => removePhoto(photo.id)} disabled={pending} aria-label={`写真${index + 1}を選択から外す`}>
                        外す
                      </button>
                    </div>
                  </div>
                  <input id={`photo-taken-at-${photo.id}`} type="datetime-local" value={photo.takenAt} disabled={pending || photo.dateSource === "checking"} onChange={(event) => updateTakenAt(photo.id, event.target.value)} className="app-input mt-1 !min-h-9 text-[12px]" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="add-recent" aria-labelledby="add-recent-heading">
        <div className="add-section-head">
          <h2 id="add-recent-heading" className="add-section-title">
            最近の写真
          </h2>
          <Link href={allPhotosHref} className="add-section-link ds-focus">
            すべての写真を見る →
          </Link>
        </div>
        {recentPhotos.length > 0 ? (
          <ul className="add-recent-grid">
            {recentPhotos.map((photo, index) => (
              <li key={photo.id}>
                <Link href={photo.href} className="add-recent-cell ds-focus">
                  <Image src={photo.src} alt="最近の写真" fill sizes="86px" className="object-cover" unoptimized />
                  <span className={`add-recent-check ${index === 0 ? "is-on" : ""}`} aria-hidden="true">
                    {index === 0 ? <Heart fill="#fff" stroke="none" /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="add-empty">まだ写真がありません。</p>
        )}
      </section>

      <section className="add-options" aria-labelledby="add-options-heading">
        <h2 id="add-options-heading" className="add-section-title">
          追加オプション
        </h2>
        <div className="add-option-grid">
          <button
            type="button"
            className="add-option-card ds-focus"
            onClick={() => {
              if (photos[0]) {
                document.getElementById(`photo-taken-at-${photos[0].id}`)?.focus();
              } else {
                fileInputRef.current?.click();
              }
            }}
            disabled={busy}
          >
            <span className="add-option-icon" aria-hidden="true">
              <CalendarDays strokeWidth={1.7} />
            </span>
            <span className="add-option-copy">
              <span className="add-option-label">撮影日</span>
              <span className="add-option-value">{dateLabel}</span>
            </span>
            <ChevronRight className="add-option-chevron" strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button type="button" className="add-option-card ds-focus" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <span className="add-option-icon" aria-hidden="true">
              <Tag strokeWidth={1.7} />
            </span>
            <span className="add-option-copy">
              <span className="add-option-label">タグ</span>
              <span className="add-option-value">{tagLabel}</span>
            </span>
            <ChevronRight className="add-option-chevron" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </section>

      {status ? (
        <p role="status" className="app-status text-center">
          {status}
        </p>
      ) : null}

      {photos.length > 0 ? (
        <>
          <button className="add-submit ds-focus" type="submit" disabled={busy || exifChecking}>
            {preparing ? "写真を準備しています..." : pending ? "アップロード中..." : `${photos.length}枚を追加`}
          </button>
          <Link className="add-cancel ds-focus" href={returnTo}>
            写真追加をキャンセル
          </Link>
        </>
      ) : null}
    </form>
  );
}
