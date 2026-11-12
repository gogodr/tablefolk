const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function gameCoverSrc(coverUrl: string): string {
  return coverUrl.startsWith("/v1/covers/")
    ? `${apiBaseUrl.replace(/\/$/, "")}${coverUrl}`
    : coverUrl;
}
