import { supabase } from "@/integrations/supabase/client";

const BUCKET = "merchant-logos";
const CACHE_NAME = "merchant-logos-v1";

/**
 * Sanitizes a store name into a safe filename for the Supabase bucket.
 * e.g. "YouTube Premium" → "youtube-premium.png"
 *      "McDonald's"     → "mcdonalds.png"
 */
export function sanitizeStoreName(store: string): string {
  return (
    store
      .trim()
      .toLowerCase()
      .replace(/['''`]/g, "")  // strip apostrophes/quotes before hyphenating
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  ) + ".png";
}

/**
 * Checks if a logo exists in the browser's Cache Storage.
 * Returns a blob URL string if found, null otherwise.
 * The caller is responsible for calling URL.revokeObjectURL on the returned URL.
 */
export async function getLogoFromLocalCache(store: string): Promise<string | null> {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const filename = sanitizeStoreName(store);
    const response = await cache.match(`/${filename}`);
    if (response) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
  } catch {
    // ignore cache errors silently
  }
  return null;
}

/**
 * Saves a logo blob to the browser's Cache Storage.
 */
export async function saveLogoToLocalCache(store: string, blob: Blob): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const filename = sanitizeStoreName(store);
    await cache.put(
      `/${filename}`,
      new Response(blob, { headers: { "Content-Type": blob.type || "image/png" } }),
    );
  } catch {
    // ignore cache errors silently
  }
}

/**
 * Returns the public URL for a logo in Supabase Storage if the file exists,
 * or null if it does not.
 */
export async function getLogoFromSupabase(store: string): Promise<string | null> {
  const filename = sanitizeStoreName(store);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  if (!data?.publicUrl) return null;
  try {
    const resp = await fetch(data.publicUrl, { method: "HEAD" });
    if (resp.ok) return data.publicUrl;
  } catch {
    // network error – treat as not found
  }
  return null;
}

/**
 * Downloads an image from the given URL as a Blob, uploads it to the
 * merchant-logos Supabase Storage bucket, caches it locally, and returns
 * the public URL. Returns null on failure.
 */
export async function uploadLogoToSupabase(
  store: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    const filename = sanitizeStoreName(store);
    const contentType = blob.type || "image/png";
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, blob, { contentType, upsert: true });
    if (error) {
      console.warn("[MerchantLogo] Supabase upload error:", error.message);
      return null;
    }
    // Save to local cache after successful upload
    await saveLogoToLocalCache(store, blob);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.warn("[MerchantLogo] Upload failed:", err);
    return null;
  }
}

/**
 * Updates the merchant_logo_url field on all lancamentos rows that share
 * the given store name (loja).
 */
export async function saveMerchantLogoUrl(
  store: string,
  logoUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from("lancamentos")
    .update({ merchant_logo_url: logoUrl })
    .eq("loja", store);
  if (error) {
    console.warn("[MerchantLogo] DB update error:", error.message);
  }
}
