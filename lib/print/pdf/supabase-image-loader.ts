import "server-only";

import { createAdminClient } from "@/lib/supabase/admin.ts";
import type { PrintImageLoader } from "./image-loader.ts";
import { ImageLoadError } from "./errors.ts";

/**
 * Loads images from the private pet-photos Supabase Storage bucket.
 * Uses service-role admin client — no signed URLs, no client exposure.
 * Paths are not logged.
 */
export class SupabaseImageLoader implements PrintImageLoader {
  async load(path: string): Promise<Uint8Array | null> {
    const client = createAdminClient();
    const { data, error } = await client.storage.from("pet-photos").download(path);
    if (error || !data) {
      throw new ImageLoadError(path);
    }
    return new Uint8Array(await data.arrayBuffer());
  }
}
