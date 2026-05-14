export type ProjectId = 'cropmap' | 'tgames';

export interface ProjectBase {
   id: ProjectId;
   url: string;
}

export type Project = ProjectBase & {
   title: string;
   desc: string;
};

export const projectsCore: ProjectBase[] = [
   {
      id: 'cropmap',
      url: 'https://cropmap.ru/',
   },
   {
      id: 'tgames',
      url: 'https://tgames.twc1.net/',
   },
];

export const contactCredentials = {
   email: 'domainexecute@gmail.com',
   telegramUrl: 'https://t.me/nnalexeev',
} as const;
