import { useState, useEffect, useRef } from "react";
import { searchBrandfetchDomain } from "@/lib/brandfetch";
import {
  getLogoFromLocalCache,
  getLogoFromSupabase,
  saveLogoToLocalCache,
  uploadLogoToSupabase,
  saveMerchantLogoUrl,
} from "@/lib/merchantLogo";

interface BrandLogoProps {
  store: string;
  /** Icon shown when no logo is available. If omitted the component renders nothing on failure. */
  fallbackIcon?: React.ReactNode;
  /** Background colour for the fallback container. */
  fallbackBg?: string;
  /** Size in pixels (width = height). Defaults to 28 (7 × 4 px). */
  size?: number;
  /** Pre-resolved logo URL. When provided the component renders it immediately without any cache or API lookup. */
  initialUrl?: string | null;
  /** Called whenever a logo URL is resolved (including via initialUrl). Useful for the parent to persist the URL. */
  onLogoResolved?: (url: string | null) => void;
}

/**
 * BrandLogo: shows a brand logo for a store/company name.
 *
 * Resolution priority (offline-first):
 *   1. Browser Cache Storage (no network)
 *   2. Supabase Storage public URL (one HEAD request)
 *   3. External APIs: Brandfetch CDN / Clearbit → Google Favicon
 *   4. fallbackIcon (category icon) or nothing
 *
 * When a logo is resolved via an external API it is uploaded to Supabase
 * Storage, saved to local Cache Storage, and the merchant_logo_url field is
 * updated for all matching lancamentos rows — all in the background so the
 * UI is not blocked.
 */
const BrandLogo = ({ store, fallbackIcon, fallbackBg, size = 28, initialUrl, onLogoResolved }: BrandLogoProps) => {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!!store);
  // Track any blob URL we created so we can revoke it on cleanup.
  const blobUrlRef = useRef<string | null>(null);
  // Set to true when logoSrc comes from an external API (not local cache or Supabase).
  // Only external-sourced URLs should trigger the background upload to Supabase.
  const isExternalUrlRef = useRef(false);

  const getClientId = () => {
    const rawClientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID;
    return rawClientId ? String(rawClientId).replace(/[^a-zA-Z0-9-]/g, "") : null;
  };

  useEffect(() => {
    // Revoke any previous blob URL before starting a new resolution.
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!store) {
      setLogoSrc(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    setFailed(false);
    setLogoSrc(null);
    setLoading(true);

    // ── Fast path: use a pre-resolved URL supplied by the parent ─────────────
    if (initialUrl) {
      isExternalUrlRef.current = false;
      setLogoSrc(initialUrl);
      setLoading(false);
      onLogoResolved?.(initialUrl);
      return;
    }

    let cancelled = false;

    (async () => {
      // ── Step 1: Browser Cache Storage (offline-first, no network) ──────────
      const cached = await getLogoFromLocalCache(store);
      if (cancelled) return;
      if (cached) {
        blobUrlRef.current = cached;
        isExternalUrlRef.current = false;
        setLogoSrc(cached);
        setLoading(false);
        onLogoResolved?.(cached);
        return;
      }

      // ── Step 2: Supabase Storage public URL ────────────────────────────────
      const supabaseUrl = await getLogoFromSupabase(store);
      if (cancelled) return;
      if (supabaseUrl) {
        // Cache locally in the background for future offline access.
        fetch(supabaseUrl)
          .then((r) => r.blob())
          .then((b) => saveLogoToLocalCache(store, b))
          .catch((err) => console.warn("[MerchantLogo] Local cache write failed:", err));
        isExternalUrlRef.current = false;
        setLogoSrc(supabaseUrl);
        setLoading(false);
        onLogoResolved?.(supabaseUrl);
        return;
      }

      // ── Step 3: External APIs ──────────────────────────────────────────────
      // Use Brandfetch Search to resolve the real domain first.
      const domain = await searchBrandfetchDomain(store);
      if (cancelled) return;

      const clientId = getClientId();
      let externalUrl: string;
      if (domain) {
        externalUrl = clientId
          ? `https://cdn.brandfetch.io/${domain}/w/56/h/56?c=${clientId}`
          : `https://logo.clearbit.com/${domain}`;
      } else {
        // Brandfetch found no domain; fall back to Google Favicon directly.
        externalUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(store)}&sz=128`;
      }

      isExternalUrlRef.current = true;
      setLogoSrc(externalUrl);
      setLoading(false);
      onLogoResolved?.(externalUrl);
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [store, initialUrl, onLogoResolved]);

  const handleImageLoad = () => {
    // Only upload to Supabase when the logo was resolved via an external API.
    // Logos already served from Supabase or the local cache skip this step.
    if (!logoSrc || !isExternalUrlRef.current) return;
    uploadLogoToSupabase(store, logoSrc).then((publicUrl) => {
      if (publicUrl) saveMerchantLogoUrl(store, publicUrl);
    });
  };

  const handleError = () => {
    // All external URLs have been exhausted — show the category icon fallback.
    setFailed(true);
  };

  const style = { width: size, height: size };

  if (loading) {
    return (
      <div
        className="rounded-md flex-shrink-0 bg-muted animate-pulse"
        style={style}
      />
    );
  }

  if (failed || !logoSrc) {
    if (!fallbackIcon) return null;
    return (
      <div
        className="flex items-center justify-center rounded-md flex-shrink-0"
        style={{ ...style, backgroundColor: fallbackBg }}
      >
        {fallbackIcon}
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-md flex-shrink-0 overflow-hidden bg-white"
      style={style}
    >
      <img
        src={logoSrc}
        alt={store}
        className="h-full w-full object-contain"
        onLoad={handleImageLoad}
        onError={handleError}
      />
    </div>
  );
};

export default BrandLogo;

