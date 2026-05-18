import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@coursewise/shared';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          app: { name: 'CourseWise', tagline: 'Course management, reimagined.' },
        },
      },
      'zh-CN': {
        translation: {
          app: { name: 'CourseWise', tagline: '全新的课程管理体验。' },
        },
      },
    },
  });

export default i18n;
