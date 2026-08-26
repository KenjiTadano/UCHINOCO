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

  return {
    success: true,
    message: null,
    fieldErrors: {},
    values,
    revision: previousState.revision,
    upload: {
      petId: pet.id,
      storagePath,
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
