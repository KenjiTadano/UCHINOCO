import { readFile } from "node:fs/promises";
import path from "node:path";
import { ALBUM_PRINT_CONFIG } from "./config.ts";
import type { TextStyleId } from "../album-polish/types.ts";

const FONT_DIR = path.join(process.cwd(), "assets", "print-fonts");

export type ResolvedPrintFont = {
  styleId: TextStyleId;
  family: string;
  file: string;
  explicitFallbackFrom: string | null;
  bytes: Uint8Array | null;
};

export function fontPlan(styleId: TextStyleId) {
  const plan = ALBUM_PRINT_CONFIG.fonts[styleId];
  return {
    styleId,
    family: plan.family,
    file: plan.file,
    explicitFallbackFrom: "explicitFallbackFrom" in plan ? plan.explicitFallbackFrom : null,
  };
}

export async function loadPrintFont(styleId: TextStyleId): Promise<ResolvedPrintFont> {
  const plan = fontPlan(styleId);
  try {
    const bytes = new Uint8Array(await readFile(path.join(FONT_DIR, plan.file)));
    return { ...plan, bytes };
  } catch {
    return { ...plan, bytes: null };
  }
}

export async function loadPrintFonts(styleIds: TextStyleId[]) {
  const unique = [...new Set(styleIds)];
  const loaded = await Promise.all(unique.map((styleId) => loadPrintFont(styleId)));
  return new Map(loaded.map((font) => [font.styleId, font]));
}
