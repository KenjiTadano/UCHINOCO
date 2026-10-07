"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, background: "#fcfaf7", color: "#3a2f2b", fontFamily: "sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div>
            <p style={{ letterSpacing: "0.16em", color: "#8a7a74" }}>UCHINOCO</p>
            <h1>問題が発生しました</h1>
            <p>時間をおいて、もう一度お試しください。</p>
            <button
              type="button"
              onClick={reset}
              style={{ minHeight: 44, marginTop: 12, border: 0, borderRadius: 999, padding: "0 24px", background: "#b36048", color: "white", fontWeight: 700 }}
            >
              もう一度試す
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
