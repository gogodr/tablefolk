import { config } from "../config.js";

export interface CoverImage {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  data: Uint8Array<ArrayBuffer>;
}

export async function fetchCover(imageUrl: string | null): Promise<CoverImage | null> {
  if (!imageUrl || !config.coverStorageAllowed) return null;
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !(/(^|\.)geekdo-images\.com$/.test(url.hostname) || url.hostname === "boardgamegeek.com")) {
    return null;
  }
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 4_000_000) return null;
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp") return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 4_000_000) return null;
    return { contentType, data: bytes };
  } catch {
    return null;
  }
}
