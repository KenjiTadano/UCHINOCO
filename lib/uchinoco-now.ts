export type UchinocoNowPhoto = {
  id: string;
  pet_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  created_at: string;
  favorite: boolean;
  caption?: string | null;
};

export type UchinocoNowPet = {
  id: string;
  name: string;
};

export type UchinocoNowAlbum = {
  id: string;
  petId: string;
  title: string;
  status: "ready" | "editing";
};

export type UchinocoNowAnniversary = {
  petId: string;
  petName: string;
  kind: "birthday" | "adoption";
  years?: number | null;
  count?: number;
};

export type UchinocoNowFamilyActivity = {
  count: number;
  href: string;
};

export type UchinocoNowContext = {
  selectedPet: UchinocoNowPet | null;
  pets: UchinocoNowPet[];
  anniversary: UchinocoNowAnniversary | null;
  readyAlbum: UchinocoNowAlbum | null;
  passiveCandidate: { petId: string; title: string; photoCount: number; href: string } | null;
  previousPassiveCandidate?: { title: string; href: string } | null;
  annualCandidate?: { petId: string; year: number; photoCount: number; href: string } | null;
  growthComparison?: { petId: string; yearsAgo: number; href: string } | null;
  albumProgress: { photoCount: number; target: number; href: string; candidateReady?: boolean } | null;
  familyActivity: UchinocoNowFamilyActivity | null;
  todayBestShot: UchinocoNowPhoto | null;
  todayLatestPhoto: UchinocoNowPhoto | null;
  fallbackPhoto: UchinocoNowPhoto | null;
  onThisDay: { photo: UchinocoNowPhoto; yearsAgo: number } | null;
  capturePromptAvailable: boolean;
  addPhotoHref: string;
  memoriesHref: string;
};

export type UchinocoNowHero = {
  type:
    | "ANNIVERSARY"
    | "ALBUM_READY"
    | "ALBUM_PROGRESS"
    | "FAMILY_NEW"
    | "TODAY_BEST_SHOT"
    | "TODAY_CAPTURE"
    | "ON_THIS_DAY";
  priority: number;
  eyebrow: string;
  title: string;
  message: string;
  petId: string | null;
  photo: UchinocoNowPhoto | null;
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
};

/**
 * Home never rotates randomly. A stable context always produces the same Hero.
 * Family activity is optional until the product owns a family activity model.
 */
export function selectUchinocoNowHero(context: UchinocoNowContext): UchinocoNowHero | null {
  if (!context.pets.length) return null;

  if (context.anniversary) {
    const birthday = context.anniversary.kind === "birthday";
    return {
      type: "ANNIVERSARY",
      priority: 1,
      eyebrow: birthday ? "TODAY · BIRTHDAY" : "TODAY · ANNIVERSARY",
      title: (context.anniversary.count ?? 1) > 1
        ? `今日は${context.anniversary.count}匹の記念日。`
        : birthday
          ? `今日は${context.anniversary.petName}の誕生日。`
          : context.anniversary.years && context.anniversary.years > 0
            ? `${context.anniversary.petName}を迎えて${context.anniversary.years}年。`
            : `今日は${context.anniversary.petName}を迎えた記念日。`,
      message: "今日までの思い出を、ゆっくり振り返りませんか？",
      petId: context.anniversary.petId,
      photo: bestAvailablePhoto(context, context.anniversary.petId),
      cta: { label: "思い出を見る", href: `/pets/${context.anniversary.petId}/anniversary` },
      secondary: context.growthComparison?.petId === context.anniversary.petId
        ? { label: `${context.growthComparison.yearsAgo}年前と比べる`, href: context.growthComparison.href }
        : { label: "写真を追加", href: `/pets/${context.anniversary.petId}/photos/new` },
    };
  }

  if (context.annualCandidate) {
    return {
      type: "ALBUM_READY",
      priority: 2,
      eyebrow: `${context.annualCandidate.year} · YEAR IN REVIEW`,
      title: `${context.annualCandidate.year}年の思い出、できています`,
      message: `${context.annualCandidate.photoCount}枚から、1年のBest ShotとStoryをまとめました。`,
      petId: context.annualCandidate.petId,
      photo: bestAvailablePhoto(context, context.annualCandidate.petId),
      cta: { label: "1年を振り返る", href: context.annualCandidate.href },
    };
  }

  if (context.readyAlbum) {
    const editing = context.readyAlbum.status === "editing";
    return {
      type: "ALBUM_READY",
      priority: 2,
      eyebrow: "UCHINOCO ALBUM",
      title: editing ? "AIがアルバムをまとめました。" : "アルバムが完成しました。",
      message: context.readyAlbum.title || "内容を確認して、そのまま楽しめます。",
      petId: context.readyAlbum.petId,
      photo: bestAvailablePhoto(context, context.readyAlbum.petId),
      cta: {
        label: "アルバムを確認する",
        href: `/pets/${context.readyAlbum.petId}/album/${context.readyAlbum.id}?view=complete`,
      },
      secondary: editing
        ? { label: "少し編集する", href: `/pets/${context.readyAlbum.petId}/album/${context.readyAlbum.id}/pages/edit` }
        : context.previousPassiveCandidate
          ? { label: `${context.previousPassiveCandidate.title}も見る`, href: context.previousPassiveCandidate.href }
          : undefined,
    };
  }

  if (context.passiveCandidate) {
    return {
      type: "ALBUM_READY",
      priority: 2,
      eyebrow: "UCHINOCO ALBUM",
      title: "今月のアルバム、できています",
      message: `${context.passiveCandidate.photoCount}枚の思い出をAIがまとめました。まだ正式Draftではありません。`,
      petId: context.passiveCandidate.petId,
      photo: bestAvailablePhoto(context, context.passiveCandidate.petId),
      cta: { label: "アルバムを見る", href: context.passiveCandidate.href },
      secondary: context.previousPassiveCandidate
        ? { label: `${context.previousPassiveCandidate.title}も見る`, href: context.previousPassiveCandidate.href }
        : { label: "写真を追加", href: context.addPhotoHref },
    };
  }

  if (context.albumProgress) {
    const remaining = Math.max(0, context.albumProgress.target - context.albumProgress.photoCount);
    const ready = remaining === 0 && context.albumProgress.candidateReady === true;
    const analyzing = remaining === 0 && !ready;
    return {
      type: "ALBUM_PROGRESS",
      priority: 2,
      eyebrow: "THIS MONTH",
      title: ready
        ? "AIが今月のアルバムをまとめられます。"
        : analyzing
          ? "今月の写真を整理しています。"
          : `あと${remaining}枚で、今月のアルバムを作れます。`,
      message: ready
        ? `今月は${context.albumProgress.photoCount}枚の思い出が集まりました。内容を確認してから作成できます。`
        : analyzing
          ? `今月は${context.albumProgress.photoCount}枚の思い出が集まりました。準備ができるまで少しお待ちください。`
          : `今月は${context.albumProgress.photoCount}枚の思い出が集まりました。`,
      petId: context.selectedPet?.id ?? null,
      photo: bestAvailablePhoto(context, context.selectedPet?.id),
      cta: ready
        ? { label: "アルバム候補を見る", href: context.albumProgress.href }
        : { label: "写真を追加", href: context.addPhotoHref },
      secondary: context.previousPassiveCandidate
        ? { label: `${context.previousPassiveCandidate.title}も見る`, href: context.previousPassiveCandidate.href }
        : ready
        ? { label: "写真を追加", href: context.addPhotoHref }
        : { label: "アルバムを見る", href: context.albumProgress.href },
    };
  }

  if (context.familyActivity) {
    return {
      type: "FAMILY_NEW",
      priority: 3,
      eyebrow: "FAMILY UPDATE",
      title: `家族から${context.familyActivity.count}枚の新しい写真が届きました。`,
      message: "新しい思い出を見てみましょう。",
      petId: context.selectedPet?.id ?? null,
      photo: bestAvailablePhoto(context, context.selectedPet?.id),
      cta: { label: "見る", href: context.familyActivity.href },
    };
  }

  const todayPhoto = context.todayBestShot ?? context.todayLatestPhoto;
  if (todayPhoto) {
    const isBestShot = context.todayBestShot?.id === todayPhoto.id;
    return {
      type: "TODAY_BEST_SHOT",
      priority: 4,
      eyebrow: isBestShot ? "TODAY'S BEST SHOT" : "TODAY",
      title: isBestShot ? "今日はこの1枚。" : "今日の思い出が届きました。",
      message:
        todayPhoto.caption?.trim() ||
        (isBestShot ? "今日追加された写真の中から選びました。" : "今日残した、大切な一枚です。"),
      petId: todayPhoto.pet_id,
      photo: todayPhoto,
      cta: { label: "写真を見る", href: `/pets/${todayPhoto.pet_id}/photos/${todayPhoto.id}` },
      secondary: { label: "写真を追加", href: `/pets/${todayPhoto.pet_id}/photos/new` },
    };
  }

  if (context.capturePromptAvailable && (context.selectedPet || context.pets.length)) {
    const pet = context.selectedPet ?? context.pets[0];
    return {
      type: "TODAY_CAPTURE",
      priority: 5,
      eyebrow: "UCHINOCO NOW",
      title: "今日の1枚を残しませんか？",
      message: pet ? `${pet.name}との今日を、未来の思い出に。` : "今日の時間を、未来の思い出に。",
      petId: pet?.id ?? null,
      photo: null,
      cta: { label: "今日の1枚を追加", href: context.addPhotoHref },
    };
  }

  if (context.onThisDay) {
    return {
      type: "ON_THIS_DAY",
      priority: 6,
      eyebrow: "ON THIS DAY",
      title: `${context.onThisDay.yearsAgo}年前の今日。`,
      message: context.onThisDay.photo.caption?.trim() || "あの日の思い出に、もう一度会いましょう。",
      petId: context.onThisDay.photo.pet_id,
      photo: context.onThisDay.photo,
      cta: {
        label: "思い出を見る",
        href: `/pets/${context.onThisDay.photo.pet_id}/photos/${context.onThisDay.photo.id}`,
      },
      secondary: context.growthComparison
        ? { label: "成長を振り返る", href: context.growthComparison.href }
        : undefined,
    };
  }

  return null;
}

function bestAvailablePhoto(context: UchinocoNowContext, petId?: string | null) {
  const candidates = [
    context.todayBestShot,
    context.todayLatestPhoto,
    context.onThisDay?.photo ?? null,
    context.fallbackPhoto,
  ];
  return candidates.find((photo) => photo && (!petId || photo.pet_id === petId)) ?? null;
}

export function tokyoDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function tokyoRange(year: number, month: number, day = 1, nextMonth = false) {
  const offset = 9 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(year, month - 1, day) - offset);
  const end = nextMonth
    ? new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1) - offset)
    : new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function isSameTokyoMonthDay(value: string | null, now: Date) {
  if (!value) return false;
  const current = tokyoDateParts(now);
  const [year, month, day] = value.split("-").map(Number);
  return Boolean(year) && month === current.month && day === current.day;
}
