/**
 * Read width/height from JPEG / PNG / WEBP headers (no sharp dependency).
 */
export function readImageDimensions(
  bytes: Uint8Array,
  mimeType: string,
): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    if (bytes.length < 24) return null;
    const width =
      (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height =
      (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  if (mimeType === "image/jpeg") {
    let i = 2;
    while (i < bytes.length - 8) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) break;
      // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6];
        const width = (bytes[i + 7] << 8) | bytes[i + 8];
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      i += 2 + len;
    }
    return null;
  }

  if (mimeType === "image/webp") {
    // VP8X or VP8
    if (bytes.length < 30) return null;
    const fourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (fourCC === "VP8X" && bytes.length >= 30) {
      const width =
        1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height =
        1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      if (width > 0 && height > 0) return { width, height };
    }
    if (fourCC === "VP8 " && bytes.length >= 30) {
      // lossy bitstream start may vary; basic parse
      const width = bytes[26] | ((bytes[27] & 0x3f) << 8);
      const height = bytes[28] | ((bytes[29] & 0x3f) << 8);
      if (width > 0 && height > 0) return { width, height };
    }
  }

  return null;
}
