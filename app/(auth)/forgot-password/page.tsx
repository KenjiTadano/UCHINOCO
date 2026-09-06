import Link from "next/link";
import { PendingSubmitButton } from "../../_components/pending-submit-button";
import { requestPasswordReset } from "../actions";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const { error, message } = await searchParams;

  return (
    <main className="app-page-narrow max-w-sm justify-center">
      <header className="text-center">
        <p className="app-eyebrow">UCHINOCO</p>
        <h1 className="app-title">パスワードを再設定</h1>
        <p className="mt-2 text-sm text-muted">
          登録したメールアドレスへ再設定用の案内を送信します。
        </p>
      </header>

      {error ? <p role="alert" className="app-error">{error}</p> : null}
      {message ? <p role="status" className="app-success">{message}</p> : null}

      <form action={requestPasswordReset} className="grid gap-4">
        <label className="app-label">
          メールアドレス
          <input
            className="app-input"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <PendingSubmitButton pendingText="送信中...">
          再設定メールを送信
        </PendingSubmitButton>
      </form>

      <Link className="app-back-link self-center" href="/login">
        ログインへ戻る
      </Link>
    </main>
  );
}
