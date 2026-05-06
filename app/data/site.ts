export type ProjectId = 'cropmap' | 'tgames';

export interface ProjectBase {
   id: ProjectId;
   stack: string;
   url: string;
   cover?: string;
}

/** Hero projects after merging locale-specific title/description. */
export type Project = ProjectBase & {
   title: string;
   desc: string;
};

export interface SkillGroup {
   title: string;
   items: string[];
}

export interface AboutCard {
   title: string;
   body: string;
}

export const projectsCore: ProjectBase[] = [
   {
      id: 'cropmap',
      stack: 'cropmap.ru',
      url: 'https://cropmap.ru/',
      cover: '/cropmap.jpg',
   },
   {
      id: 'tgames',
      stack: 'tgames.twc1.net',
      url: 'https://tgames.twc1.net/',
      cover: '/tgames.png',
   },
];

export const contactCredentials = {
   email: 'domainexecute@gmail.com',
   telegramUrl: 'https://t.me/nnalexeev',
} as const;
