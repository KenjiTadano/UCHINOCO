import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptFamilyInvite } from "@/app/(app)/pets/[petId]/family/actions";

export default async function AcceptFamilyInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/family/invite/${token}`)}`);
  return (
    <main className="app-page grid gap-5">
      <div className="grid gap-2">
        <p className="text-xs font-semibold tracking-wider text-primary">FAMILY SHARING</p>
        <h1 className="text-2xl font-semibold">家族の共有に参加</h1>
        <p className="text-sm leading-relaxed text-muted">招待先のメールアドレスでログインしている場合、このペットの思い出を一緒に見られます。</p>
      </div>
      <form action={acceptFamilyInvite}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="app-button-primary min-h-11 w-full">招待を受け入れる</button>
      </form>
    </main>
  );
}
