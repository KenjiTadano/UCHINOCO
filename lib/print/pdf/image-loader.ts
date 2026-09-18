/**
 * Image loading abstraction for PDF generation.
 * No "server-only" — interface + mock are testable directly.
 * Real Supabase Storage loader lives in a separate server-only module (Task047-5).
 */

export interface PrintImageLoader {
  /** Load image bytes from a storage path. Returns null if not found. */
  load(path: string): Promise<Uint8Array | null>;
}

/**
 * MockImageLoader — no external calls.
 * Provide a Map<path, bytes> to return specific images in tests.
 */
export class MockImageLoader implements PrintImageLoader {
  private readonly images: Map<string, Uint8Array>;

  constructor(images: Map<string, Uint8Array> = new Map()) {
    this.images = images;
  }

  async load(path: string): Promise<Uint8Array | null> {
    return this.images.get(path) ?? null;
  }
}
