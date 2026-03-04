import { useState, useEffect } from "react";
import { searchBrandfetchDomain } from "@/lib/brandfetch";

interface BrandLogoProps {
  store: string;
  /** Icon shown when no logo is available. If omitted the component renders nothing on failure. */
  fallbackIcon?: React.ReactNode;
  /** Background colour for the fallback container. */
  fallbackBg?: string;
  /** Size in pixels (width = height). Defaults to 28 (7 × 4 px). */
  size?: number;
}

/**
 * BrandLogo: shows a brand logo for a store/company name.
 *
 * When VITE_BRANDFETCH_API_KEY is set, the Brandfetch Search API is first called
 * to resolve the company name to its real domain (e.g. "Amazon" → "amazon.com"),
 * so the logo lookup is accurate rather than guessed.
 *
 * When VITE_BRANDFETCH_CLIENT_ID is also set, logos are fetched from the Brandfetch
 * CDN (cdn.brandfetch.io); otherwise the Clearbit Logo API is used.
 *
 * Falls back to fallbackIcon (if provided) or renders nothing when no logo loads.
 */
const BrandLogo = ({ store, fallbackIcon, fallbackBg, size = 28 }: BrandLogoProps) => {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [fallbackStep, setFallbackStep] = useState(0);
  const [loading, setLoading] = useState(!!store);

  const getClientId = () => {
    const rawClientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID;
    return rawClientId ? String(rawClientId).replace(/[^a-zA-Z0-9-]/g, "") : null;
  };

  useEffect(() => {
    if (!store) {
      setLogoSrc(null);
      setFailed(false);
      setFallbackStep(0);
      setLoading(false);
      return;
    }
    setFailed(false);
    setFallbackStep(0);
    setLogoSrc(null);
    setLoading(true);

    const clientId = getClientId();

    let cancelled = false;
    // Use the Brandfetch Search API to get the real domain when an API key is available.
    // If the search returns nothing, fall back to Google Favicon using the store name.
    searchBrandfetchDomain(store).then((domain) => {
      if (cancelled) return;
      if (domain) {
        if (clientId) {
          setLogoSrc(`https://cdn.brandfetch.io/${domain}/w/56/h/56?c=${clientId}`);
        } else {
          setLogoSrc(`https://logo.clearbit.com/${domain}`);
        }
      } else {
        // Brandfetch found no domain; skip straight to Google Favicon with the store name.
        // Google's s2/favicons service resolves business names (not just bare domains) to
        // their known web presence, which works well for local businesses listed on Google.
        setLogoSrc(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(store)}&sz=128`);
        setFallbackStep(2); // skip first-word fallbacks; next failure goes to category icon
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [store]);

  const handleError = () => {
    const clientId = getClientId();
    // First word of the store name (e.g. "amazon" from "Amazon Prime Video").
    // Useful when the full concatenated slug doesn't match a real domain.
    // Hyphens are preserved so compound names like "Coca-Cola" → "coca-cola.com".
    const firstWord = store.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9-]/g, "");

    // Ordered list of fallback URLs to try before giving up:
    // 0. Clearbit/CDN for the first-word domain (.com) — catches multi-word brand names.
    // 1. Google Favicon for the store name — covers local businesses found on Google.
    const fallbacks: string[] = [
      clientId
        ? `https://cdn.brandfetch.io/${firstWord}.com/w/56/h/56?c=${clientId}`
        : `https://logo.clearbit.com/${firstWord}.com`,
      // 1. Google Favicon for the store name — intentionally passes the business name to
      //    Google's s2/favicons service, which resolves it to the brand's web presence
      //    (e.g. a bakery listed on Google Maps, iFood, or Restaurant Guru).
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(store)}&sz=128`,
    ];

    if (fallbackStep < fallbacks.length) {
      setLogoSrc(fallbacks[fallbackStep]);
      setFallbackStep((prev) => prev + 1);
    } else {
      setFailed(true);
    }
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
        onError={handleError}
      />
    </div>
  );
};

export default BrandLogo;
