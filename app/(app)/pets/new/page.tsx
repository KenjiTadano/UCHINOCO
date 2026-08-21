import { PetForm } from "./pet-form";

export default function NewPetPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header>
        <p className="text-sm text-zinc-500">UCHINOCO</p>
        <h1 className="mt-1 text-2xl font-semibold">うちの子を登録</h1>
      </header>

      <PetForm />
    </main>
  );
}
