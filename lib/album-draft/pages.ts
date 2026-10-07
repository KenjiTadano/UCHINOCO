import { ALBUM_DRAFT_CONFIG } from "./config.ts";
import type { BookPrintMetrics, FramePlacement } from "./types.ts";
import type { AlbumFrameDefinition } from "../smart-layout/types.ts";

type PageBox = { x: number; y: number; w: number; h: number };

const book = ALBUM_DRAFT_CONFIG.book;

export function bookPrintMetrics(): BookPrintMetrics {
  const gutterX = book.left.x + book.left.w;
  return {
    canvas: book.canvas,
    bleed: book.bleed,
    gutter: { x: gutterX, width: book.right.x - gutterX },
    safeArea: {
      left: contentBox("left"),
      right: contentBox("right"),
    },
  };
}

export function contentBox(side: "left" | "right"): PageBox {
  const page = side === "left" ? book.left : book.right;
  const trim = book.trim;
  const gutter = book.gutterInset;
  if (side === "left") {
    return {
      x: page.x + trim,
      y: page.y + trim,
      w: page.w - trim - gutter,
      h: page.h - trim * 2,
    };
  }
  return {
    x: page.x + gutter,
    y: page.y + trim,
    w: page.w - trim - gutter,
    h: page.h - trim * 2,
  };
}

function toPlacement(side: "left" | "right", rect: { x: number; y: number; w: number; h: number }): FramePlacement {
  const gutterStart = book.left.x + book.left.w;
  const gutterEnd = book.right.x;
  const clearance = side === "left" ? gutterStart - (rect.x + rect.w) : rect.x - gutterEnd;
  return {
    side,
    rect,
    norm: {
      x: rect.x / book.canvas.width,
      y: rect.y / book.canvas.height,
      w: rect.w / book.canvas.width,
      h: rect.h / book.canvas.height,
    },
    gutterClearance: Math.round(clearance),
    crossesGutter: rect.x < gutterEnd && rect.x + rect.w > gutterStart,
  };
}

function containInPage(side: "left" | "right", aspect: number): { x: number; y: number; w: number; h: number } {
  const box = contentBox(side);
  let w = box.w;
  let h = w / Math.max(aspect, 0.2);
  if (h > box.h) {
    h = box.h;
    w = h * aspect;
  }
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

function sidesFor(frames: AlbumFrameDefinition[]): Array<"left" | "right"> {
  const sides = frames.map((frame) => (frame.rect.x + frame.rect.w / 2 < 0.5 ? "left" : "right")) as Array<"left" | "right">;
  if (frames.length >= 2 && sides.every((side) => side === sides[0])) {
    const order = frames.map((frame, index) => ({ index, x: frame.rect.x, y: frame.rect.y })).sort((a, b) => a.x - b.x || a.y - b.y);
    const mid = Math.ceil(order.length / 2);
    const next: Array<"left" | "right"> = frames.map(() => "left");
    order.forEach((item, rank) => {
      next[item.index] = rank < mid ? "left" : "right";
    });
    return next;
  }
  return sides;
}

function packSide(side: "left" | "right", frames: AlbumFrameDefinition[], maxArea: number) {
  const box = contentBox(side);
  const sorted = [...frames].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const gap = sorted.length > 1 ? 12 : 0;
  const sized = sorted.map((frame) => {
    const aspect = frame.rect.w / Math.max(frame.rect.h, 0.05);
    let w = box.w;
    let h = w / aspect;
    if (h > box.h) {
      h = box.h;
      w = h * aspect;
    }
    const scale = Math.sqrt((frame.rect.w * frame.rect.h) / Math.max(maxArea, 0.001));
    return { frame, w: w * scale, h: h * scale };
  });
  const stack = sized.reduce((sum, item) => sum + item.h, 0) + gap * Math.max(sized.length - 1, 0);
  const fit = stack > box.h ? box.h / stack : 1;
  let y = box.y + Math.max(0, (box.h - stack * fit) / 2);
  const placed = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const item of sized) {
    const w = item.w * fit;
    const h = item.h * fit;
    placed.set(item.frame.id, {
      x: box.x + (box.w - w) / 2,
      y,
      w,
      h,
    });
    y += h + gap;
  }
  return placed;
}

/**
 * Map a single-canvas layout onto the blank spread's left and right pages.
 * Frames stay inside one page so the spine does not cut a face.
 */
export function placeFrames(frames: AlbumFrameDefinition[], focalXByFrameId: Map<string, number>): FramePlacement[] {
  if (frames.length === 1) {
    const frame = frames[0];
    const focal = focalXByFrameId.get(frame.id) ?? 0.5;
    const side: "left" | "right" = focal >= 0.5 ? "right" : "left";
    const aspect = frame.rect.w / Math.max(frame.rect.h, 0.05);
    return [toPlacement(side, containInPage(side, aspect))];
  }

  const sides = sidesFor(frames);
  const maxArea = Math.max(...frames.map((frame) => frame.rect.w * frame.rect.h), 0.001);
  const left = frames.filter((_, index) => sides[index] === "left");
  const right = frames.filter((_, index) => sides[index] === "right");
  const packed = new Map([...packSide("left", left, maxArea), ...packSide("right", right, maxArea)]);
  return frames.map((frame, index) => {
    const rect = packed.get(frame.id) ?? containInPage(sides[index], 1);
    return toPlacement(sides[index], rect);
  });
}

export function pageArea(side: "left" | "right") {
  const page = side === "left" ? book.left : book.right;
  return page.w * page.h;
}

export function digitalSpreadGeometry() {
  const startX = Math.min(book.left.x, book.right.x);
  const startY = Math.min(book.left.y, book.right.y);
  const endX = Math.max(book.left.x + book.left.w, book.right.x + book.right.w);
  const endY = Math.max(book.left.y + book.left.h, book.right.y + book.right.h);
  const width = endX - startX;
  const height = endY - startY;
  const normalizePage = (page: PageBox) => ({
    x: (page.x - startX) / width,
    y: (page.y - startY) / height,
    w: page.w / width,
    h: page.h / height,
  });

  return {
    width,
    height,
    aspectRatio: width / height,
    leftPage: normalizePage(book.left),
    rightPage: normalizePage(book.right),
    origin: { x: startX, y: startY },
  };
}

export function digitalFrameRect(rect: FramePlacement["rect"]) {
  const geometry = digitalSpreadGeometry();
  return {
    x: (rect.x - geometry.origin.x) / geometry.width,
    y: (rect.y - geometry.origin.y) / geometry.height,
    w: rect.w / geometry.width,
    h: rect.h / geometry.height,
  };
}

export function digitalNormalizedRect(rect: PageBox) {
  return digitalFrameRect({
    x: rect.x * book.canvas.width,
    y: rect.y * book.canvas.height,
    w: rect.w * book.canvas.width,
    h: rect.h * book.canvas.height,
  });
}
