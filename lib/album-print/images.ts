export type RasterProbe = {
  kind: "jpeg" | "png";
  width: number;
  height: number;
  orientation: number;
};

function u16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function exifOrientation(bytes: Uint8Array, start: number, length: number) {
  const tiff = start + 6;
  if (tiff + 8 >= bytes.length) return 1;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const read16 = (offset: number) => {
    const i = tiff + offset;
    if (i + 1 >= bytes.length) return 0;
    return little ? bytes[i] | (bytes[i + 1] << 8) : u16(bytes, i);
  };
  const read32 = (offset: number) => {
    const i = tiff + offset;
    if (i + 3 >= bytes.length) return 0;
    return little
      ? bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
      : u32(bytes, i);
  };
  if (read16(0) !== (little ? 0x4949 : 0x4d4d) && bytes[tiff] !== 0x4d && bytes[tiff] !== 0x49) return 1;
  const ifd = read32(4);
  const count = read16(ifd);
  for (let entry = 0; entry < count; entry += 1) {
    const at = ifd + 2 + entry * 12;
    if (tiff + at + 8 >= start + length) break;
    if (read16(at) !== 0x0112) continue;
    const value = read16(at + 8);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

export function probeRaster(bytes: Uint8Array | null | undefined): RasterProbe | null {
  if (!bytes || bytes.length < 24) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { kind: "png", width: u32(bytes, 16), height: u32(bytes, 20), orientation: 1 };
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const size = u16(bytes, offset + 2);
    if (size < 2 || offset + 2 + size > bytes.length) break;
    if (marker === 0xe1 && size > 8) {
      const header = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (header === "Exif") orientation = exifOrientation(bytes, offset + 4, size);
    }
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      height = u16(bytes, offset + 5);
      width = u16(bytes, offset + 7);
    }
    offset += 2 + size;
    if (width > 0 && marker === 0xda) break;
  }
  if (width < 1 || height < 1) return null;
  return { kind: "jpeg", width, height, orientation };
}

/** storage_path of the original. Thumbnail objects are not a print source. */
export function acceptOriginalPath(path: string | null | undefined) {
  if (!path) return null;
  const normalized = path.toLowerCase();
  if (normalized.includes("thumbnail") || normalized.includes("/thumb")) return null;
  return path;
}
