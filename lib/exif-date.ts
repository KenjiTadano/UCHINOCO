const JPEG_START = 0xffd8;
const APP1_MARKER = 0xe1;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const TAG_MODIFY_DATE = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_CREATE_DATE = 0x9004;
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSION_PATTERN = /\.(heic|heif)$/i;
const JPEG_QUALITY = 0.88;

type Endian = boolean;

function exifLocalDateTime(value: string) {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):\d{2}$/.exec(
    value.trim(),
  );
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ),
  );
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute)
  ) {
    return null;
  }

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function readExifDate(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== JPEG_START) return null;

  let cursor = 2;
  while (cursor + 4 <= view.byteLength) {
    if (view.getUint8(cursor) !== 0xff) return null;
    const marker = view.getUint8(cursor + 1);
    cursor += 2;
    if (marker === 0xd9 || marker === 0xda) return null;

    const segmentLength = view.getUint16(cursor);
    if (segmentLength < 2 || cursor + segmentLength > view.byteLength) {
      return null;
    }
    const segmentStart = cursor + 2;
    if (
      marker === APP1_MARKER &&
      EXIF_HEADER.every(
        (byte, index) =>
          segmentStart + index < view.byteLength &&
          view.getUint8(segmentStart + index) === byte,
      )
    ) {
      return readTiffDate(view, segmentStart + EXIF_HEADER.length);
    }
    cursor += segmentLength;
  }
  return null;
}

function readTiffDate(view: DataView, tiffStart: number) {
  if (tiffStart + 8 > view.byteLength) return null;
  const byteOrder = view.getUint16(tiffStart);
  const littleEndian: Endian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null;

  const inBounds = (offset: number, length: number) =>
    offset >= 0 && length >= 0 && tiffStart + offset + length <= view.byteLength;
  const uint16 = (offset: number) =>
    inBounds(offset, 2)
      ? view.getUint16(tiffStart + offset, littleEndian)
      : null;
  const uint32 = (offset: number) =>
    inBounds(offset, 4)
      ? view.getUint32(tiffStart + offset, littleEndian)
      : null;
  const ascii = (entryOffset: number) => {
    const type = uint16(entryOffset + 2);
    const count = uint32(entryOffset + 4);
    if (type !== 2 || count === null || count < 2 || count > 64) return null;
    const valueOffset =
      count <= 4 ? entryOffset + 8 : uint32(entryOffset + 8);
    if (valueOffset === null || !inBounds(valueOffset, count)) return null;

    let value = "";
    for (let index = 0; index < count; index += 1) {
      const byte = view.getUint8(tiffStart + valueOffset + index);
      if (byte === 0) break;
      value += String.fromCharCode(byte);
    }
    return value;
  };
  const entries = (ifdOffset: number) => {
    const count = uint16(ifdOffset);
    if (count === null || count > 512 || !inBounds(ifdOffset + 2, count * 12)) {
      return [];
    }
    return Array.from({ length: count }, (_, index) => ifdOffset + 2 + index * 12);
  };

  const firstIfdOffset = uint32(4);
  if (firstIfdOffset === null) return null;
  const firstEntries = entries(firstIfdOffset);
  const modifyDateEntry = firstEntries.find(
    (offset) => uint16(offset) === TAG_MODIFY_DATE,
  );
  const exifPointerEntry = firstEntries.find(
    (offset) => uint16(offset) === TAG_EXIF_IFD,
  );
  const exifIfdOffset = exifPointerEntry
    ? uint32(exifPointerEntry + 8)
    : null;
  const exifEntries = exifIfdOffset === null ? [] : entries(exifIfdOffset);
  const originalEntry = exifEntries.find(
    (offset) => uint16(offset) === TAG_DATE_TIME_ORIGINAL,
  );
  const createEntry = exifEntries.find(
    (offset) => uint16(offset) === TAG_CREATE_DATE,
  );

  for (const entry of [originalEntry, createEntry, modifyDateEntry]) {
    if (!entry) continue;
    const parsed = exifLocalDateTime(ascii(entry) ?? "");
    if (parsed) return parsed;
  }
  return null;
}

export async function extractExifDateTime(file: File) {
  if (file.type !== "image/jpeg") return null;
  try {
    return readExifDate(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export function isHeicCandidate(file: File) {
  return (
    HEIC_MIME_TYPES.has(file.type.toLowerCase()) ||
    HEIC_EXTENSION_PATTERN.test(file.name)
  );
}

async function hasJpegSignature(blob: Blob) {
  if (blob.size < 3) return false;
  const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function convertHeicToJpeg(file: File, maxSize: number) {
  const { heicTo, isHeic } = await import("heic-to/next");
  if (!(await isHeic(file))) return null;

  const jpeg = await heicTo({
    blob: file,
    type: "image/jpeg",
    quality: JPEG_QUALITY,
  });
  if (
    jpeg.type !== "image/jpeg" ||
    jpeg.size <= 0 ||
    jpeg.size > maxSize ||
    !(await hasJpegSignature(jpeg))
  ) {
    return null;
  }

  const baseName = file.name.replace(HEIC_EXTENSION_PATTERN, "");
  return new File([jpeg], `${baseName || "photo"}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
