import Link from "next/link";
import { login } from "../actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <header>
        <p className="text-sm text-zinc-500">UCHINOCO</p>
        <h1 className="mt-1 text-2xl font-semibold">ログイン</h1>
      </header>

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <form action={login} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          メールアドレス
          <input
            className="rounded border border-zinc-300 px-3 py-2"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスワード
          <input
            className="rounded border border-zinc-300 px-3 py-2"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        <button className="rounded bg-zinc-900 px-4 py-2 text-white" type="submit">
          ログイン
        </button>
      </form>

      <p className="text-sm text-zinc-600">
        アカウントをお持ちでない場合は、
        <Link className="underline" href="/signup">
          新規登録
        </Link>
        してください。
      </p>
    </main>
  );
}
