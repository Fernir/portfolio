import type { ProjectId } from '../data/site';
import type { LandingLocale } from './localeUi';

export type { LandingLocale };

export interface LandingMessages {
   siteMeta: { title: string; description: string };
   nav: {
      ariaMain: string;
      contactFooterAria: string;
      portfolioArticleAria: string;
      languageSwitcherAria: string;
      forestAmbientPlay: string;
      forestAmbientPause: string;
      forestAmbientUnavailable: string;
   };
   hero: {
      eyebrow: string;
      line1: string;
      lead: string;
   };
   sections: {
      work: { id: 'work'; kicker: string };
      experiment: {
         id: 'experiment';
         kicker: string;
         webQuake: string;
      };
   };
   projects: Record<ProjectId, { title: string; desc: string }>;
   contact: {
      lead: string;
      telegramLabel: string;
   };
   aria: { openSite: string; webQuake: string };
}

const en: LandingMessages = {
   siteMeta: {
      title: 'Portfolio',
      description: 'A small portfolio site: sample projects, contact, forest backdrop and a separate lab page.',
   },
   nav: {
      ariaMain: 'Primary navigation',
      contactFooterAria: 'Contact links',
      portfolioArticleAria: 'Portfolio content as plain text',
      languageSwitcherAria: 'Choose language',
      forestAmbientPlay: 'Play forest ambience',
      forestAmbientPause: 'Pause forest ambience',
      forestAmbientUnavailable: 'Forest ambience is unavailable.',
   },
   hero: {
      eyebrow: 'Portfolio',
      line1: 'A few shipped projects',
      lead: 'This page collects work samples and how to reach me. The site is a small sandbox: animated forest backdrop for atmosphere.',
   },
   sections: {
      work: {
         id: 'work',
         kicker: 'Work',
      },
      experiment: {
         id: 'experiment',
         kicker: 'Experiment',
         webQuake: 'Web Quake',
      },
   },
   projects: {
      cropmap: {
         title: 'Cropmap',
         desc: 'Ag platform for people in fields, not slides: crops, maps, indices, the unglamorous day-to-day stuff.',
      },
      tgames: {
         title: 'T-Games',
         desc: 'Catalogue of online “transformation” games — search, upcoming sessions, hosts, booking. Busy UI, lots of edge cases.',
      },
   },
   contact: {
      lead: 'Email or Telegram is enough for a first message.',
      telegramLabel: 'Telegram',
   },
   aria: {
      openSite: 'Open site —',
      webQuake: 'Open Web Quake',
   },
};

const de: LandingMessages = {
   siteMeta: {
      title: 'Portfolio',
      description: 'Kleine Portfolio-Seite: Beispielprojekte, Kontakt, Wald-Hintergrund und eine eigene Lab-Route.',
   },
   nav: {
      ariaMain: 'Hauptnavigation',
      contactFooterAria: 'Kontaktlinks',
      portfolioArticleAria: 'Portfolio-Inhalt als Nur-Text',
      languageSwitcherAria: 'Sprache wählen',
      forestAmbientPlay: 'Wald-Ambiente abspielen',
      forestAmbientPause: 'Wald-Ambiente pausieren',
      forestAmbientUnavailable: 'Wald-Ambiente ist nicht verfügbar.',
   },
   hero: {
      eyebrow: 'Portfolio',
      line1: 'Ein paar Referenzen',
      lead: 'Hier liegen Ausschnitte aus laufenden Projekten und Kontaktdaten. Zum Spielen: animierter Wald-Hintergrund.',
   },
   sections: {
      work: {
         id: 'work',
         kicker: 'Projekte',
      },
      experiment: {
         id: 'experiment',
         kicker: 'Experiment',
         webQuake: 'Web Quake',
      },
   },
   projects: {
      cropmap: {
         title: 'Cropmap',
         desc: 'Plattform fürs Präzisions-Agrar: Karten, Kulturen, Indizes — weniger PowerPoint, mehr Feld.',
      },
      tgames: {
         title: 'T-Games',
         desc: 'Katalog für Online-Transformations-Spiele: Suche, Termine, Hosts, Buchung. Viel UI, viele Sonderfälle.',
      },
   },
   contact: {
      lead: 'Erste Nachricht reicht per E-Mail oder Telegram.',
      telegramLabel: 'Telegram',
   },
   aria: {
      openSite: 'Seite öffnen —',
      webQuake: 'Web Quake öffnen',
   },
};

const zh: LandingMessages = {
   siteMeta: {
      title: '作品集',
      description: '个人作品集站点：项目节选、联系方式，带动画背景和单独的重型实验页。',
   },
   nav: {
      ariaMain: '主导航',
      contactFooterAria: '联系方式',
      portfolioArticleAria: '作品集纯文本内容',
      languageSwitcherAria: '选择语言',
      forestAmbientPlay: '播放森林环境音',
      forestAmbientPause: '暂停森林环境音',
      forestAmbientUnavailable: '森林环境音不可用。',
   },
   hero: {
      eyebrow: '作品集',
      line1: '上线项目节选',
      lead: '页面里是案例片段和联系方式。背景有动效森林氛围。',
   },
   sections: {
      work: {
         id: 'work',
         kicker: '项目',
      },
      experiment: {
         id: 'experiment',
         kicker: '实验',
         webQuake: 'Web Quake',
      },
   },
   projects: {
      cropmap: {
         title: 'Cropmap',
         desc: '面向田里干活的人：作物、地图、指数，日常运营那套，不是给会议室看的壳子。',
      },
      tgames: {
         title: 'T-Games',
         desc: '线上「蜕变类」游戏目录：检索、场次、主持人、预约。界面忙，边界情况也多。',
      },
   },
   contact: {
      lead: '先发邮件或 Telegram 都可以。',
      telegramLabel: 'Telegram',
   },
   aria: {
      openSite: '打开网站 —',
      webQuake: '打开 Web Quake',
   },
};

const ru: LandingMessages = {
   siteMeta: {
      title: 'Портфолио',
      description: 'Небольшой сайт-портфолио: примеры работ, контакты, анимированный фон и отдельная страница с тяжёлым экспериментом.',
   },
   nav: {
      ariaMain: 'Основная навигация',
      contactFooterAria: 'Контакты',
      portfolioArticleAria: 'Содержание портфолио в текстовом виде',
      languageSwitcherAria: 'Выберите язык',
      forestAmbientPlay: 'Включить звук леса',
      forestAmbientPause: 'Выключить звук леса',
      forestAmbientUnavailable: 'Звук леса недоступен.',
   },
   hero: {
      eyebrow: 'Портфолио',
      line1: 'Сайты на заказ',
      lead: 'На любом движке и фреймворке',
   },
   sections: {
      work: {
         id: 'work',
         kicker: 'Проекты',
      },
      experiment: {
         id: 'experiment',
         kicker: 'Эксперимент',
         webQuake: 'Web Quake',
      },
   },
   projects: {
      cropmap: {
         title: 'Cropmap',
         desc: 'Платформа для агро: поля, культуры, индексы, будни — рабочий инструмент, не макет для презентации.',
      },
      tgames: {
         title: 'T-Games',
         desc: 'Каталог онлайн-игр: поиск, ближайшие сессии, ведущие, запись. Много экранов и неочевидных сценариев.',
      },
   },
   contact: {
      lead: '',
      telegramLabel: 'Telegram',
   },
   aria: {
      openSite: 'Открыть сайт —',
      webQuake: 'Открыть Web Quake',
   },
};

const fr: LandingMessages = {
   siteMeta: {
      title: 'Portfolio',
      description: 'Petit site portfolio : extraits de projets, contact, fond animé et une page lab WebGL à part.',
   },
   nav: {
      ariaMain: 'Navigation principale',
      contactFooterAria: 'Liens de contact',
      portfolioArticleAria: 'Contenu du portfolio en texte brut',
      languageSwitcherAria: 'Choisir la langue',
      forestAmbientPlay: 'Lire l’ambiance forêt',
      forestAmbientPause: 'Couper l’ambiance forêt',
      forestAmbientUnavailable: 'L’ambiance forêt est indisponible.',
   },
   hero: {
      eyebrow: 'Portfolio',
      line1: 'Quelques références en ligne',
      lead: 'Extraits de travaux et moyens de contact. Fond forêt animé pour l’ambiance.',
   },
   sections: {
      work: {
         id: 'work',
         kicker: 'Projets',
      },
      experiment: {
         id: 'experiment',
         kicker: 'Expérience',
         webQuake: 'Web Quake',
      },
   },
   projects: {
      cropmap: {
         title: 'Cropmap',
         desc: 'Outil agro pour le terrain : cultures, cartes, indices — moins de vitrine PowerPoint, plus de boulot quotidien.',
      },
      tgames: {
         title: 'T-Games',
         desc: 'Catalogue de jeux en ligne « transformation » : recherche, sessions, animateurs, résa. Beaucoup d’UI, pas mal de cas tordus.',
      },
   },
   contact: {
      lead: 'Un premier mail ou un message Telegram suffit.',
      telegramLabel: 'Telegram',
   },
   aria: {
      openSite: 'Ouvrir le site —',
      webQuake: 'Ouvrir Web Quake',
   },
};

export const landingMessages: Record<LandingLocale, LandingMessages> = {
   en,
   de,
   fr,
   ru,
   zh,
};

export const landingEn = en;
