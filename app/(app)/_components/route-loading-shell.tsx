/** Public, identity-free fallback: safe before a route's owner checks finish. */
export function RouteLoadingShell({ title = "アルバム", print = false }: { title?: string; print?: boolean }) {
  return <main className="app-page" data-load-stage="shell" aria-busy="true">
    <header><h1 className="app-title">{title}</h1></header>
    <p role="status">内容を読み込んでいます…</p>
    <div aria-hidden="true" className="w-full rounded-xl bg-surface-warm" style={{ aspectRatio: "2 / 1", minHeight: 170 }} />
    <div aria-hidden="true" className="grid grid-cols-3 gap-3">{[0, 1, 2].map(i => <div key={i} className="rounded-lg bg-surface-warm" style={{ aspectRatio: "2 / 1" }} />)}</div>
    {print ? <button className="app-button-primary" type="button" disabled>印刷内容を確認しています</button> : null}
  </main>;
}
