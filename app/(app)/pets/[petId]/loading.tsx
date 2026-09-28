export default function PetLoading() {
  return (
    <main className="mem-page" aria-busy="true" aria-live="polite">
      <header className="mem-header">
        <div>
          <h1 className="mem-title">思い出</h1>
          <p className="mem-subtitle">読み込み中…</p>
        </div>
      </header>
    </main>
  );
}
