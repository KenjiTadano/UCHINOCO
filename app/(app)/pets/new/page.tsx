import { PetForm } from "./pet-form";

export default function NewPetPage() {
  return (
    <main className="app-page-narrow justify-center">
      <header>
        <p className="app-eyebrow">UCHINOCO</p>
        <h1 className="app-title">うちの子を登録</h1>
      </header>

      <PetForm />
    </main>
  );
}
