import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@coursewise/shared';
import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    resources: {
      en,
      'zh-CN': zhCN,
    },
  });

export default i18n;
