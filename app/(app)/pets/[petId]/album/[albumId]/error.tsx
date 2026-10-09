"use client";

import { RecoveryState } from "../new/recovery-state";

export default function AlbumViewError({ reset }: { reset: () => void }) {
  return (
    <main className="app-page-narrow justify-center">
      <RecoveryState title="アルバムを表示できませんでした" description="表示をもう一度試すか、アルバム一覧から開き直せます。" primaryAction={{ label: "表示をもう一度試す", onClick: reset }} secondaryAction={{ label: "アルバム一覧へ戻る", href: "/album" }} />
    </main>
  );
}
