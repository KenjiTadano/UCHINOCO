import { redirect } from "next/navigation";
import { PendingSubmitButton } from "../_components/pending-submit-button";
import { resetPassword } from "../(auth)/actions";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const [{ error }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect(
      "/forgot-password?error=" +
        encodeURIComponent("再設定リンクが無効か、有効期限が切れています。もう一度お試しください。"),
    );
  }

  return (
    <main className="app-page-narrow max-w-sm justify-center">
      <header className="text-center">
        <p className="app-eyebrow">UCHINOCO</p>
        <h1 className="app-title">新しいパスワード</h1>
      </header>
      {error ? <p role="alert" className="app-error">{error}</p> : null}
      <form action={resetPassword} className="grid gap-4">
        <label className="app-label">
          新しいパスワード
          <input className="app-input" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <label className="app-label">
          パスワード確認
          <input className="app-input" name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required />
        </label>
        <p className="app-help">8文字以上で入力してください。</p>
        <PendingSubmitButton pendingText="変更中...">
          パスワードを変更
        </PendingSubmitButton>
      </form>
    </main>
  );
}
