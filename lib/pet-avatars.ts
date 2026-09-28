type SignedUrlItem = {
  path?: string | null;
  signedUrl?: string | null;
  signedURL?: string | null;
  error?: string | null;
};

/** Map storage paths → signed URLs; fall back to request order if `path` is missing. */
export function toAvatarSignedUrlMap(
  paths: string[],
  items: SignedUrlItem[],
) {
  const map = new Map<string, string>();
  items.forEach((item, index) => {
    const url = item.signedUrl ?? item.signedURL ?? null;
    if (!url || item.error) return;
    const key = item.path ?? paths[index];
    if (!key) return;
    map.set(key, url);
  });
  return map;
}
