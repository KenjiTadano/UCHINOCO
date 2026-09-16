"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PhotoPetOption } from "@/lib/photo-pets";
import { addPhotoPet, removePhotoPet, type PhotoMutationState } from "./actions";

function PetAvatar({ pet }: { pet: PhotoPetOption }) {
  return pet.avatarUrl ? (
    <Image src={pet.avatarUrl} alt={`${pet.name}のプロフィール写真`} width={32} height={32}
      className="size-8 shrink-0 rounded-full object-cover" unoptimized />
  ) : (
    <span role="img" aria-label={`${pet.name}のプロフィール写真なし`}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-warm text-xs text-muted">
      {pet.name.slice(0, 1)}
    </span>
  );
}

export function PhotoPetControls({ primaryPet, photoId, appearing, candidates, unavailable }: {
  primaryPet: PhotoPetOption;
  photoId: string;
  appearing: PhotoPetOption[];
  candidates: PhotoPetOption[];
  unavailable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PhotoMutationState | null>(null);
  const [pending, startTransition] = useTransition();
  const addButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!pending && restoreFocus.current) {
      restoreFocus.current = false;
      addButton.current?.focus();
    }
  }, [pending]);

  function mutate(operation: "add" | "remove", targetPetId: string) {
    setState(null);
    startTransition(async () => {
      try {
        const result = await (operation === "add" ? addPhotoPet : removePhotoPet)(primaryPet.id, photoId, targetPetId);
        setState(result);
        if (result.success) {
          setOpen(false);
          restoreFocus.current = true;
          router.refresh();
        }
      } catch {
        setState({ success: false, message: operation === "add" ? "ペットを追加できませんでした。" : "関連を解除できませんでした。" });
      }
    });
  }

  return (
    <section className="app-card-flat grid gap-6" aria-label="写真に関連するペット" aria-busy={pending}>
      <div className="grid gap-2">
        <h2 className="text-sm font-medium text-muted">登録先</h2>
        <div className="flex items-center gap-2.5">
          <PetAvatar pet={primaryPet} />
          <span className="min-w-0 break-words text-sm font-medium">{primaryPet.name}</span>
        </div>
        <p className="app-help">この写真を追加したペット</p>
      </div>

      <div className="grid gap-3">
        <h2 className="text-sm font-medium" id="appearing-pets-heading">写っているペット</h2>
        {unavailable ? (
          <p role="alert" className="app-help">ペットの情報を取得できませんでした。ページを再読み込みしてください。</p>
        ) : appearing.length === 0 ? (
          <p className="app-help">まだ追加されていません。</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-labelledby="appearing-pets-heading">
            {appearing.map((pet) => (
              <li key={pet.id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-brand-terracotta/20 bg-brand-terracotta-soft py-1 pl-2 pr-1">
                <PetAvatar pet={pet} />
                <span className="min-w-0 break-words text-sm">{pet.name}</span>
                <button type="button" disabled={pending} aria-label={`${pet.name}の関連を解除`}
                  onClick={() => mutate("remove", pet.id)}
                  className="ds-focus flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-brand-terracotta-strong disabled:opacity-50">
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button ref={addButton} type="button" disabled={pending || unavailable}
          aria-expanded={open} aria-controls="photo-pet-candidates"
          onClick={() => { setOpen(!open); setState(null); }}
          className="ds-focus inline-flex min-h-11 w-fit items-center rounded-full border bg-surface px-4 text-sm text-brand-terracotta-strong hover:bg-surface-warm disabled:opacity-50">
          {open ? "閉じる" : "＋ ペットを追加"}
        </button>

        <div id="photo-pet-candidates" hidden={!open}>
          {candidates.length === 0 ? (
            <p className="app-help">追加できるペットはいません。</p>
          ) : (
            <div className="grid gap-2 rounded-2xl bg-surface-warm p-3">
              <p className="app-help">この写真に写っているペットを選んでください。</p>
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="追加できるペット">
                {candidates.map((pet) => (
                  <li key={pet.id} className="min-w-0">
                    <button type="button" disabled={pending} onClick={() => mutate("add", pet.id)}
                      aria-label={`${pet.name}を追加`}
                      className="ds-focus flex min-h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-left text-sm hover:border-brand-terracotta disabled:opacity-50">
                      <PetAvatar pet={pet} /><span className="min-w-0 break-words">{pet.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div aria-live="polite" aria-atomic="true">
          {pending ? <p className="app-help">更新しています…</p> : state?.message ? (
            <p role={state.success ? "status" : "alert"} className={state.success ? "app-help" : "text-sm text-danger"}>{state.message}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
