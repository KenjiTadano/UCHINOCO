import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export type PetSwitcherPet = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type PetSwitcherLayout = "toolbar" | "header";

type PetSwitcherProps = {
  pets: PetSwitcherPet[];
  activePetId: string;
  /** Build href for each pet (e.g. memories / add-photo / search). */
  hrefForPet: (petId: string) => string;
  /**
   * - toolbar: full-width row (02 思い出, 03 写真追加)
   * - header: compact top-right cluster (04 探す)
   */
  layout?: PetSwitcherLayout;
  /** Optional trailing slot (02 filters, 03 handwritten deco). */
  trailing?: ReactNode;
  className?: string;
};

/** Shared registered-pet row — same avatars, names, ring, and add affordance. */
export function PetSwitcher({
  pets,
  activePetId,
  hrefForPet,
  layout = "toolbar",
  trailing,
  className,
}: PetSwitcherProps) {
  const shell =
    layout === "header" ? "pet-switcher-header" : "mem-toolbar";

  return (
    <div className={`${shell} ${className ?? ""}`.trim()}>
      <nav aria-label="ペットを選択" className="mem-pets">
        {pets.map((p) => {
          const active = p.id === activePetId;
          return (
            <Link
              key={p.id}
              href={hrefForPet(p.id)}
              aria-current={active ? "page" : undefined}
              className={`mem-pet ds-focus ${active ? "is-active" : ""}`}
            >
              {p.avatarUrl ? (
                <Image
                  src={p.avatarUrl}
                  alt={`${p.name}のプロフィール写真`}
                  width={36}
                  height={36}
                  className="mem-pet-avatar"
                  unoptimized
                />
              ) : (
                <span
                  className="mem-pet-avatar mem-pet-avatar-fallback"
                  aria-hidden="true"
                >
                  {p.name.slice(0, 1)}
                </span>
              )}
              <span className="mem-pet-name">{p.name}</span>
            </Link>
          );
        })}
        <Link href="/pets/new" className="mem-pet mem-pet-add ds-focus">
          <span className="mem-pet-avatar mem-pet-avatar-add" aria-hidden="true">
            <Plus size={16} strokeWidth={1.8} />
          </span>
          <span className="mem-pet-name">ペットを追加</span>
        </Link>
      </nav>
      {trailing}
    </div>
  );
}
