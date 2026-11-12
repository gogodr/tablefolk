export const config = {
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL,
  bggToken: process.env.BGG_TOKEN,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
  coverStorageAllowed: process.env.BGG_COVER_STORAGE_ALLOWED === "true",
};

export function requireSetting(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
