import type { AboutCard, ProjectId, SkillGroup } from '../data/site';
import type { LandingLocale } from './localeUi';

export type { LandingLocale };

export interface LandingMessages {
   siteMeta: { title: string; description: string };
   nav: {
      ariaMain: string;
      marioAria: string;
      marioSrOnly: string;
      about: string;
      skills: string;
      work: string;
      contact: string;
      contactFooterAria: string;
      portfolioArticleAria: string;
      languageSwitcherAria: string;
      forestAmbientPlay: string;
      forestAmbientPause: string;
      forestAmbientUnavailable: string;
   };
   theme: {
      ariaDark: string;
      ariaLight: string;
      titleDark: string;
      titleLight: string;
   };
   hero: {
      eyebrow: string;
      line1: string;
      line2: string;
      line1LightForest: string;
      line2LightForest: string;
      lead: string;
   };
   cta: { viewWork: string; write: string };
   sections: {
      about: { id: 'about'; kicker: string; heading: string };
      skills: { id: 'skills'; kicker: string; heading: string };
      work: { id: 'work'; kicker: string; heading: string; builtWith: string };
   };
   aboutCards: AboutCard[];
   skillGroups: SkillGroup[];
   projects: Record<ProjectId, { title: string; desc: string }>;
   contact: {
      lead: string;
      telegramLabel: string;
      marioContactKicker: string;
      marioContactTitle: string;
   };
   aria: { openSite: string };
}

const en: LandingMessages = {
   siteMeta: {
      title: 'Frontend developer',
      description:
         'Frontend engineer: React is my main framework; I also work with Vue. TypeScript, interfaces, accessibility — calm composition and motion where it matters.',
   },
   nav: {
      ariaMain: 'Primary navigation',
      marioAria: 'Portfolio block level',
      marioSrOnly: 'Block level',
      about: 'About',
      skills: 'Stack',
      work: 'Projects',
      contact: 'Contact',
      contactFooterAria: 'Contact links',
      portfolioArticleAria: 'Portfolio content as plain text',
      languageSwitcherAria: 'Choose language',
      forestAmbientPlay: 'Play forest ambience',
      forestAmbientPause: 'Pause forest ambience',
      forestAmbientUnavailable: 'Ambience file missing — add audio/forest/ambient.mp3 to public/',
   },
   theme: {
      ariaDark: 'Switch to dark forest',
      ariaLight: 'Switch to light forest',
      titleDark: 'Switch to dark forest',
      titleLight: 'Switch to light forest',
   },
   hero: {
      eyebrow: 'React · Vue · UI · composition',
      line1: 'Interfaces from twilight',
      line2: 'into ribbons of light',
      line1LightForest: 'Interfaces from daylight',
      line2LightForest: 'into dark ribbons',
      lead: 'Calm interfaces with clear structure and restrained motion wherever it supports the meaning.',
   },
   cta: {
      viewWork: 'View work',
      write: 'Get in touch',
   },
   sections: {
      about: {
         id: 'about',
         kicker: '01 — About',
         heading: 'Frontend with an eye for composition',
      },
      skills: {
         id: 'skills',
         kicker: '02 — Stack',
         heading: 'Tools',
      },
      work: {
         id: 'work',
         kicker: '03 — Projects',
         heading: 'In production',
         builtWith:
            'This portfolio site uses Nuxt 4, Vue 3, TypeScript, and Tailwind CSS; Three.js for the forest backdrop and light shafts; Pixi.js for the Mario-style block level; Vite for the build pipeline; ESLint with the Nuxt preset.',
      },
   },
   aboutCards: [
      {
         title: 'Who I am',
         body: 'Interface developer with React as my primary framework; I build with Vue 3 too when the project fits. Components, accessibility, motion only when it helps.',
      },
      {
         title: 'How I work',
         body: 'TypeScript, predictable structure, heavy work isolated so production stays fast.',
      },
   ],
   skillGroups: [
      { title: 'Core', items: ['React', 'Vue 3', 'TypeScript', 'Vite', 'SSR'] },
      { title: 'UI & motion', items: ['CSS', 'Tailwind', 'SVG', 'Motion'] },
      { title: 'Engineering', items: ['REST / GraphQL', 'Testing', 'CI', 'a11y'] },
   ],
   projects: {
      cropmap: {
         title: 'Cropmap — harvest map',
         desc: 'Precision farming platform: crop monitoring and vegetation indices, fields and ag data, pricing and day-to-day workflows for agribusiness.',
      },
      tgames: {
         title: 'T-Games — lab of effective games',
         desc: 'Catalogue of online transformational games: search by topic and date, upcoming sessions, hosts, booking, and a personal account.',
      },
   },
   contact: {
      lead: 'Questions and briefs — email or Telegram.',
      telegramLabel: 'Telegram',
      marioContactKicker: 'Contact',
      marioContactTitle: 'Reach out',
   },
   aria: {
      openSite: 'Open website:',
   },
};

const de: LandingMessages = {
   siteMeta: {
      title: 'Frontend-Entwickler',
      description:
         'Frontend-Engineering: React im Alltag als Hauptstack, dazu Vue; TypeScript, Interfaces und Barrierefreiheit — ruhige Komposition und Bewegung, wo sie Sinn ergibt.',
   },
   nav: {
      ariaMain: 'Hauptnavigation',
      marioAria: 'Portfolio-Block-Level',
      marioSrOnly: 'Block-Level',
      about: 'Über mich',
      skills: 'Stack',
      work: 'Projekte',
      contact: 'Kontakt',
      contactFooterAria: 'Kontaktlinks',
      portfolioArticleAria: 'Portfolio-Inhalt als Nur-Text',
      languageSwitcherAria: 'Sprache wählen',
      forestAmbientPlay: 'Wald-Ambiente abspielen',
      forestAmbientPause: 'Wald-Ambiente pausieren',
      forestAmbientUnavailable: 'Tondatei fehlt — ambient.mp3 unter public/audio/forest/ ablegen',
   },
   theme: {
      ariaDark: 'Zum dunklen Wald wechseln',
      ariaLight: 'Zum hellen Wald wechseln',
      titleDark: 'Zum dunklen Wald wechseln',
      titleLight: 'Zum hellen Wald wechseln',
   },
   hero: {
      eyebrow: 'React · Vue · UI · Komposition',
      line1: 'Interfaces aus der Dämmerung',
      line2: 'in Streifen aus Licht',
      line1LightForest: 'Interfaces aus dem Licht',
      line2LightForest: 'in dunkle Streifen',
      lead: 'Ruhige Interfaces mit klarer Struktur und zurückhaltender Bewegung, wo sie den Inhalt trägt.',
   },
   cta: {
      viewWork: 'Arbeiten ansehen',
      write: 'Schreiben',
   },
   sections: {
      about: {
         id: 'about',
         kicker: '01 — Über mich',
         heading: 'Frontend mit Fokus auf Komposition',
      },
      skills: {
         id: 'skills',
         kicker: '02 — Stack',
         heading: 'Werkzeuge',
      },
      work: {
         id: 'work',
         kicker: '03 — Projekte',
         heading: 'In Produktion',
         builtWith:
            'Diese Portfolio-Seite: Nuxt 4, Vue 3, TypeScript und Tailwind CSS; Three.js für Wald-Hintergrund und Licht; Pixi.js für die Mario-artige Block-Welt; Vite als Build; ESLint mit Nuxt-Preset.',
      },
   },
   aboutCards: [
      {
         title: 'Wer ich bin',
         body: 'Interface-Entwickler mit React als Hauptframework; Vue 3 nutze ich ebenfalls, wenn es zur Codebasis passt. Komponenten, Barrierefreiheit, Bewegung nur, wenn sie hilft.',
      },
      {
         title: 'Wie ich arbeite',
         body: 'TypeScript, vorhersagbare Architektur, schwere Teile isoliert, damit Produktion schnell bleibt.',
      },
   ],
   skillGroups: [
      { title: 'Core', items: ['React', 'Vue 3', 'TypeScript', 'Vite', 'SSR'] },
      { title: 'UI & Motion', items: ['CSS', 'Tailwind', 'SVG', 'Motion'] },
      { title: 'Engineering', items: ['REST / GraphQL', 'Testing', 'CI', 'a11y'] },
   ],
   projects: {
      cropmap: {
         title: 'Cropmap — Erntekarte',
         desc: 'Präzisionslandwirtschaft: Monitoring von Feldern und Vegetationsindizes, Agrardaten, Tarife und operative Abläufe für Agribusiness.',
      },
      tgames: {
         title: 'T-Games — Labor wirksamer Spiele',
         desc: 'Katalog Online-Transformationsspiele: Suche nach Thema und Datum, nächste Sessions, Hosts, Anmeldung und Nutzerkonto.',
      },
   },
   contact: {
      lead: 'Fragen und Aufträge — per E-Mail oder Telegram.',
      telegramLabel: 'Telegram',
      marioContactKicker: 'Kontakt',
      marioContactTitle: 'Kontakt aufnehmen',
   },
   aria: {
      openSite: 'Website öffnen:',
   },
};

const zh: LandingMessages = {
   siteMeta: {
      title: '前端开发',
      description:
         '前端工程师：日常以 React 为主框架，同时也使用 Vue；配合 TypeScript、界面与无障碍——克制动感与清晰排版，让交互更有意义。',
   },
   nav: {
      ariaMain: '主导航',
      marioAria: '作品集方块关卡',
      marioSrOnly: '方块关卡',
      about: '关于',
      skills: '技术栈',
      work: '项目',
      contact: '联系',
      contactFooterAria: '联系方式',
      portfolioArticleAria: '作品集纯文本内容',
      languageSwitcherAria: '选择语言',
      forestAmbientPlay: '播放森林环境音',
      forestAmbientPause: '暂停森林环境音',
      forestAmbientUnavailable: '未找到音频文件 — 请将 ambient.mp3 放入 public/audio/forest/',
   },
   theme: {
      ariaDark: '切换到深色森林主题',
      ariaLight: '切换到浅色森林主题',
      titleDark: '切换到深色森林主题',
      titleLight: '切换到浅色森林主题',
   },
   hero: {
      eyebrow: 'React · Vue · 界面 · 构图',
      line1: '界面自暮色中浮现',
      line2: '映入光亮条纹',
      line1LightForest: '界面自光亮中延伸',
      line2LightForest: '映入深色条纹',
      lead: '冷静、结构清楚的界面；只在有助于表达含义时使用克制的动效。',
   },
   cta: {
      viewWork: '查看作品',
      write: '联系我',
   },
   sections: {
      about: {
         id: 'about',
         kicker: '01 — 关于我',
         heading: '注重排版的前端开发',
      },
      skills: {
         id: 'skills',
         kicker: '02 — 技术栈',
         heading: '工具',
      },
      work: {
         id: 'work',
         kicker: '03 — 项目',
         heading: '线上项目',
         builtWith:
            '本站技术栈：Nuxt 4、Vue 3、TypeScript、Tailwind CSS；Three.js 负责森林背景与光束；Pixi.js 驱动马里奥风格的方块关卡；Vite 构建；配合 ESLint（Nuxt 预设）。',
      },
   },
   aboutCards: [
      {
         title: '我是谁',
         body: '界面开发者：日常主力栈是 React，也会用 Vue 3 交付合适项目。组件、无障碍，以及在恰当之处加入动效。',
      },
      {
         title: '工作方式',
         body: '使用 TypeScript、可预期的结构，把重逻辑隔离好，让线上保持快速。',
      },
   ],
   skillGroups: [
      { title: '核心', items: ['React', 'Vue 3', 'TypeScript', 'Vite', 'SSR'] },
      { title: '界面与动效', items: ['CSS', 'Tailwind', 'SVG', 'Motion'] },
      { title: '工程', items: ['REST / GraphQL', 'Testing', 'CI', 'a11y'] },
   ],
   projects: {
      cropmap: {
         title: 'Cropmap — 作物地图',
         desc: '精准农业平台：作物与植被指数监测、字段与农业数据、计费与日常运营场景。',
      },
      tgames: {
         title: 'T-Games — 高效游戏实验室',
         desc: '在线蜕变游戏目录：按主题与日期检索、近期场次、主持人、预约与个人中心。',
      },
   },
   contact: {
      lead: '合作与咨询——邮件或 Telegram。',
      telegramLabel: 'Telegram',
      marioContactKicker: '联系',
      marioContactTitle: '取得联系',
   },
   aria: {
      openSite: '打开网站：',
   },
};

const ru: LandingMessages = {
   siteMeta: {
      title: 'Frontend developer',
      description:
         'Фронтенд-разработчик: основной стек — React, также Vue; TypeScript, интерфейсы и доступность — спокойная композиция и движение там, где это уместно.',
   },
   nav: {
      ariaMain: 'Основная навигация',
      marioAria: 'Блоковый уровень портфолио',
      marioSrOnly: 'Блоковый уровень',
      about: 'Обо мне',
      skills: 'Стек',
      work: 'Проекты',
      contact: 'Связаться',
      contactFooterAria: 'Контакты',
      portfolioArticleAria: 'Содержание портфолио в текстовом виде',
      languageSwitcherAria: 'Выберите язык',
      forestAmbientPlay: 'Включить звук леса',
      forestAmbientPause: 'Выключить звук леса',
      forestAmbientUnavailable: 'Нет файла ambient.mp3 — положите его в public/audio/forest/',
   },
   theme: {
      ariaDark: 'Переключить на тёмный лес',
      ariaLight: 'Переключить на светлый лес',
      titleDark: 'Переключить на тёмный лес',
      titleLight: 'Переключить на светлый лес',
   },
   hero: {
      eyebrow: 'React · Vue · UI · композиция',
      line1: 'Интерфейсы из сумрака',
      line2: 'в светлые полосы',
      line1LightForest: 'Интерфейсы из света',
      line2LightForest: 'в тёмные полосы',
      lead: 'Спокойные интерфейсы с ясной структурой и аккуратным движением там, где оно поддерживает смысл.',
   },
   cta: {
      viewWork: 'Смотреть работы',
      write: 'Написать',
   },
   sections: {
      about: {
         id: 'about',
         kicker: '01 — О себе',
         heading: 'Фронтенд с вниманием к композиции',
      },
      skills: {
         id: 'skills',
         kicker: '02 — Стек',
         heading: 'Инструменты',
      },
      work: {
         id: 'work',
         kicker: '03 — Проекты',
         heading: 'В продакшене',
         builtWith:
            'Само портфолио: Nuxt 4, Vue 3, TypeScript и Tailwind CSS; Three.js — интерактивный лес на фоне и световые лучи; Pixi.js — блоковый уровень в духе Mario; сборка на Vite; ESLint с пресетом Nuxt.',
      },
   },
   aboutCards: [
      {
         title: 'Кто я',
         body: 'Разработчик интерфейсов: основной фреймворк — React, также Vue 3 там, где это уместно. Компоненты, доступность, движение там, где оно помогает.',
      },
      {
         title: 'Как работаю',
         body: 'TypeScript, предсказуемая структура, тяжёлое — изолированно, чтобы продакшен оставался быстрым.',
      },
   ],
   skillGroups: [
      { title: 'Core', items: ['React', 'Vue 3', 'TypeScript', 'Vite', 'SSR'] },
      { title: 'UI & motion', items: ['CSS', 'Tailwind', 'SVG', 'Motion'] },
      { title: 'Инженерия', items: ['REST / GraphQL', 'Testing', 'CI', 'a11y'] },
   ],
   projects: {
      cropmap: {
         title: 'Карта Урожая — Cropmap',
         desc: 'Платформа точного земледелия: мониторинг посевов и индексов, поля и агроданные, тарифы и операционные сценарии для агробизнеса.',
      },
      tgames: {
         title: 'Т-игры — лаборатория эффективных игр',
         desc: 'Каталог онлайн трансформационных игр: поиск по теме и дате, ближайшие сессии, ведущие, запись и личный кабинет.',
      },
   },
   contact: {
      lead: 'Вопросы и задачи — на почту или в Telegram.',
      telegramLabel: 'Telegram',
      marioContactKicker: 'Контакт',
      marioContactTitle: 'Связь',
   },
   aria: {
      openSite: 'Открыть сайт:',
   },
};

const fr: LandingMessages = {
   siteMeta: {
      title: 'Développeur front-end',
      description:
         'Ingénierie front-end : React au quotidien comme cadre principal, et Vue ; TypeScript, interfaces et accessibilité — composition calme et mouvement lorsque c’est pertinent.',
   },
   nav: {
      ariaMain: 'Navigation principale',
      marioAria: 'Niveau bloc du portfolio',
      marioSrOnly: 'Niveau bloc',
      about: 'À propos',
      skills: 'Stack',
      work: 'Projets',
      contact: 'Contact',
      contactFooterAria: 'Liens de contact',
      portfolioArticleAria: 'Contenu du portfolio en texte brut',
      languageSwitcherAria: 'Choisir la langue',
      forestAmbientPlay: 'Lire l’ambiance forêt',
      forestAmbientPause: 'Couper l’ambiance forêt',
      forestAmbientUnavailable: 'Fichier audio absent — ajoutez public/audio/forest/ambient.mp3',
   },
   theme: {
      ariaDark: 'Passer à la forêt sombre',
      ariaLight: 'Passer à la forêt claire',
      titleDark: 'Passer à la forêt sombre',
      titleLight: 'Passer à la forêt claire',
   },
   hero: {
      eyebrow: 'React · Vue · UI · composition',
      line1: 'Des interfaces venues du crépuscule',
      line2: 'vers des bandes de lumière',
      line1LightForest: 'Des interfaces venues de la lumière',
      line2LightForest: 'vers des bandes sombres',
      lead: 'Des interfaces posées, avec une structure lisible et un mouvement mesuré lorsqu’il soutient le sens.',
   },
   cta: {
      viewWork: 'Voir les réalisations',
      write: 'Écrire',
   },
   sections: {
      about: {
         id: 'about',
         kicker: '01 — À propos',
         heading: 'Du front-end attentif à la composition',
      },
      skills: {
         id: 'skills',
         kicker: '02 — Stack',
         heading: 'Outils',
      },
      work: {
         id: 'work',
         kicker: '03 — Projets',
         heading: 'En production',
         builtWith:
            'Ce site portfolio repose sur Nuxt 4, Vue 3, TypeScript et Tailwind CSS ; Three.js pour la forêt et les rayons de lumière ; Pixi.js pour la démo façon Mario ; Vite pour le build ; ESLint avec preset Nuxt.',
      },
   },
   aboutCards: [
      {
         title: 'Qui je suis',
         body: 'Développeur d’interfaces centré sur React au quotidien ; je livre aussi en Vue 3 quand la base le demande. Composants, accessibilité, animation quand elle aide vraiment.',
      },
      {
         title: 'Comment je travaille',
         body: 'TypeScript, architecture prévisible, parties lourdes isolées pour garder la prod rapide.',
      },
   ],
   skillGroups: [
      { title: 'Core', items: ['React', 'Vue 3', 'TypeScript', 'Vite', 'SSR'] },
      { title: 'UI & motion', items: ['CSS', 'Tailwind', 'SVG', 'Motion'] },
      { title: 'Ingénierie', items: ['REST / GraphQL', 'Testing', 'CI', 'a11y'] },
   ],
   projects: {
      cropmap: {
         title: 'Cropmap — carte des récoltes',
         desc: 'Plateforme d’agriculture de précision : suivi des cultures et des indices de végétation, parcelles et données agronomiques, tarification et usages opérationnels pour l’agrobusiness.',
      },
      tgames: {
         title: 'T-Games — laboratoire de jeux efficaces',
         desc: 'Catalogue de jeux de transformation en ligne : recherche par thème et date, sessions à venir, animateurs, inscription et espace personnel.',
      },
   },
   contact: {
      lead: 'Questions et briefs — par e-mail ou Telegram.',
      telegramLabel: 'Telegram',
      marioContactKicker: 'Contact',
      marioContactTitle: 'Écrire',
   },
   aria: {
      openSite: 'Ouvrir le site :',
   },
};

export const landingMessages: Record<LandingLocale, LandingMessages> = {
   en,
   de,
   fr,
   ru,
   zh,
};

/** English copy for Mario level panels and a11y fallback (single locale). */
export const landingEn = en;
