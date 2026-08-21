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

export type PetFieldErrors = Partial<Record<keyof PetFormValues, string>>;

export type CreatePetState = {
  success: false;
  message: string | null;
  fieldErrors: PetFieldErrors;
  values: PetFormValues;
  revision: number;
};

const SPECIES = new Set(["dog", "cat"]);
const GENDERS = new Set(["male", "female", "unknown"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  };
}

export async function createPet(
  _previousState: CreatePetState,
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

  if (Object.keys(fieldErrors).length > 0) {
    return errorState(_previousState, values, fieldErrors);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { error } = await supabase.from("pets").insert({
    owner_user_id: user.id,
    name: values.name,
    species: values.species,
    breed: values.breed || null,
    gender: values.gender || null,
    birthday: values.birthday,
    adoption_date: values.adoption_date || null,
  });

  if (error) {
    return errorState(
      _previousState,
      values,
      {},
      "ペットを登録できませんでした。時間をおいて再度お試しください。",
    );
  }

  revalidatePath("/home");
  redirect("/home");
}
