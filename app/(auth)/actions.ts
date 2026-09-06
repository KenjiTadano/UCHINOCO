"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function field(formData: FormData, name: string, trim = true) {
  const value = formData.get(name);
  if (typeof value !== "string") {
    return "";
  }

  return trim ? value.trim() : value;
}

function redirectWithMessage(
  path: "/login" | "/signup" | "/home" | "/forgot-password" | "/reset-password",
  kind: "error" | "message",
  message: string,
): never {
  const params = new URLSearchParams({ [kind]: message });
  redirect(`${path}?${params.toString()}`);
}

function validateCredentials(email: string, password: string) {
  if (!EMAIL_PATTERN.test(email)) {
    return "有効なメールアドレスを入力してください。";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`;
  }

  return null;
}

function getEmailRedirectTo() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!siteUrl) {
    return null;
  }

  try {
    return new URL("/auth/confirm", siteUrl).toString();
  } catch {
    return null;
  }
}

export async function requestPasswordReset(formData: FormData) {
  const email = field(formData, "email");
  if (!EMAIL_PATTERN.test(email)) {
    redirectWithMessage(
      "/forgot-password",
      "error",
      "有効なメールアドレスを入力してください。",
    );
  }

  const redirectTo = getEmailRedirectTo();
  if (!redirectTo) {
    redirectWithMessage(
      "/forgot-password",
      "error",
      "現在、再設定メールを送信できません。時間をおいて再度お試しください。",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) {
    redirectWithMessage(
      "/forgot-password",
      "error",
      "再設定メールを送信できませんでした。時間をおいて再度お試しください。",
    );
  }

  redirectWithMessage(
    "/forgot-password",
    "message",
    "パスワード再設定用の案内を送信しました。メールをご確認ください。",
  );
}

export async function resetPassword(formData: FormData) {
  const password = field(formData, "password", false);
  const confirmation = field(formData, "password_confirmation", false);
  if (password.length < MIN_PASSWORD_LENGTH) {
    redirectWithMessage(
      "/reset-password",
      "error",
      `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください。`,
    );
  }
  if (password !== confirmation) {
    redirectWithMessage(
      "/reset-password",
      "error",
      "パスワードと確認用パスワードが一致しません。",
    );
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirectWithMessage(
      "/reset-password",
      "error",
      "再設定リンクが無効か、有効期限が切れています。もう一度お試しください。",
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirectWithMessage(
      "/reset-password",
      "error",
      "パスワードを変更できませんでした。入力内容を確認して再度お試しください。",
    );
  }

  const { error: signOutError } = await supabase.auth.signOut();
  revalidatePath("/", "layout");
  if (signOutError) {
    redirectWithMessage(
      "/home",
      "message",
      "パスワードを変更しました。現在のログイン状態はそのまま利用できます。",
    );
  }
  redirectWithMessage(
    "/login",
    "message",
    "パスワードを変更しました。新しいパスワードでログインしてください。",
  );
}

export async function login(formData: FormData) {
  const email = field(formData, "email");
  const password = field(formData, "password", false);
  const validationError = validateCredentials(email, password);

  if (validationError) {
    redirectWithMessage("/login", "error", validationError);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirectWithMessage(
      "/login",
      "error",
      "メールアドレスまたはパスワードが正しくありません。",
    );
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function signup(formData: FormData) {
  const displayName = field(formData, "display_name");
  const email = field(formData, "email");
  const password = field(formData, "password", false);
  const passwordConfirmation = field(
    formData,
    "password_confirmation",
    false,
  );

  if (!displayName || displayName.length > 50) {
    redirectWithMessage(
      "/signup",
      "error",
      "表示名は1文字以上50文字以内で入力してください。",
    );
  }

  const validationError = validateCredentials(email, password);
  if (validationError) {
    redirectWithMessage("/signup", "error", validationError);
  }

  if (password !== passwordConfirmation) {
    redirectWithMessage(
      "/signup",
      "error",
      "パスワードと確認用パスワードが一致しません。",
    );
  }

  const emailRedirectTo = getEmailRedirectTo();
  if (!emailRedirectTo) {
    redirectWithMessage(
      "/signup",
      "error",
      "現在、新規登録を利用できません。時間をおいて再度お試しください。",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo,
    },
  });

  if (error || data.user?.identities?.length === 0) {
    redirectWithMessage(
      "/signup",
      "error",
      "このメールアドレスでは登録できません。入力内容を確認するか、ログインをお試しください。",
    );
  }

  if (!data.session) {
    redirectWithMessage(
      "/signup",
      "message",
      "確認メールを送信しました。メール内のリンクから登録を完了してください。",
    );
  }

  revalidatePath("/", "layout");
  redirect("/home");
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    redirectWithMessage(
      "/home",
      "error",
      "ログアウトできませんでした。時間をおいて再度お試しください。",
    );
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
