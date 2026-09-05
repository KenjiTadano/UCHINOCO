"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createPet,
  discardPendingPet,
  finalizePetAvatar,
  type CreatePetState,
  type PetFieldName,
  type PetFormValues,
} from "../actions";

const initialValues: PetFormValues = {
  name: "",
  species: "",
  breed: "",
  gender: "",
  birthday: "",
  adoption_date: "",
};

const initialState: CreatePetState = {
  success: false,
  message: null,
  fieldErrors: {},
  values: initialValues,
  revision: 0,
  upload: null,
};

const fieldOrder: PetFieldName[] = [
  "avatar",
  "name",
  "species",
  "breed",
  "gender",
  "birthday",
  "adoption_date",
];

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 5 * 1024 * 1024;
const uploadFailureMessage =
  "プロフィール画像を保存できなかったため、ペットは登録されませんでした。もう一度お試しください。";

type AvatarPickerProps = {
  onFileChange: (file: File | null) => void;
  error?: string;
  autoFocus: boolean;
};

function AvatarPicker({
  onFileChange,
  error,
  autoFocus,
}: AvatarPickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    clearPreview();
    setClientError(null);

    const file = event.target.files?.[0];
    if (!file) {
      onFileChange(null);
      return;
    }

    if (!acceptedImageTypes.has(file.type)) {
      setClientError("JPEG、PNG、WebP形式の画像を選択してください。");
      event.target.value = "";
      onFileChange(null);
      return;
    }

    if (file.size <= 0 || file.size > maxImageSize) {
      setClientError("画像は5MB以下の有効なファイルを選択してください。");
      event.target.value = "";
      onFileChange(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    onFileChange(file);
  }

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const displayedError = clientError ?? error;

  return (
    <div className="app-card-flat flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span>プロフィール写真</span>
        <span className="app-optional">任意</span>
      </div>

      {previewUrl ? (
        <Image
          className="size-28 rounded-full border object-cover"
          src={previewUrl}
          alt="選択したプロフィール写真のプレビュー"
          width={112}
          height={112}
          unoptimized
        />
      ) : (
        <div className="flex size-28 items-center justify-center rounded-full bg-primary-soft text-sm text-muted">
          プレビュー
        </div>
      )}

      <input
        className="block w-full text-sm"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        aria-invalid={Boolean(displayedError)}
        aria-describedby={displayedError ? "avatar-error" : "avatar-help"}
        autoFocus={autoFocus}
      />
      <p id="avatar-help" className="app-help">
        JPEG・PNG・WebP、5MBまで
      </p>
      {displayedError ? (
        <p id="avatar-error" className="text-sm text-danger">
          {displayedError}
        </p>
      ) : null}
    </div>
  );
}

export function PetForm() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadStartedForPet = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState(createPet, initialState);
  const firstError = fieldOrder.find((field) => state.fieldErrors[field]);
  const busy = pending || uploading;

  useEffect(() => {
    const upload = state.upload;
    if (!state.success || !upload || uploadStartedForPet.current === upload.petId) {
      return;
    }

    const pendingUpload = upload;
    uploadStartedForPet.current = upload.petId;
    setUploading(true);

    void (async () => {
      async function handleUploadFailure() {
        await discardPendingPet(pendingUpload.petId, pendingUpload.storagePath);
        router.replace(
          `/home?${new URLSearchParams({
            message: uploadFailureMessage,
          }).toString()}`,
        );
      }

      try {
        if (!selectedFile) {
          await handleUploadFailure();
          return;
        }

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("pet-avatars")
          .upload(pendingUpload.storagePath, selectedFile, {
            contentType: selectedFile.type,
            upsert: false,
          });

        if (uploadError) {
          await handleUploadFailure();
          return;
        }

        const result = await finalizePetAvatar(
          pendingUpload.petId,
          pendingUpload.storagePath,
        );
        router.replace(
          result.success
            ? "/home"
            : `/home?${new URLSearchParams({
                message: result.message ?? uploadFailureMessage,
              }).toString()}`,
        );
        router.refresh();
      } catch {
        await handleUploadFailure();
      }
    })().finally(() => {
      setUploading(false);
    });
  }, [router, selectedFile, state.success, state.upload]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="has_avatar" value={selectedFile ? "true" : "false"} />
      <input type="hidden" name="avatar_type" value={selectedFile?.type ?? ""} />
      <input
        type="hidden"
        name="avatar_size"
        value={selectedFile ? String(selectedFile.size) : ""}
      />
      {state.message ? (
        <p role="alert" className="app-error">
          {state.message}
        </p>
      ) : null}

      <AvatarPicker
        onFileChange={setSelectedFile}
        error={state.fieldErrors.avatar}
        autoFocus={firstError === "avatar"}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          名前
          <span className="app-required">必須</span>
        </span>
        <input
          className="app-input"
          name="name"
          type="text"
          maxLength={50}
          defaultValue={state.values.name}
          aria-invalid={Boolean(state.fieldErrors.name)}
          aria-describedby={state.fieldErrors.name ? "name-error" : undefined}
          autoFocus={firstError === "name"}
          required
        />
        {state.fieldErrors.name ? (
          <span id="name-error" className="text-sm text-danger">
            {state.fieldErrors.name}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          種類
          <span className="app-required">必須</span>
        </span>
        <select
          className="app-input"
          name="species"
          defaultValue={state.values.species}
          aria-invalid={Boolean(state.fieldErrors.species)}
          aria-describedby={state.fieldErrors.species ? "species-error" : undefined}
          autoFocus={firstError === "species"}
          required
        >
          <option value="" disabled>
            選択してください
          </option>
          <option value="dog">犬</option>
          <option value="cat">猫</option>
        </select>
        {state.fieldErrors.species ? (
          <span id="species-error" className="text-sm text-danger">
            {state.fieldErrors.species}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          犬種・猫種
          <span className="app-optional">任意</span>
        </span>
        <input
          className="app-input"
          name="breed"
          type="text"
          maxLength={100}
          defaultValue={state.values.breed}
          aria-invalid={Boolean(state.fieldErrors.breed)}
          aria-describedby={state.fieldErrors.breed ? "breed-error" : undefined}
          autoFocus={firstError === "breed"}
        />
        {state.fieldErrors.breed ? (
          <span id="breed-error" className="text-sm text-danger">
            {state.fieldErrors.breed}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          性別
          <span className="app-optional">任意</span>
        </span>
        <select
          className="app-input"
          name="gender"
          defaultValue={state.values.gender}
          aria-invalid={Boolean(state.fieldErrors.gender)}
          aria-describedby={state.fieldErrors.gender ? "gender-error" : undefined}
          autoFocus={firstError === "gender"}
        >
          <option value="">選択しない</option>
          <option value="male">男の子</option>
          <option value="female">女の子</option>
          <option value="unknown">不明</option>
        </select>
        {state.fieldErrors.gender ? (
          <span id="gender-error" className="text-sm text-danger">
            {state.fieldErrors.gender}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          誕生日
          <span className="app-required">必須</span>
        </span>
        <input
          className="app-input"
          name="birthday"
          type="date"
          defaultValue={state.values.birthday}
          aria-invalid={Boolean(state.fieldErrors.birthday)}
          aria-describedby={state.fieldErrors.birthday ? "birthday-error" : undefined}
          autoFocus={firstError === "birthday"}
          required
        />
        {state.fieldErrors.birthday ? (
          <span id="birthday-error" className="text-sm text-danger">
            {state.fieldErrors.birthday}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          お迎えした日
          <span className="app-optional">任意</span>
        </span>
        <input
          className="app-input"
          name="adoption_date"
          type="date"
          defaultValue={state.values.adoption_date}
          aria-invalid={Boolean(state.fieldErrors.adoption_date)}
          aria-describedby={
            state.fieldErrors.adoption_date ? "adoption-date-error" : undefined
          }
          autoFocus={firstError === "adoption_date"}
        />
        {state.fieldErrors.adoption_date ? (
          <span id="adoption-date-error" className="text-sm text-danger">
            {state.fieldErrors.adoption_date}
          </span>
        ) : null}
      </label>

      <button
        className="app-button-primary w-full"
        type="submit"
        disabled={busy}
      >
        {uploading ? "画像をアップロード中..." : pending ? "登録中..." : "登録する"}
      </button>

      <Link className="app-back-link self-center" href="/home">
        homeへ戻る
      </Link>
    </form>
  );
}
