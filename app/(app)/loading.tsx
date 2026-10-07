import { LoadingState } from "@/app/_components/ui";

export default function AppLoading() {
  return (
    <main className="app-page" aria-live="polite">
      <LoadingState label="読み込んでいます..." />
    </main>
  );
}
