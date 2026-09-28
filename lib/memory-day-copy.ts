type DayPhoto = {
  caption: string | null;
};

type DayAnalysis = {
  description: string | null;
  activity: string | null;
  scene: string | null;
};

const PLACE_SCENES = new Set(["公園", "海", "山", "カフェ", "道路"]);

/** Build day title/body/place from real caption + AI fields only — never invent copy. */
export function memoryDayCopy(
  petName: string,
  photos: DayPhoto[],
  analyses: DayAnalysis[],
) {
  const caption = photos.map((p) => p.caption?.trim()).find(Boolean) ?? null;
  const description =
    analyses.map((a) => a.description?.trim()).find(Boolean) ?? null;
  const activity =
    analyses.map((a) => a.activity?.trim()).find(Boolean) ?? null;
  const scene = analyses.map((a) => a.scene?.trim()).find(Boolean) ?? null;

  let title: string;
  let body: string | null = null;

  if (caption) {
    const lines = caption.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    title = lines[0] ?? `${petName}との一日`;
    body = lines.slice(1).join("\n") || description;
  } else if (description) {
    const sentence = description.split(/[。！？\n]/).map((s) => s.trim()).find(Boolean);
    title = sentence ? `${sentence.slice(0, 22)}${sentence.length > 22 ? "…" : ""}` : `${petName}との一日`;
    body = description;
  } else if (activity && activity !== "その他") {
    title = `${activity}の日`;
    body = null;
  } else {
    title = `${petName}との一日`;
    body = null;
  }

  const place =
    scene && PLACE_SCENES.has(scene) ? scene : null;

  const overlay = caption
    ? caption.split(/\n+/).map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 28) ??
      null
    : null;

  return { title, body, place, overlay };
}
