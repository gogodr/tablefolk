import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("BGG cover import", () => {
  it("downloads an approved image once for local storage", async () => {
    vi.stubEnv("BGG_COVER_STORAGE_ALLOWED", "true");
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(async () => new Response(bytes, { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCover } = await import("./cover-store.js");

    const cover = await fetchCover("https://cf.geekdo-images.com/game.jpg");
    expect(cover).toEqual({ contentType: "image/jpeg", data: bytes });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-BGG image hosts", async () => {
    vi.stubEnv("BGG_COVER_STORAGE_ALLOWED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchCover } = await import("./cover-store.js");

    expect(await fetchCover("https://example.com/game.jpg")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
