/**
 * Print generation error hierarchy.
 * No "server-only" — testable directly.
 * Separate from PrintProviderError (provider API concerns vs. PDF generation).
 */

export class PrintGenerationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PrintGenerationError";
    this.code = code;
  }
}

export class ImageLoadError extends PrintGenerationError {
  constructor(path: string) {
    super("IMAGE_LOAD_FAILED", `Failed to load image: ${path}`);
    this.name = "ImageLoadError";
  }
}

export class InvalidImageError extends PrintGenerationError {
  constructor(path: string, reason: string) {
    super("INVALID_IMAGE", `Invalid image at '${path}': ${reason}`);
    this.name = "InvalidImageError";
  }
}

export class PhotoCountExceededError extends PrintGenerationError {
  constructor(photoCount: number, pageCount: number) {
    super(
      "PHOTO_COUNT_EXCEEDED",
      `Photo count (${photoCount}) exceeds page count (${pageCount})`,
    );
    this.name = "PhotoCountExceededError";
  }
}

export class PdfGenerationError extends PrintGenerationError {
  constructor(message: string) {
    super("PDF_GENERATION_FAILED", message);
    this.name = "PdfGenerationError";
  }
}
