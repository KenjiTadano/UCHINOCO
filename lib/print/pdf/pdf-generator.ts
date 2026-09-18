/**
 * PDF generation service — provider-independent.
 * No "server-only": pdf-lib is pure JS with no secrets; tests import this directly.
 * Never log image bytes, generated PDF bytes, or storage paths.
 *
 * v1 limitations:
 *   - 1 photo per content page (blank pages fill remainder)
 *   - Japanese title text skipped (no font embedded; avoids garbled output)
 *   - bleedMm defaults to 0 (Provider specs unconfirmed)
 */

import { PDFDocument } from "pdf-lib";
import type {
  PrintDocumentSpec,
  PrintGenerationResult,
  DpiWarning,
} from "../document-types.ts";
import type { PrintImageLoader } from "./image-loader.ts";
import {
  mmToPoints,
  estimateDpi,
  DPI_WARNING_THRESHOLD,
} from "../layout/units.ts";
import {
  calculateContainRect,
  calculateCoverRect,
} from "../layout/fit.ts";
import {
  PhotoCountExceededError,
  ImageLoadError,
  InvalidImageError,
  PdfGenerationError,
} from "./errors.ts";

export type PdfGenerationOptions = {
  loader: PrintImageLoader;
};

export type PdfGenerationOutput = {
  result: PrintGenerationResult;
  warnings: DpiWarning[];
};

export async function generatePrintPdfs(
  spec: PrintDocumentSpec,
  options: PdfGenerationOptions,
): Promise<PdfGenerationOutput> {
  const warnings: DpiWarning[] = [];

  // Defense-in-depth: reject if photo count exceeds declared page count
  const photoCount = spec.pages.filter((p) => p.item?.imagePath).length;
  if (photoCount > spec.totalPageCount) {
    throw new PhotoCountExceededError(photoCount, spec.totalPageCount);
  }

  const pageWidthPt  = mmToPoints(spec.printWidthMm  + spec.bleedMm * 2);
  const pageHeightPt = mmToPoints(spec.printHeightMm + spec.bleedMm * 2);

  // ── Cover PDF ─────────────────────────────────────────────────────────────
  const coverPdf  = await PDFDocument.create();
  const coverPage = coverPdf.addPage([pageWidthPt, pageHeightPt]);

  if (spec.cover.imagePath) {
    const bytes = await options.loader.load(spec.cover.imagePath);
    if (bytes) {
      try {
        const img = await embedImage(coverPdf, bytes, spec.cover.imagePath);
        const fit = calculateCoverRect(img.width, img.height, pageWidthPt, pageHeightPt);
        coverPage.drawImage(img, { x: fit.x, y: fit.y, width: fit.width, height: fit.height });

        const dpi = estimateDpi(
          Math.max(img.width, img.height),
          Math.max(spec.printWidthMm, spec.printHeightMm),
        );
        if (dpi < DPI_WARNING_THRESHOLD) {
          warnings.push({
            photoId: null,
            imagePath: spec.cover.imagePath,
            estimatedDpi: dpi,
            threshold: DPI_WARNING_THRESHOLD,
          });
        }
      } catch (e) {
        if (e instanceof InvalidImageError) throw e;
        throw new PdfGenerationError(`Cover image failed: ${(e as Error).message}`);
      }
    }
  }
  // v1: title text omitted — Japanese font not embedded, no garbled output

  const coverBytes = await coverPdf.save();

  // ── Content PDF ───────────────────────────────────────────────────────────
  const contentPdf = await PDFDocument.create();

  for (const page of spec.pages) {
    const pdfPage = contentPdf.addPage([pageWidthPt, pageHeightPt]);

    if (page.item?.imagePath) {
      const bytes = await options.loader.load(page.item.imagePath);
      if (!bytes) throw new ImageLoadError(page.item.imagePath);

      try {
        const img = await embedImage(contentPdf, bytes, page.item.imagePath);
        // Apply margin for no-bleed products; full-bleed uses no margin
        const marginPt = mmToPoints(spec.bleedMm > 0 ? 0 : 8);
        const drawW = pageWidthPt  - marginPt * 2;
        const drawH = pageHeightPt - marginPt * 2;
        const fit   = calculateContainRect(img.width, img.height, drawW, drawH);
        pdfPage.drawImage(img, {
          x: marginPt + fit.x,
          y: marginPt + fit.y,
          width:  fit.width,
          height: fit.height,
        });

        const dpi = estimateDpi(
          Math.max(img.width, img.height),
          Math.max(spec.printWidthMm, spec.printHeightMm),
        );
        if (dpi < DPI_WARNING_THRESHOLD) {
          warnings.push({
            photoId: page.item.photoId,
            imagePath: page.item.imagePath,
            estimatedDpi: dpi,
            threshold: DPI_WARNING_THRESHOLD,
          });
        }
      } catch (e) {
        if (e instanceof InvalidImageError || e instanceof ImageLoadError) throw e;
        throw new PdfGenerationError(`Page ${page.pageNumber} image failed: ${(e as Error).message}`);
      }
    }
    // Blank pages render as white — no drawing needed
  }

  const contentBytes = await contentPdf.save();

  return {
    result: {
      cover: {
        type: "cover",
        filename: `orders/${spec.orderId}/cover.pdf`,
        mimeType: "application/pdf",
        bytes: coverBytes,
        pageCount: 1,
      },
      content: {
        type: "content",
        filename: `orders/${spec.orderId}/content.pdf`,
        mimeType: "application/pdf",
        bytes: contentBytes,
        pageCount: spec.pages.length,
      },
    },
    warnings,
  };
}

/** Embeds a JPEG or PNG buffer into a PDFDocument. Throws InvalidImageError for other formats. */
async function embedImage(doc: PDFDocument, bytes: Uint8Array, path: string) {
  // JPEG magic: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return doc.embedJpg(bytes);
  }
  // PNG magic: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return doc.embedPng(bytes);
  }
  throw new InvalidImageError(path, "only JPEG and PNG are supported");
}
