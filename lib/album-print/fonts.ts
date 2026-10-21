import { observeIo } from "../server-io-observer.ts";
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

/** Build-shipped font bytes only; never holds request, auth or album data. */
export function createFontAssetReader(read: (file: string) => Promise<Uint8Array>) {
  const files = new Map<string, Promise<Uint8Array>>();
  return async (file: string, observer?: object): Promise<Uint8Array | null> => {
    let pending = files.get(file);
    observeIo(observer, pending ? "font.cache.hit" : "font.cache.miss");
    if (!pending) {
      const start = performance.now();
      pending = Promise.resolve().then(() => read(file)).then(bytes => { observeIo(observer, "font.file.read", 1, performance.now() - start); return bytes; }, error => { observeIo(observer, "font.file.error", 1, performance.now() - start); throw error; });
      files.set(file, pending);
    }
    try { return new Uint8Array(await pending); }
    catch { if (files.get(file) === pending) files.delete(file); return null; }
  };
}
const readFontAsset = createFontAssetReader(file => readFile(path.join(FONT_DIR, file)));

export async function loadPrintFont(styleId: TextStyleId, observer?: object): Promise<ResolvedPrintFont> {
  const plan = fontPlan(styleId);
  return { ...plan, bytes: await readFontAsset(plan.file, observer) };
}

export async function loadPrintFonts(styleIds: TextStyleId[]) {
  const unique = [...new Set(styleIds)];
  const loaded = await Promise.all(unique.map((styleId) => loadPrintFont(styleId)));
  return new Map(loaded.map((font) => [font.styleId, font]));
}
