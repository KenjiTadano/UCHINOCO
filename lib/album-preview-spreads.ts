/** Build 06.3 preview spreads from real album photos — never invent events/places. */

export type PreviewPhoto = {
  src: string;
  alt: string;
  objectPosition?: string;
};

export type PreviewSpread =
  | {
      layout: "A";
      title: string | null;
      body: string | null;
      accent: string | null;
      rightPhoto: PreviewPhoto;
    }
  | {
      layout: "B";
      leftTop: PreviewPhoto;
      leftBottom: [PreviewPhoto, PreviewPhoto];
      rightTop: PreviewPhoto;
      title: string | null;
      body: string | null;
    }
  | {
      layout: "C";
      title: string | null;
      body: string | null;
      rightPhoto: PreviewPhoto;
      /** Only when real seasonal wording exists in caption/analysis — never invent. */
      hasSeasonAccent: boolean;
    }
  | {
      /** 1–2 photos: text-forward left + large right (no blank page). */
      layout: "D";
      eyebrow: string | null;
      title: string;
      body: string;
      accent: string | null;
      leftPhoto: PreviewPhoto | null;
      rightPhoto: PreviewPhoto;
    }
  | {
      /** 3–4 photos: title/body + medium left; large (+ optional small) right. */
      layout: "E";
      title: string;
      body: string;
      leftPhoto: PreviewPhoto;
      rightLarge: PreviewPhoto;
      rightSmall: PreviewPhoto | null;
    }
  | {
      /** 07.2 To Be: text left + large top + two small bottom on right. */
      layout: "F";
      title: string | null;
      body: string | null;
      accent: string | null;
      rightTop: PreviewPhoto;
      rightBottom: [PreviewPhoto, PreviewPhoto];
    }
  | {
      /** Edit layout 1: large left page + two stacked on right. */
      layout: "G";
      leftPhoto: PreviewPhoto;
      rightTop: PreviewPhoto;
      rightBottom: PreviewPhoto;
    };

export type PreviewPhotoInput = {
  src: string;
  alt: string;
  caption: string | null;
  activity: string | null;
  scene: string | null;
  description: string | null;
  tags: string[] | null;
  taken_at?: string | null;
  objectPosition?: string;
};

export type BuildPreviewOpts = {
  petName?: string;
  periodMonthLabel?: string | null;
};

function firstCaptionLine(caption: string | null): string | null {
  if (!caption?.trim()) return null;
  return caption.split(/\n+/).map((l) => l.trim()).find(Boolean) ?? null;
}

function captionBody(caption: string | null): string | null {
  if (!caption?.trim()) return null;
  const lines = caption.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return null;
  return lines.slice(1).join("\n");
}

function copyFromPhoto(photo: PreviewPhotoInput): {
  title: string | null;
  body: string | null;
} {
  const title = firstCaptionLine(photo.caption);
  const body =
    captionBody(photo.caption) ??
    photo.description?.trim() ??
    null;
  if (title) return { title, body };
  if (photo.description?.trim()) {
    const sentence = photo.description
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .find(Boolean);
    return {
      title: sentence
        ? `${sentence.slice(0, 22)}${sentence.length > 22 ? "…" : ""}`
        : null,
      body: photo.description.trim(),
    };
  }
  if (photo.activity && photo.activity !== "その他") {
    return { title: `${photo.activity}のひととき`, body: null };
  }
  return { title: null, body: null };
}

function toPreviewPhoto(photo: PreviewPhotoInput): PreviewPhoto {
  return {
    src: photo.src,
    alt: photo.alt,
    objectPosition: photo.objectPosition ?? "center",
  };
}

function formatEyebrowDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Safe page copy from existing fields only — generic titles OK, no invented events. */
function safePageCopy(
  photos: PreviewPhotoInput[],
  opts?: BuildPreviewOpts,
): { eyebrow: string | null; title: string; body: string; accent: string | null } {
  const petName = opts?.petName?.trim() || null;
  const month = opts?.periodMonthLabel?.trim() || null;

  let title: string | null = null;
  let body: string | null = null;
  for (const photo of photos) {
    const copy = copyFromPhoto(photo);
    if (!title && copy.title) title = copy.title;
    if (!body && copy.body) body = copy.body;
    if (title && body) break;
  }

  if (!title) {
    if (petName) title = `この日の${petName}`;
    else if (month) title = `${month}の思い出`;
    else title = "のんびりした午後";
  }

  if (!body) {
    if (month && petName) {
      body = `${petName}との${month}から選んだ写真です。`;
    } else if (petName) {
      body = `${petName}との日々から選んだ、大切なひとコマです。`;
    } else if (month) {
      body = `${month}に残した、やわらかい時間です。`;
    } else {
      body = "大切なひとコマを、そっと残しました。";
    }
  }

  const taken =
    photos.map((p) => formatEyebrowDate(p.taken_at)).find(Boolean) ?? null;
  const eyebrow = taken ?? (month ? `${month}` : null);
  const accent = petName ? `${petName}と ずっと、いっしょに。` : null;

  return { eyebrow, title, body, accent };
}

function buildLayoutD(
  photos: PreviewPhotoInput[],
  opts?: BuildPreviewOpts,
): PreviewSpread {
  const copy = safePageCopy(photos, opts);
  const right = photos[0];
  const leftExtra = photos[1] ?? null;
  return {
    layout: "D",
    eyebrow: copy.eyebrow,
    title: copy.title,
    body: copy.body,
    accent: copy.accent,
    leftPhoto: leftExtra ? toPreviewPhoto(leftExtra) : null,
    rightPhoto: toPreviewPhoto(right),
  };
}

function buildLayoutE(
  photos: PreviewPhotoInput[],
  opts?: BuildPreviewOpts,
): PreviewSpread {
  const copy = safePageCopy(photos, opts);
  return {
    layout: "E",
    title: copy.title,
    body: copy.body,
    leftPhoto: toPreviewPhoto(photos[0]),
    rightLarge: toPreviewPhoto(photos[1] ?? photos[0]),
    rightSmall: photos[2] ? toPreviewPhoto(photos[2]) : null,
  };
}

/**
 * Spread packing:
 * - 1–2 photos → Layout D (never blank left)
 * - 3–4 photos → Layout E (+ leftover D if 4th unused as solo)
 * - ≥5 → B in fours; leftovers via D/E (not empty Layout A)
 */
export function buildAlbumPreviewSpreads(
  photos: PreviewPhotoInput[],
  opts?: BuildPreviewOpts,
): PreviewSpread[] {
  const withSrc = photos.filter((p) => Boolean(p.src));
  if (withSrc.length === 0) return [];

  if (withSrc.length <= 2) {
    return [buildLayoutD(withSrc, opts)];
  }

  if (withSrc.length <= 4) {
    const spreads: PreviewSpread[] = [buildLayoutE(withSrc.slice(0, 3), opts)];
    if (withSrc.length === 4) {
      spreads.push(buildLayoutD([withSrc[3]], opts));
    }
    return spreads;
  }

  const spreads: PreviewSpread[] = [];
  let i = 0;

  while (i < withSrc.length) {
    const remaining = withSrc.length - i;

    if (remaining >= 4) {
      const chunk = withSrc.slice(i, i + 4);
      const copy = copyFromPhoto(chunk[3]) ?? copyFromPhoto(chunk[0]);
      const safe = safePageCopy(chunk, opts);
      spreads.push({
        layout: "B",
        leftTop: toPreviewPhoto(chunk[0]),
        leftBottom: [toPreviewPhoto(chunk[1]), toPreviewPhoto(chunk[2])],
        rightTop: toPreviewPhoto(chunk[3]),
        title: copy.title ?? safe.title,
        body: copy.body ?? safe.body,
      });
      i += 4;
      continue;
    }

    if (remaining === 3) {
      spreads.push(buildLayoutE(withSrc.slice(i, i + 3), opts));
      i += 3;
      continue;
    }

    // 1–2 leftover
    spreads.push(buildLayoutD(withSrc.slice(i), opts));
    break;
  }

  return spreads;
}

/**
 * 07.2 page-edit packing: one navigable spread per 1–2 photos.
 * Keeps preview packing (buildAlbumPreviewSpreads) unchanged for 06.3.
 */
export function buildAlbumEditSpreads(
  photos: PreviewPhotoInput[],
  opts?: BuildPreviewOpts,
): PreviewSpread[] {
  const withSrc = photos.filter((p) => Boolean(p.src));
  if (withSrc.length === 0) return [];

  const spreads: PreviewSpread[] = [];
  for (let i = 0; i < withSrc.length; i += 2) {
    spreads.push(buildLayoutD(withSrc.slice(i, i + 2), opts));
  }
  return spreads;
}

export type SpreadCopy = {
  title: string | null;
  body: string | null;
  accent: string | null;
  eyebrow: string | null;
};

/** Photos currently placed on a spread (order: primary → secondary). */
export function extractSpreadPhotos(spread: PreviewSpread): PreviewPhoto[] {
  switch (spread.layout) {
    case "A":
    case "C":
      return [spread.rightPhoto];
    case "B":
      return [spread.leftTop, spread.leftBottom[0], spread.leftBottom[1], spread.rightTop];
    case "D":
      return spread.leftPhoto
        ? [spread.rightPhoto, spread.leftPhoto]
        : [spread.rightPhoto];
    case "E":
      return spread.rightSmall
        ? [spread.leftPhoto, spread.rightLarge, spread.rightSmall]
        : [spread.leftPhoto, spread.rightLarge];
    case "F":
      return [spread.rightTop, spread.rightBottom[0], spread.rightBottom[1]];
    case "G":
      return [spread.leftPhoto, spread.rightTop, spread.rightBottom];
  }
}

export function extractSpreadCopy(spread: PreviewSpread): SpreadCopy {
  switch (spread.layout) {
    case "A":
      return {
        title: spread.title,
        body: spread.body,
        accent: spread.accent,
        eyebrow: null,
      };
    case "B":
      return {
        title: spread.title,
        body: spread.body,
        accent: null,
        eyebrow: null,
      };
    case "C":
      return {
        title: spread.title,
        body: spread.body,
        accent: null,
        eyebrow: null,
      };
    case "D":
      return {
        title: spread.title,
        body: spread.body,
        accent: spread.accent,
        eyebrow: spread.eyebrow,
      };
    case "E":
      return {
        title: spread.title,
        body: spread.body,
        accent: null,
        eyebrow: null,
      };
    case "F":
      return {
        title: spread.title,
        body: spread.body,
        accent: spread.accent,
        eyebrow: null,
      };
    case "G":
      return { title: null, body: null, accent: null, eyebrow: null };
  }
}

/** 07.2 layout selector ids (UI only — no DB persistence). */
export type EditLayoutId = "1" | "2" | "3" | "4";

export function editLayoutFromSpread(spread: PreviewSpread): EditLayoutId {
  switch (spread.layout) {
    case "G":
      return "1";
    case "F":
      return "2";
    case "E":
      return "3";
    case "D":
      return "4";
    case "B":
      return "1";
    default:
      return "2";
  }
}

/**
 * Remap photos + copy into a selector layout for instant BookSpread update.
 * Does not touch album_photos / DB.
 */
export function applyEditLayout(
  photos: PreviewPhoto[],
  copy: SpreadCopy,
  id: EditLayoutId,
): PreviewSpread {
  const fallback: PreviewPhoto = photos[0] ?? {
    src: "",
    alt: "",
  };
  const p = (i: number) => photos[i] ?? fallback;
  const title = copy.title ?? "";
  const body = copy.body ?? "";

  switch (id) {
    case "1":
      return {
        layout: "G",
        leftPhoto: p(0),
        rightTop: p(1),
        rightBottom: p(2),
      };
    case "2":
      return {
        layout: "F",
        title: copy.title,
        body: copy.body,
        accent: copy.accent,
        rightTop: p(0),
        rightBottom: [p(1), p(2)],
      };
    case "3":
      return {
        layout: "E",
        title,
        body,
        leftPhoto: p(0),
        rightLarge: p(1),
        rightSmall: photos[2] ? p(2) : null,
      };
    case "4":
      return {
        layout: "D",
        eyebrow: copy.eyebrow,
        title,
        body,
        accent: copy.accent,
        leftPhoto: photos[1] ? p(1) : null,
        rightPhoto: p(0),
      };
  }
}
