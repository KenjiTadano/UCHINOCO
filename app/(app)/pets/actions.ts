"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PetFormValues = {
  name: string;
  species: string;
  breed: string;
  gender: string;
  birthday: string;
  adoption_date: string;
};

export type PetFieldName = keyof PetFormValues | "avatar";
export type PetFieldErrors = Partial<Record<PetFieldName, string>>;

type AvatarUpload = {
  petId: string;
  storagePath: string;
  token: string;
};

export type CreatePetState = {
  success: boolean;
  message: string | null;
  fieldErrors: PetFieldErrors;
  values: PetFormValues;
  revision: number;
  upload: AvatarUpload | null;
};

export type FinalizePetAvatarResult = {
  success: boolean;
  message: string | null;
};

export type DiscardPendingPetResult = {
  success: boolean;
};

type AvatarReplacementUpload = {
  storagePath: string;
  token: string;
};

export type UpdatePetState = {
  success: boolean;
  message: string | null;
  fieldErrors: PetFieldErrors;
  values: PetFormValues;
  revision: number;
  upload: AvatarReplacementUpload | null;
};

export type DeletePetState = {
  success: boolean;
  message: string | null;
};

const SPECIES = new Set(["dog", "cat"]);
const GENDERS = new Set(["male", "female", "unknown"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const UPLOAD_FAILURE_MESSAGE =
  "プロフィール画像を保存できなかったため、ペットは登録されませんでした。もう一度お試しください。";
const DELETE_PET_FAILURE_MESSAGE =
  "ペットの削除に失敗しました。もう一度お試しください。";
const STORAGE_DELETE_BATCH_SIZE = 100;
const PHOTO_RECORD_BATCH_SIZE = 1000;

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function todayInJapan() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value) || value.startsWith("0000-")) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateOptionalDate(value: string, label: string) {
  if (!value) {
    return null;
  }
  if (!isValidDate(value)) {
    return `${label}を正しい日付で入力してください。`;
  }
  if (value > todayInJapan()) {
    return `${label}に未来の日付は指定できません。`;
  }
  return null;
}

function validateBirthday(value: string) {
  if (!value) {
    return "誕生日を入力してください。";
  }
  if (!isValidDate(value)) {
    return "正しい誕生日を入力してください。";
  }
  if (value > todayInJapan()) {
    return "未来の日付は指定できません。";
  }
  return null;
}

function errorState(
  previousState: CreatePetState,
  values: PetFormValues,
  fieldErrors: PetFieldErrors,
  message = "入力内容を確認してください。",
): CreatePetState {
  return {
    success: false,
    message,
    fieldErrors,
    values,
    revision: previousState.revision + 1,
    upload: null,
  };
}

function isOwnedAvatarPath(userId: string, petId: string, storagePath: string) {
  if (!UUID_PATTERN.test(petId)) {
    return false;
  }

  const pathParts = storagePath.split("/");
  const [pathUserId, pathPetId, fileName] = pathParts;
  return (
    pathParts.length === 3 &&
    pathUserId === userId &&
    pathPetId === petId &&
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i.test(
      fileName ?? "",
    )
  );
}

function isOwnedPhotoPath(userId: string, petId: string, storagePath: string) {
  const pathParts = storagePath.split("/");
  const [, , year, month, fileName] = pathParts;
  return (
    pathParts.length === 5 &&
    pathParts[0] === userId &&
    pathParts[1] === petId &&
    /^\d{4}$/.test(year ?? "") &&
    /^(0[1-9]|1[0-2])$/.test(month ?? "") &&
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i.test(
      fileName ?? "",
    )
  );
}

function logPetDeletionFailure(
  stage: string,
  error: { code?: string; error?: string; message?: string } | null,
  petId: string,
  photoObjectsDeleted: boolean,
  avatarObjectDeleted: boolean,
  databaseDeleted: boolean,
) {
  console.error("Pet deletion failed", {
    stage,
    code: error?.code ?? error?.error ?? null,
    message: error?.message ?? null,
    pet_id: petId,
    photo_objects_deleted: photoObjectsDeleted,
    avatar_object_deleted: avatarObjectDeleted,
    database_deleted: databaseDeleted,
  });
}

function logPetAvatarMutationFailure(
  stage: string,
  error: { code?: string; name?: string; message?: string } | null,
  petId: string,
  hadExistingAvatar: boolean,
) {
  console.error("Pet avatar mutation failed", {
    stage,
    code: error?.code ?? error?.name ?? null,
    message: error?.message ?? null,
    pet_id: petId,
    had_existing_avatar: hadExistingAvatar,
  });
}

async function removeStoragePaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: "pet-avatars" | "pet-photos",
  storagePaths: string[],
) {
  for (let offset = 0; offset < storagePaths.length; offset += STORAGE_DELETE_BATCH_SIZE) {
    const paths = storagePaths.slice(offset, offset + STORAGE_DELETE_BATCH_SIZE);
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      return { stage: "delete", error };
    }
  }

  return { stage: null, error: null };
}

async function removePendingPet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  petId: string,
  storagePath: string,
) {
  await supabase.storage.from("pet-avatars").remove([storagePath]);
  const { error } = await supabase
    .from("pets")
    .delete()
    .eq("id", petId)
    .eq("owner_user_id", userId)
    .is("avatar_url", null);

  if (!error) {
    revalidatePath("/home");
  }
  return !error;
}

export async function createPet(
  previousState: CreatePetState,
  formData: FormData,
): Promise<CreatePetState> {
  const values: PetFormValues = {
    name: field(formData, "name"),
    species: field(formData, "species"),
    breed: field(formData, "breed"),
    gender: field(formData, "gender"),
    birthday: field(formData, "birthday"),
    adoption_date: field(formData, "adoption_date"),
  };
  const fieldErrors: PetFieldErrors = {};
  const hasAvatar = field(formData, "has_avatar") === "true";
  const avatarType = field(formData, "avatar_type");
  const avatarSizeValue = field(formData, "avatar_size");
  const avatarSize = Number(avatarSizeValue);

  if (!values.name) {
    fieldErrors.name = "名前は必須です。";
  } else if (values.name.length > 50) {
    fieldErrors.name = "名前は50文字以内で入力してください。";
  }
  if (!SPECIES.has(values.species)) {
    fieldErrors.species = "種類は犬または猫を選択してください。";
  }
  if (values.breed.length > 100) {
    fieldErrors.breed = "犬種・猫種は100文字以内で入力してください。";
  }
  if (values.gender && !GENDERS.has(values.gender)) {
    fieldErrors.gender = "性別の選択内容が正しくありません。";
  }

  const birthdayError = validateBirthday(values.birthday);
  if (birthdayError) {
    fieldErrors.birthday = birthdayError;
  }
  const adoptionDateError = validateOptionalDate(
    values.adoption_date,
    "お迎えした日",
  );
  if (adoptionDateError) {
    fieldErrors.adoption_date = adoptionDateError;
  }

  if (hasAvatar) {
    if (!IMAGE_EXTENSIONS[avatarType]) {
      fieldErrors.avatar = "JPEG、PNG、WebP形式の画像を選択してください。";
    } else if (!Number.isSafeInteger(avatarSize) || avatarSize <= 0) {
      fieldErrors.avatar = "空の画像ファイルは登録できません。";
    } else if (avatarSize > MAX_IMAGE_SIZE) {
      fieldErrors.avatar = "プロフィール画像は5MB以下にしてください。";
    }
  } else if (avatarType || avatarSizeValue) {
    fieldErrors.avatar = "画像情報が正しくありません。画像を選び直してください。";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return errorState(previousState, values, fieldErrors);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: pet, error } = await supabase
    .from("pets")
    .insert({
      owner_user_id: user.id,
      name: values.name,
      species: values.species,
      breed: values.breed || null,
      gender: values.gender || null,
      birthday: values.birthday,
      adoption_date: values.adoption_date || null,
    })
    .select("id")
    .single();

  if (error || !pet) {
    return errorState(
      previousState,
      values,
      {},
      "ペットを登録できませんでした。時間をおいて再度お試しください。",
    );
  }

  if (!hasAvatar) {
    revalidatePath("/home");
    redirect("/home");
  }

  const extension = IMAGE_EXTENSIONS[avatarType];
  const storagePath = `${user.id}/${pet.id}/${crypto.randomUUID()}.${extension}`;
  const { data: signedUpload, error: signedUploadError } = await supabase.storage
    .from("pet-avatars")
    .createSignedUploadUrl(storagePath);
  if (signedUploadError || !signedUpload) {
    await supabase.from("pets").delete().eq("id", pet.id).eq("owner_user_id", user.id);
    return errorState(previousState, values, {}, "プロフィール画像のアップロード準備に失敗しました。");
  }

  return {
    success: true,
    message: null,
    fieldErrors: {},
    values,
    revision: previousState.revision,
    upload: {
      petId: pet.id,
      storagePath,
      token: signedUpload.token,
    },
  };
}

export async function finalizePetAvatar(
  petId: string,
  storagePath: string,
): Promise<FinalizePetAvatarResult> {
  const failure: FinalizePetAvatarResult = {
    success: false,
    message: UPLOAD_FAILURE_MESSAGE,
  };
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return failure;
  }

  if (!isOwnedAvatarPath(user.id, petId, storagePath)) {
    return failure;
  }

  const pathParts = storagePath.split("/");
  const fileName = pathParts[2];
  const fileMatch = fileName?.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i,
  );
  if (!fileMatch) {
    return failure;
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_user_id, avatar_url")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (petError || !pet || pet.owner_user_id !== user.id || pet.avatar_url !== null) {
    return failure;
  }

  const { data: avatarObject, error: infoError } = await supabase.storage
    .from("pet-avatars")
    .info(storagePath);
  const expectedMimeType = EXTENSION_MIME_TYPES[fileMatch[2].toLowerCase()];
  const storedSize = Number(avatarObject?.size ?? avatarObject?.metadata?.size);
  const storedMimeType =
    avatarObject?.contentType ?? avatarObject?.metadata?.mimetype;
  if (
    infoError ||
    !avatarObject ||
    !Number.isSafeInteger(storedSize) ||
    storedSize <= 0 ||
    storedSize > MAX_IMAGE_SIZE ||
    storedMimeType !== expectedMimeType
  ) {
    await removePendingPet(supabase, user.id, petId, storagePath);
    return failure;
  }

  const { data: updatedPet, error: updateError } = await supabase
    .from("pets")
    .update({ avatar_url: storagePath })
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .is("avatar_url", null)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedPet) {
    await removePendingPet(supabase, user.id, petId, storagePath);
    return failure;
  }

  revalidatePath("/home");
  return { success: true, message: null };
}

export async function discardPendingPet(
  petId: string,
  storagePath: string,
): Promise<DiscardPendingPetResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user || !isOwnedAvatarPath(user.id, petId, storagePath)) {
    return { success: false };
  }

  const success = await removePendingPet(
    supabase,
    user.id,
    petId,
    storagePath,
  );
  return { success };
}

function updatePetErrorState(
  previousState: UpdatePetState,
  values: PetFormValues,
  fieldErrors: PetFieldErrors,
  message = "入力内容を確認してください。",
): UpdatePetState {
  return {
    success: false,
    message,
    fieldErrors,
    values,
    revision: previousState.revision + 1,
    upload: null,
  };
}

function validatePetValues(values: PetFormValues) {
  const fieldErrors: PetFieldErrors = {};

  if (!values.name) {
    fieldErrors.name = "名前は必須です。";
  } else if (values.name.length > 50) {
    fieldErrors.name = "名前は50文字以内で入力してください。";
  }
  if (!SPECIES.has(values.species)) {
    fieldErrors.species = "種類は犬または猫を選択してください。";
  }
  if (values.breed.length > 100) {
    fieldErrors.breed = "犬種・猫種は100文字以内で入力してください。";
  }
  if (values.gender && !GENDERS.has(values.gender)) {
    fieldErrors.gender = "性別の選択内容が正しくありません。";
  }

  const birthdayError = validateBirthday(values.birthday);
  if (birthdayError) {
    fieldErrors.birthday = birthdayError;
  }
  const adoptionDateError = validateOptionalDate(
    values.adoption_date,
    "お迎えした日",
  );
  if (adoptionDateError) {
    fieldErrors.adoption_date = adoptionDateError;
  }

  return fieldErrors;
}

export async function updatePet(
  petId: string,
  previousState: UpdatePetState,
  formData: FormData,
): Promise<UpdatePetState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/login");
  }

  if (!UUID_PATTERN.test(petId)) {
    return updatePetErrorState(
      previousState,
      previousState.values,
      {},
      "ペット情報を確認できませんでした。",
    );
  }

  const { data: existingPet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_user_id, avatar_url")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (petError || !existingPet || existingPet.owner_user_id !== user.id) {
    return updatePetErrorState(
      previousState,
      previousState.values,
      {},
      "ペット情報を確認できませんでした。",
    );
  }

  const values: PetFormValues = {
    name: field(formData, "name"),
    species: field(formData, "species"),
    breed: field(formData, "breed"),
    gender: field(formData, "gender"),
    birthday: field(formData, "birthday"),
    adoption_date: field(formData, "adoption_date"),
  };
  const fieldErrors = validatePetValues(values);
  const hasAvatar = field(formData, "has_avatar") === "true";
  const avatarType = field(formData, "avatar_type");
  const avatarSizeValue = field(formData, "avatar_size");
  const avatarSize = Number(avatarSizeValue);

  if (hasAvatar) {
    if (!IMAGE_EXTENSIONS[avatarType]) {
      fieldErrors.avatar = "JPEG、PNG、WebP形式の画像を選択してください。";
    } else if (!Number.isSafeInteger(avatarSize) || avatarSize <= 0) {
      fieldErrors.avatar = "空の画像ファイルは登録できません。";
    } else if (avatarSize > MAX_IMAGE_SIZE) {
      fieldErrors.avatar = "プロフィール画像は5MB以下にしてください。";
    }
  } else if (avatarType || avatarSizeValue) {
    fieldErrors.avatar = "画像情報が正しくありません。画像を選び直してください。";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return updatePetErrorState(previousState, values, fieldErrors);
  }

  let upload: AvatarReplacementUpload | null = null;
  if (hasAvatar) {
    const extension = IMAGE_EXTENSIONS[avatarType];
    const storagePath = `${user.id}/${petId}/${crypto.randomUUID()}.${extension}`;
    const { data, error } = await supabase.storage
      .from("pet-avatars")
      .createSignedUploadUrl(storagePath);
    if (error || !data) {
      logPetAvatarMutationFailure(
        "signed_upload_create",
        error,
        petId,
        Boolean(existingPet.avatar_url),
      );
      return updatePetErrorState(
        previousState,
        values,
        {},
        "プロフィール画像のアップロード準備に失敗しました。",
      );
    }
    upload = { storagePath, token: data.token };
  }

  const { error: updateError } = await supabase
    .from("pets")
    .update({
      name: values.name,
      species: values.species,
      breed: values.breed || null,
      gender: values.gender || null,
      birthday: values.birthday,
      adoption_date: values.adoption_date || null,
    })
    .eq("id", petId)
    .eq("owner_user_id", user.id);
  if (updateError) {
    return updatePetErrorState(
      previousState,
      values,
      {},
      "プロフィールを更新できませんでした。もう一度お試しください。",
    );
  }

  const { data: updatedPet, error: verifyError } = await supabase
    .from("pets")
    .select("name, species, breed, gender, birthday, adoption_date")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  const valuesWereUpdated =
    updatedPet?.name === values.name &&
    updatedPet.species === values.species &&
    updatedPet.breed === (values.breed || null) &&
    updatedPet.gender === (values.gender || null) &&
    updatedPet.birthday === values.birthday &&
    updatedPet.adoption_date === (values.adoption_date || null);
  if (verifyError || !valuesWereUpdated) {
    return updatePetErrorState(
      previousState,
      values,
      {},
      "プロフィールを更新できませんでした。もう一度お試しください。",
    );
  }

  revalidatePath("/home");
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/edit`);

  if (!upload) {
    redirect(`/pets/${petId}`);
  }

  return {
    success: true,
    message: null,
    fieldErrors: {},
    values,
    revision: previousState.revision,
    upload,
  };
}

async function removeReplacementAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
) {
  const { error } = await supabase.storage
    .from("pet-avatars")
    .remove([storagePath]);
  return !error;
}

export async function discardReplacementAvatar(
  petId: string,
  storagePath: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user || !isOwnedAvatarPath(user.id, petId, storagePath)) {
    return { success: false };
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_user_id, avatar_url")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (
    petError ||
    !pet ||
    pet.owner_user_id !== user.id ||
    pet.avatar_url === storagePath
  ) {
    return { success: false };
  }

  return { success: await removeReplacementAvatar(supabase, storagePath) };
}

export async function finalizeReplacementAvatar(
  petId: string,
  storagePath: string,
): Promise<FinalizePetAvatarResult> {
  const failure: FinalizePetAvatarResult = {
    success: false,
    message: "プロフィール情報は更新されましたが、画像の変更に失敗しました。",
  };
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    logPetAvatarMutationFailure(
      "authorization_get_user",
      userError,
      petId,
      false,
    );
    return failure;
  }
  if (!isOwnedAvatarPath(user.id, petId, storagePath)) {
    logPetAvatarMutationFailure(
      "storage_path_validation",
      null,
      petId,
      false,
    );
    return failure;
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_user_id, avatar_url")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (petError || !pet || pet.owner_user_id !== user.id) {
    logPetAvatarMutationFailure(
      "owned_pet_lookup",
      petError,
      petId,
      Boolean(pet?.avatar_url),
    );
    await removeReplacementAvatar(supabase, storagePath);
    return failure;
  }

  const oldAvatarPath = pet.avatar_url;
  const hadExistingAvatar = oldAvatarPath !== null;

  const fileName = storagePath.split("/")[2];
  const fileMatch = fileName?.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i,
  );
  if (!fileMatch) {
    logPetAvatarMutationFailure(
      "uploaded_file_name_validation",
      null,
      petId,
      hadExistingAvatar,
    );
    await removeReplacementAvatar(supabase, storagePath);
    return failure;
  }

  const { data: avatarObject, error: infoError } = await supabase.storage
    .from("pet-avatars")
    .info(storagePath);
  const expectedMimeType = EXTENSION_MIME_TYPES[fileMatch[2].toLowerCase()];
  const storedSize = Number(avatarObject?.size ?? avatarObject?.metadata?.size);
  const storedMimeType =
    avatarObject?.contentType ?? avatarObject?.metadata?.mimetype;
  if (
    infoError ||
    !avatarObject ||
    !Number.isSafeInteger(storedSize) ||
    storedSize <= 0 ||
    storedSize > MAX_IMAGE_SIZE ||
    storedMimeType !== expectedMimeType
  ) {
    logPetAvatarMutationFailure(
      "uploaded_object_validation",
      infoError,
      petId,
      hadExistingAvatar,
    );
    await removeReplacementAvatar(supabase, storagePath);
    return failure;
  }

  let avatarUpdate = supabase
    .from("pets")
    .update({ avatar_url: storagePath })
    .eq("id", petId)
    .eq("owner_user_id", user.id);
  avatarUpdate = oldAvatarPath
    ? avatarUpdate.eq("avatar_url", oldAvatarPath)
    : avatarUpdate.is("avatar_url", null);

  const { data: updatedPet, error: updateError } = await avatarUpdate
    .select("avatar_url")
    .maybeSingle();
  if (updateError || updatedPet?.avatar_url !== storagePath) {
    logPetAvatarMutationFailure(
      "database_update",
      updateError,
      petId,
      hadExistingAvatar,
    );
    await removeReplacementAvatar(supabase, storagePath);
    return failure;
  }

  if (
    oldAvatarPath &&
    oldAvatarPath !== storagePath &&
    isOwnedAvatarPath(user.id, petId, oldAvatarPath)
  ) {
    const { error: removeError } = await supabase.storage
      .from("pet-avatars")
      .remove([oldAvatarPath]);
    if (removeError) {
      logPetAvatarMutationFailure(
        "old_avatar_delete_after_database_update",
        removeError,
        petId,
        hadExistingAvatar,
      );
    }
  }

  revalidatePath("/home");
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/edit`);
  return { success: true, message: null };
}

export async function deletePet(
  petId: string,
  _previousState: DeletePetState,
  _formData: FormData,
): Promise<DeletePetState> {
  void _previousState;
  void _formData;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    logPetDeletionFailure(
      "authorization_get_user",
      userError,
      petId,
      false,
      false,
      false,
    );
    return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
  }

  if (!UUID_PATTERN.test(petId)) {
    logPetDeletionFailure(
      "authorization_invalid_pet_id",
      null,
      petId,
      false,
      false,
      false,
    );
    return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, owner_user_id, avatar_url")
    .eq("id", petId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (petError || !pet || pet.owner_user_id !== user.id) {
    logPetDeletionFailure(
      "authorization_pet_lookup",
      petError,
      petId,
      false,
      false,
      false,
    );
    return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
  }

  const photos: Array<{
    id: string;
    pet_id: string;
    uploader_user_id: string;
    storage_path: string;
  }> = [];
  for (let offset = 0; ; offset += PHOTO_RECORD_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("photos")
      .select("id, pet_id, uploader_user_id, storage_path")
      .eq("pet_id", pet.id)
      .order("id", { ascending: true })
      .range(offset, offset + PHOTO_RECORD_BATCH_SIZE - 1);
    if (error) {
      logPetDeletionFailure(
        "photo_records_lookup",
        error,
        pet.id,
        false,
        false,
        false,
      );
      return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
    }

    photos.push(...(data ?? []));
    if ((data?.length ?? 0) < PHOTO_RECORD_BATCH_SIZE) {
      break;
    }
  }

  const photoPaths = photos.map((photo) => photo.storage_path);
  const photoRecordsAreOwned = photos.every(
    (photo) =>
      photo.pet_id === pet.id &&
      photo.uploader_user_id === user.id &&
      isOwnedPhotoPath(user.id, pet.id, photo.storage_path),
  );
  if (!photoRecordsAreOwned) {
    logPetDeletionFailure(
      "photo_storage_path_validation",
      null,
      pet.id,
      false,
      false,
      false,
    );
    return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
  }

  const avatarPathIsSafe =
    !pet.avatar_url || isOwnedAvatarPath(user.id, pet.id, pet.avatar_url);
  if (!avatarPathIsSafe) {
    logPetDeletionFailure(
      "avatar_storage_path_validation",
      null,
      pet.id,
      false,
      false,
      false,
    );
    return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
  }

  const { error: databaseError } = await supabase
    .from("pets")
    .delete()
    .eq("id", pet.id)
    .eq("owner_user_id", user.id);
  if (databaseError) {
    logPetDeletionFailure(
      "database_delete",
      databaseError,
      pet.id,
      false,
      false,
      false,
    );
    return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
  }

  const { data: remainingPet, error: verifyError } = await supabase
    .from("pets")
    .select("id")
    .eq("id", pet.id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (verifyError || remainingPet) {
    logPetDeletionFailure(
      "database_delete_verify",
      verifyError,
      pet.id,
      false,
      false,
      false,
    );
    return { success: false, message: DELETE_PET_FAILURE_MESSAGE };
  }

  const photoStorageResult = await removeStoragePaths(supabase, "pet-photos", photoPaths);
  if (photoStorageResult.error || photoStorageResult.stage) {
    logPetDeletionFailure(
      `storage_cleanup_pet_photos_${photoStorageResult.stage}`,
      photoStorageResult.error,
      pet.id,
      false,
      false,
      true,
    );
  }
  if (pet.avatar_url) {
    const avatarStorageResult = await removeStoragePaths(supabase, "pet-avatars", [pet.avatar_url]);
    if (avatarStorageResult.error || avatarStorageResult.stage) {
      logPetDeletionFailure(
        `storage_cleanup_pet_avatars_${avatarStorageResult.stage}`,
        avatarStorageResult.error,
        pet.id,
        !photoStorageResult.error && !photoStorageResult.stage,
        false,
        true,
      );
    }
  }

  revalidatePath("/home");
  revalidatePath(`/pets/${pet.id}`);
  revalidatePath(`/pets/${pet.id}/edit`);
  revalidatePath(`/pets/${pet.id}/search`);
  redirect("/home");
}
