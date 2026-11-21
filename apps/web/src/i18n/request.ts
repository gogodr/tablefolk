import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const supportedLocales = ["es", "en"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const defaultLocale: SupportedLocale = "es";

export default getRequestConfig(async () => {
  let locale: SupportedLocale = defaultLocale;

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value as SupportedLocale | undefined;
    if (cookieLocale && supportedLocales.includes(cookieLocale)) {
      locale = cookieLocale;
    } else {
      const headerList = await headers();
      const acceptLang = headerList.get("accept-language");
      if (acceptLang && acceptLang.toLowerCase().startsWith("en")) {
        locale = "en";
      }
    }
  } catch {
    locale = defaultLocale;
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
