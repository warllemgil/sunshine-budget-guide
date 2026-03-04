import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeStoreName,
  getLogoFromLocalCache,
  saveLogoToLocalCache,
  getLogoFromSupabase,
  uploadLogoToSupabase,
  saveMerchantLogoUrl,
} from "@/lib/merchantLogo";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn(() => ({
          data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/merchant-logos/youtube.png" },
        })),
        upload: vi.fn(() => ({ error: null })),
      })),
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null })),
      })),
    })),
  },
}));

// ---------------------------------------------------------------------------
// sanitizeStoreName
// ---------------------------------------------------------------------------

describe("sanitizeStoreName", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(sanitizeStoreName("YouTube Premium")).toBe("youtube-premium.png");
  });

  it("removes leading/trailing hyphens", () => {
    expect(sanitizeStoreName("  Amazon  ")).toBe("amazon.png");
  });

  it("collapses consecutive special chars into a single hyphen", () => {
    expect(sanitizeStoreName("McDonald's")).toBe("mcdonalds.png");
  });

  it("preserves hyphens in compound names", () => {
    expect(sanitizeStoreName("Coca-Cola")).toBe("coca-cola.png");
  });

  it("appends .png extension", () => {
    expect(sanitizeStoreName("Netflix")).toBe("netflix.png");
  });
});

// ---------------------------------------------------------------------------
// Cache Storage helpers
// ---------------------------------------------------------------------------

describe("getLogoFromLocalCache / saveLogoToLocalCache", () => {
  const mockCache = {
    match: vi.fn(),
    put: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue(mockCache),
    });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock-url"), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when the cache has no entry", async () => {
    mockCache.match.mockResolvedValue(undefined);
    const result = await getLogoFromLocalCache("Netflix");
    expect(result).toBeNull();
  });

  it("returns a blob URL when the cache has an entry", async () => {
    const fakeBlob = new Blob(["img"], { type: "image/png" });
    mockCache.match.mockResolvedValue({ blob: () => Promise.resolve(fakeBlob) });
    const result = await getLogoFromLocalCache("Netflix");
    expect(result).toBe("blob:mock-url");
  });

  it("returns null when caches is not available", async () => {
    vi.unstubAllGlobals();
    // Simulate environment without Cache Storage API
    const result = await getLogoFromLocalCache("Netflix");
    // In jsdom, caches is not defined so the function returns null
    expect(result).toBeNull();
  });

  it("saves a blob under the sanitized filename", async () => {
    vi.stubGlobal("caches", { open: vi.fn().mockResolvedValue(mockCache) });
    mockCache.put.mockResolvedValue(undefined);
    const blob = new Blob(["img"], { type: "image/png" });
    await saveLogoToLocalCache("YouTube", blob);
    expect(mockCache.put).toHaveBeenCalledWith(
      "/youtube.png",
      expect.any(Response),
    );
  });
});

// ---------------------------------------------------------------------------
// getLogoFromSupabase
// ---------------------------------------------------------------------------

describe("getLogoFromSupabase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the public URL when the HEAD request succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const result = await getLogoFromSupabase("youtube");
    expect(result).toBe(
      "https://example.supabase.co/storage/v1/object/public/merchant-logos/youtube.png",
    );
  });

  it("returns null when the HEAD request returns non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await getLogoFromSupabase("unknown-brand");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await getLogoFromSupabase("youtube");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// uploadLogoToSupabase
// ---------------------------------------------------------------------------

describe("uploadLogoToSupabase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when fetching the image fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await uploadLogoToSupabase("netflix", "https://example.com/logo.png");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network")));
    const result = await uploadLogoToSupabase("netflix", "https://example.com/logo.png");
    expect(result).toBeNull();
  });

  it("returns the public URL on successful upload", async () => {
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({ put: vi.fn().mockResolvedValue(undefined) }),
    });
    const fakeBlob = new Blob(["img"], { type: "image/png" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(fakeBlob) }),
    );
    const result = await uploadLogoToSupabase("youtube", "https://cdn.example.com/youtube.png");
    expect(result).toBe(
      "https://example.supabase.co/storage/v1/object/public/merchant-logos/youtube.png",
    );
  });
});

// ---------------------------------------------------------------------------
// saveMerchantLogoUrl
// ---------------------------------------------------------------------------

describe("saveMerchantLogoUrl", () => {
  it("calls supabase update with the correct parameters", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as never);

    await saveMerchantLogoUrl("YouTube", "https://example.com/youtube.png");

    expect(supabase.from).toHaveBeenCalledWith("lancamentos");
    expect(updateMock).toHaveBeenCalledWith({ merchant_logo_url: "https://example.com/youtube.png" });
    expect(eqMock).toHaveBeenCalledWith("loja", "YouTube");
  });
});
