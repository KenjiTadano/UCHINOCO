"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createPet,
  type CreatePetState,
  type PetFormValues,
} from "../actions";

const initialValues: PetFormValues = {
  name: "",
  species: "",
  breed: "",
  gender: "",
  birthday: "",
  adoption_date: "",
};

const initialState: CreatePetState = {
  success: false,
  message: null,
  fieldErrors: {},
  values: initialValues,
  revision: 0,
};

const fieldOrder: (keyof PetFormValues)[] = [
  "name",
  "species",
  "breed",
  "gender",
  "birthday",
  "adoption_date",
];

export function PetForm() {
  const [state, formAction, pending] = useActionState(createPet, initialState);
  const firstError = fieldOrder.find((field) => state.fieldErrors[field]);

  return (
    <form key={state.revision} action={formAction} className="flex flex-col gap-4">
      {state.message ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.message}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          名前
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">必須</span>
        </span>
        <input
          className="rounded border border-zinc-300 px-3 py-2"
          name="name"
          type="text"
          maxLength={50}
          defaultValue={state.values.name}
          aria-invalid={Boolean(state.fieldErrors.name)}
          aria-describedby={state.fieldErrors.name ? "name-error" : undefined}
          autoFocus={firstError === "name"}
          required
        />
        {state.fieldErrors.name ? (
          <span id="name-error" className="text-sm text-red-700">
            {state.fieldErrors.name}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          種類
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">必須</span>
        </span>
        <select
          className="rounded border border-zinc-300 px-3 py-2"
          name="species"
          defaultValue={state.values.species}
          aria-invalid={Boolean(state.fieldErrors.species)}
          aria-describedby={state.fieldErrors.species ? "species-error" : undefined}
          autoFocus={firstError === "species"}
          required
        >
          <option value="" disabled>
            選択してください
          </option>
          <option value="dog">犬</option>
          <option value="cat">猫</option>
        </select>
        {state.fieldErrors.species ? (
          <span id="species-error" className="text-sm text-red-700">
            {state.fieldErrors.species}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          犬種・猫種
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">任意</span>
        </span>
        <input
          className="rounded border border-zinc-300 px-3 py-2"
          name="breed"
          type="text"
          maxLength={100}
          defaultValue={state.values.breed}
          aria-invalid={Boolean(state.fieldErrors.breed)}
          aria-describedby={state.fieldErrors.breed ? "breed-error" : undefined}
          autoFocus={firstError === "breed"}
        />
        {state.fieldErrors.breed ? (
          <span id="breed-error" className="text-sm text-red-700">
            {state.fieldErrors.breed}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          性別
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">任意</span>
        </span>
        <select
          className="rounded border border-zinc-300 px-3 py-2"
          name="gender"
          defaultValue={state.values.gender}
          aria-invalid={Boolean(state.fieldErrors.gender)}
          aria-describedby={state.fieldErrors.gender ? "gender-error" : undefined}
          autoFocus={firstError === "gender"}
        >
          <option value="">選択しない</option>
          <option value="male">男の子</option>
          <option value="female">女の子</option>
          <option value="unknown">不明</option>
        </select>
        {state.fieldErrors.gender ? (
          <span id="gender-error" className="text-sm text-red-700">
            {state.fieldErrors.gender}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          誕生日
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">必須</span>
        </span>
        <input
          className="rounded border border-zinc-300 px-3 py-2"
          name="birthday"
          type="date"
          defaultValue={state.values.birthday}
          aria-invalid={Boolean(state.fieldErrors.birthday)}
          aria-describedby={state.fieldErrors.birthday ? "birthday-error" : undefined}
          autoFocus={firstError === "birthday"}
          required
        />
        {state.fieldErrors.birthday ? (
          <span id="birthday-error" className="text-sm text-red-700">
            {state.fieldErrors.birthday}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2">
          お迎えした日
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">任意</span>
        </span>
        <input
          className="rounded border border-zinc-300 px-3 py-2"
          name="adoption_date"
          type="date"
          defaultValue={state.values.adoption_date}
          aria-invalid={Boolean(state.fieldErrors.adoption_date)}
          aria-describedby={
            state.fieldErrors.adoption_date ? "adoption-date-error" : undefined
          }
          autoFocus={firstError === "adoption_date"}
        />
        {state.fieldErrors.adoption_date ? (
          <span id="adoption-date-error" className="text-sm text-red-700">
            {state.fieldErrors.adoption_date}
          </span>
        ) : null}
      </label>

      <button
        className="rounded bg-zinc-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? "登録中..." : "登録する"}
      </button>

      <Link className="text-center text-sm underline" href="/home">
        homeへ戻る
      </Link>
    </form>
  );
}
