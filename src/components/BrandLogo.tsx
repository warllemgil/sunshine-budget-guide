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

  const toSlug = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  const getClientId = () => {
    const rawClientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID;
    return rawClientId ? String(rawClientId).replace(/[^a-zA-Z0-9-]/g, "") : null;
  };

  useEffect(() => {
    if (!store) {
      setLogoSrc(null);
      setFailed(false);
      return;
    }
    setFailed(false);
    setLogoSrc(null);

    const slug = toSlug(store);
    const clientId = getClientId();

    let cancelled = false;
    // Use the Brandfetch Search API to get the real domain when an API key is available.
    // Falls back to a slug-derived domain if the search returns nothing.
    searchBrandfetchDomain(store).then((domain) => {
      if (cancelled) return;
      const effectiveDomain = domain ?? `${slug}.com`;
      if (clientId) {
        setLogoSrc(`https://cdn.brandfetch.io/${effectiveDomain}/w/56/h/56?c=${clientId}`);
      } else {
        setLogoSrc(`https://logo.clearbit.com/${effectiveDomain}`);
      }
    });
    return () => { cancelled = true; };
  }, [store]);

  const handleError = () => {
    if (!failed && logoSrc) {
      // Try .com.br domain before giving up, using the same API that was configured
      const slug = toSlug(store);
      const clientId = getClientId();
      const fallbackUrl = clientId
        ? `https://cdn.brandfetch.io/${slug}.com.br/w/56/h/56?c=${clientId}`
        : `https://logo.clearbit.com/${slug}.com.br`;
      if (logoSrc !== fallbackUrl) {
        setLogoSrc(fallbackUrl);
        return;
      }
    }
    setFailed(true);
  };

  const style = { width: size, height: size };

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
