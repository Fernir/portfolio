import { landingMessages } from '~/i18n/landing';
import { DEFAULT_LANDING_LOCALE, isLandingLocale, type LandingLocale } from '~/i18n/localeUi';

const STORAGE_KEY = 'port-landing-locale';

export function useLandingLocale() {
   const locale = useState<LandingLocale>('landing-locale', () => DEFAULT_LANDING_LOCALE);

   const messages = computed(() => landingMessages[locale.value]);

   function setLocale(next: LandingLocale) {
      locale.value = next;
   }

   if (import.meta.client) {
      onMounted(() => {
         const raw = localStorage.getItem(STORAGE_KEY);
         if (raw && isLandingLocale(raw)) locale.value = raw;
      });
      watch(locale, (v) => localStorage.setItem(STORAGE_KEY, v));
   }

   return { locale, messages, setLocale };
}
