import { useState, useEffect, useRef } from "react";
import { searchBrandfetchDomain } from "@/lib/brandfetch";
import {
  getLogoFromLocalCache,
  getLogoFromSupabase,
  getMerchantLogoById,
  saveLogoToLocalCache,
  uploadLogoToSupabase,
  saveMerchantLogoUrl,
  findOrCreateMerchant,
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
  /** Merchant ID from the merchants table. When provided, the logo is looked up directly from the DB. */
  merchantId?: string | null;
  /** Called whenever a logo URL is resolved (including via initialUrl). Useful for the parent to persist the URL. */
  onLogoResolved?: (url: string | null) => void;
  /** Called when a merchant record is resolved/created in the merchants table, providing the merchant ID. */
  onMerchantResolved?: (merchantId: string) => void;
}

/**
 * BrandLogo: shows a brand logo for a store/company name.
 *
 * Resolution priority (offline-first):
 *   1. Pre-resolved initialUrl from parent (skips all lookups)
 *   2. Merchants table lookup by merchantId (fast DB row read)
 *   3. Browser Cache Storage (no network)
 *   4. Supabase Storage public URL (one HEAD request)
 *   5. External APIs: Brandfetch CDN / Clearbit → Google Favicon
 *   6. fallbackIcon (category icon) or nothing
 *
 * When a logo is resolved via an external API it is uploaded to Supabase
 * Storage, a merchants table record is created/updated, the merchant_logo_url
 * field is updated for all matching lancamentos rows — all in the background.
 */
const BrandLogo = ({ store, fallbackIcon, fallbackBg, size = 28, initialUrl, merchantId, onLogoResolved, onMerchantResolved }: BrandLogoProps) => {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!!store);
  const candidateUrlsRef = useRef<string[]>([]);
  const currentCandidateIndexRef = useRef(0);
  // Track any blob URL we created so we can revoke it on cleanup.
  const blobUrlRef = useRef<string | null>(null);
  // Set to true when logoSrc comes from an external API (not local cache or Supabase).
  // Only external-sourced URLs should trigger the background upload to Supabase.
  const isExternalUrlRef = useRef(false);
  // Keep onLogoResolved in a ref so the main useEffect does not need it as a
  // dependency.  This prevents the effect from re-running when the parent
  // re-renders and passes a new (but functionally identical) callback reference.
  const onLogoResolvedRef = useRef(onLogoResolved);
  // Update the ref on every render so the effect always sees the latest value.
  onLogoResolvedRef.current = onLogoResolved;
  const onMerchantResolvedRef = useRef(onMerchantResolved);
  onMerchantResolvedRef.current = onMerchantResolved;

  const getClientId = () => {
    const rawClientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID;
    return rawClientId ? String(rawClientId).replace(/[^a-zA-Z0-9-]/g, "") : null;
  };

  const getPreferredFoodDomain = (storeName: string): string | null => {
    const normalized = storeName.trim().toLowerCase();
    const rules: Array<{ pattern: RegExp; domain: string }> = [
      // Banks and fintechs commonly used in Brazil
      { pattern: /\bnubank\b|\bnu\b/, domain: "nubank.com.br" },
      { pattern: /\bcaixa\b|\bcaixa economica\b/, domain: "caixa.gov.br" },
      { pattern: /\bsantander\b/, domain: "santander.com.br" },
      { pattern: /\bbradesco\b/, domain: "bradesco.com.br" },
      { pattern: /\bitau\b|\bita[uú]\b/, domain: "itau.com.br" },
      { pattern: /\bbanco do brasil\b|\bbb\b/, domain: "bb.com.br" },
      { pattern: /\binter\b/, domain: "bancointer.com.br" },
      { pattern: /\bpicpay\b/, domain: "picpay.com" },
      { pattern: /\bmercado pago\b|\bmercadopago\b/, domain: "mercadopago.com.br" },
      { pattern: /\bpagbank\b|\bpagseguro\b/, domain: "pagbank.com.br" },

      // Food, delivery and regional apps
      { pattern: /\bifood\b/, domain: "ifood.com.br" },
      { pattern: /\b99\s*food\b|\b99food\b|\b99\s*entrega\b/, domain: "99app.com" },
      { pattern: /\buber\s*eats\b|\bubereats\b/, domain: "ubereats.com" },
      { pattern: /\brappi\b/, domain: "rappi.com.br" },
      { pattern: /\baiqfome\b/, domain: "aiqfome.com" },
      { pattern: /\bjames\s*delivery\b|\bjames\b/, domain: "jamesdelivery.com.br" },
      { pattern: /\banota\s*ai\b|\banotai\b/, domain: "anota.ai" },
      { pattern: /\bze\s*delivery\b|\bz[eé]\s*delivery\b/, domain: "zedelivery.com.br" },
    ];
    const match = rules.find((rule) => rule.pattern.test(normalized));
    return match?.domain ?? null;
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
    candidateUrlsRef.current = [];
    currentCandidateIndexRef.current = 0;

    // ── Fast path: use a pre-resolved URL supplied by the parent ─────────────
    // Blob URLs are session-specific and become invalid after a page refresh.
    // If the stored initialUrl is a stale blob (written by a previous bug),
    // skip the fast path so the logo is re-fetched through the normal pipeline.
    if (initialUrl && !initialUrl.startsWith("blob:")) {
      isExternalUrlRef.current = false;
      setLogoSrc(initialUrl);
      setLoading(false);
      onLogoResolvedRef.current?.(initialUrl);
      return;
    }

    let cancelled = false;

    (async () => {
      // ── Step 1: Merchants table lookup by merchantId ───────────────────────
      if (merchantId) {
        const dbLogoUrl = await getMerchantLogoById(merchantId);
        if (cancelled) return;
        if (dbLogoUrl) {
          isExternalUrlRef.current = false;
          setLogoSrc(dbLogoUrl);
          setLoading(false);
          onLogoResolvedRef.current?.(dbLogoUrl);
          return;
        }
      }

      // ── Step 2: Browser Cache Storage (offline-first, no network) ──────────
      const cached = await getLogoFromLocalCache(store);
      if (cancelled) return;
      if (cached) {
        blobUrlRef.current = cached;
        isExternalUrlRef.current = false;
        setLogoSrc(cached);
        setLoading(false);
        // Do NOT call onLogoResolved with a session-specific blob URL.
        // Blob URLs are ephemeral — persisting them to the database would
        // cause logos to fail to load on any subsequent page refresh.
        return;
      }

      // ── Step 3: Supabase Storage public URL ────────────────────────────────
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
        onLogoResolvedRef.current?.(supabaseUrl);
        return;
      }

      // ── Step 4: External APIs ──────────────────────────────────────────────
      // Prefer known food-delivery domains first, then fallback to Brandfetch search.
      const preferredDomain = getPreferredFoodDomain(store);
      const domain = preferredDomain ?? await searchBrandfetchDomain(store);
      if (cancelled) return;

      const clientId = getClientId();
      let candidates: string[];
      if (domain) {
        // Try multiple providers for better resilience across Brazilian banks.
        candidates = [
          ...(clientId ? [`https://cdn.brandfetch.io/${domain}/w/56/h/56?c=${clientId}`] : []),
          `https://logo.clearbit.com/${domain}`,
          `https://icons.duckduckgo.com/ip3/${domain}.ico`,
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
        ];
        isExternalUrlRef.current = true;
      } else {
        // No domain found — use Google Favicon as a best-effort display
        // fallback but do NOT upload or persist the result.  The favicon
        // endpoint uses a store name (not a domain) so results are unreliable
        // and may be a generic globe icon.
        candidates = [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(store)}&sz=128`];
        isExternalUrlRef.current = false;
      }

      const uniqueCandidates = Array.from(new Set(candidates));
      candidateUrlsRef.current = uniqueCandidates;
      currentCandidateIndexRef.current = 0;
      setLogoSrc(uniqueCandidates[0] ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [store, initialUrl, merchantId]); // onLogoResolved/onMerchantResolved intentionally omitted — tracked via refs

  const handleImageLoad = () => {
    if (logoSrc) {
      onLogoResolvedRef.current?.(logoSrc);
    }

    // Only upload to Supabase when the logo was resolved via an external API.
    // Logos already served from Supabase or the local cache skip this step.
    if (!logoSrc || !isExternalUrlRef.current) return;
    uploadLogoToSupabase(store, logoSrc).then((publicUrl) => {
      if (publicUrl) {
        saveMerchantLogoUrl(store, publicUrl);
        // Create or update the merchant record and propagate the merchant ID.
        findOrCreateMerchant(store, null, publicUrl).then((merchant) => {
          if (merchant?.id) {
            onMerchantResolvedRef.current?.(merchant.id);
          }
        });
      }
    });
  };

  const handleError = () => {
    const nextIndex = currentCandidateIndexRef.current + 1;
    if (nextIndex < candidateUrlsRef.current.length) {
      currentCandidateIndexRef.current = nextIndex;
      setLogoSrc(candidateUrlsRef.current[nextIndex]);
      return;
    }

    // All candidate URLs have been exhausted — show the category icon fallback.
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

