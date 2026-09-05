"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  discardReplacementAvatar,
  finalizeReplacementAvatar,
  updatePet,
  type PetFieldName,
  type PetFormValues,
  type UpdatePetState,
} from "../../actions";

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 5 * 1024 * 1024;
const fieldOrder: PetFieldName[] = [
  "avatar",
  "name",
  "species",
  "breed",
  "gender",
  "birthday",
  "adoption_date",
];

export function PetEditForm({
  petId,
  initialValues,
  currentAvatarUrl,
}: {
  petId: string;
  initialValues: PetFormValues;
  currentAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clientAvatarError, setClientAvatarError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const uploadStartedForPath = useRef<string | null>(null);
  const action = updatePet.bind(null, petId);
  const [state, formAction, pending] = useActionState(action, {
    success: false,
    message: null,
    fieldErrors: {},
    values: initialValues,
    revision: 0,
    upload: null,
  } satisfies UpdatePetState);
  const firstError = fieldOrder.find((name) => state.fieldErrors[name]);
  const busy = pending || uploading;

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    clearPreview();
    setClientAvatarError(null);
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!acceptedImageTypes.has(file.type)) {
      setClientAvatarError("JPEG、PNG、WebP形式の画像を選択してください。");
      event.target.value = "";
      setSelectedFile(null);
      return;
    }
    if (file.size <= 0 || file.size > maxImageSize) {
      setClientAvatarError("画像は5MB以下の有効なファイルを選択してください。");
      event.target.value = "";
      setSelectedFile(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);
    setSelectedFile(file);
  }

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const upload = state.upload;
    if (
      !state.success ||
      !upload ||
      uploadStartedForPath.current === upload.storagePath
    ) {
      return;
    }

    const pendingUpload = upload;
    uploadStartedForPath.current = pendingUpload.storagePath;
    setUploading(true);

    void (async () => {
      const failureMessage =
        "プロフィール情報は更新されましたが、画像の変更に失敗しました。";

      async function finishWithFailure() {
        await discardReplacementAvatar(petId, pendingUpload.storagePath);
        router.replace(
          `/pets/${petId}?${new URLSearchParams({ message: failureMessage })}`,
        );
        router.refresh();
      }

      try {
        if (!selectedFile) {
          await finishWithFailure();
          return;
        }

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("pet-avatars")
          .uploadToSignedUrl(
            pendingUpload.storagePath,
            pendingUpload.token,
            selectedFile,
            {
              contentType: selectedFile.type,
            },
          );
        if (uploadError) {
          await finishWithFailure();
          return;
        }

        const result = await finalizeReplacementAvatar(
          petId,
          pendingUpload.storagePath,
        );
        router.replace(
          result.success
            ? `/pets/${petId}`
            : `/pets/${petId}?${new URLSearchParams({
                message: result.message ?? failureMessage,
              })}`,
        );
        router.refresh();
      } catch {
        await finishWithFailure();
      }
    })().finally(() => setUploading(false));
  }, [petId, router, selectedFile, state.success, state.upload]);

  const avatarError = clientAvatarError ?? state.fieldErrors.avatar;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input
        type="hidden"
        name="has_avatar"
        value={selectedFile ? "true" : "false"}
      />
      <input
        type="hidden"
        name="avatar_type"
        value={selectedFile?.type ?? ""}
      />
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

      <div className="app-card-flat flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span>プロフィール写真</span>
          <span className="app-optional">
            任意
          </span>
        </div>
        {previewUrl || currentAvatarUrl ? (
          <Image
            className="size-28 rounded-full border object-cover"
            src={previewUrl ?? currentAvatarUrl!}
            alt={
              previewUrl
                ? "新しいプロフィール写真のプレビュー"
                : "現在のプロフィール写真"
            }
            width={112}
            height={112}
            unoptimized
          />
        ) : (
          <div className="flex size-28 items-center justify-center rounded-full bg-primary-soft text-sm text-muted">
            画像未設定
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={busy}
          autoFocus={firstError === "avatar"}
          aria-invalid={Boolean(avatarError)}
          className="block w-full text-sm"
        />
        <p className="app-help">JPEG・PNG・WebP、5MBまで</p>
        {avatarError ? (
          <p className="text-sm text-danger">{avatarError}</p>
        ) : null}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          名前 <RequiredLabel />
        </span>
        <input
          key={`${state.revision}-name`}
          name="name"
          type="text"
          maxLength={50}
          defaultValue={state.values.name}
          required
          autoFocus={firstError === "name"}
          aria-invalid={Boolean(state.fieldErrors.name)}
          className="app-input"
        />
        <FieldError message={state.fieldErrors.name} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          種類 <RequiredLabel />
        </span>
        <select
          key={`${state.revision}-species`}
          name="species"
          defaultValue={state.values.species}
          required
          autoFocus={firstError === "species"}
          aria-invalid={Boolean(state.fieldErrors.species)}
          className="app-input"
        >
          <option value="" disabled>
            選択してください
          </option>
          <option value="dog">犬</option>
          <option value="cat">猫</option>
        </select>
        <FieldError message={state.fieldErrors.species} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          犬種・猫種 <OptionalLabel />
        </span>
        <input
          key={`${state.revision}-breed`}
          name="breed"
          type="text"
          maxLength={100}
          defaultValue={state.values.breed}
          autoFocus={firstError === "breed"}
          aria-invalid={Boolean(state.fieldErrors.breed)}
          className="app-input"
        />
        <FieldError message={state.fieldErrors.breed} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          性別 <OptionalLabel />
        </span>
        <select
          key={`${state.revision}-gender`}
          name="gender"
          defaultValue={state.values.gender}
          autoFocus={firstError === "gender"}
          aria-invalid={Boolean(state.fieldErrors.gender)}
          className="app-input"
        >
          <option value="">選択しない</option>
          <option value="male">男の子</option>
          <option value="female">女の子</option>
          <option value="unknown">不明</option>
        </select>
        <FieldError message={state.fieldErrors.gender} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          誕生日 <RequiredLabel />
        </span>
        <input
          key={`${state.revision}-birthday`}
          name="birthday"
          type="date"
          defaultValue={state.values.birthday}
          required
          autoFocus={firstError === "birthday"}
          aria-invalid={Boolean(state.fieldErrors.birthday)}
          className="app-input"
        />
        <FieldError message={state.fieldErrors.birthday} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          お迎えした日 <OptionalLabel />
        </span>
        <input
          key={`${state.revision}-adoption-date`}
          name="adoption_date"
          type="date"
          defaultValue={state.values.adoption_date}
          autoFocus={firstError === "adoption_date"}
          aria-invalid={Boolean(state.fieldErrors.adoption_date)}
          className="app-input"
        />
        <FieldError message={state.fieldErrors.adoption_date} />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="app-button-primary w-full"
      >
        {uploading ? "画像をアップロード中..." : pending ? "保存中..." : "保存"}
      </button>
      <Link className="app-back-link self-center" href={`/pets/${petId}`}>
        キャンセル
      </Link>
    </form>
  );
}

function RequiredLabel() {
  return (
    <span className="app-required">
      必須
    </span>
  );
}

function OptionalLabel() {
  return (
    <span className="app-optional">
      任意
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="text-sm text-danger">{message}</span>
  ) : null;
}
