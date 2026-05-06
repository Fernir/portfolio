export type LandingLocale = 'en' | 'de' | 'fr' | 'ru' | 'zh';

/** First visit + SSR; client restores saved choice from localStorage after mount. */
export const DEFAULT_LANDING_LOCALE: LandingLocale = 'en';

/** Flag emoji + endonym for the language dropdown (order = menu order). */
export const localeChoices = [
   { code: 'en', nativeLabel: 'English' },
   { code: 'de', nativeLabel: 'Deutsch' },
   { code: 'fr', nativeLabel: 'Français' },
   { code: 'ru', nativeLabel: 'Русский' },
   { code: 'zh', nativeLabel: '中文' },
] as const satisfies readonly { code: LandingLocale; nativeLabel: string }[];

export function isLandingLocale(value: string): value is LandingLocale {
   return localeChoices.some((c) => c.code === value);
}
