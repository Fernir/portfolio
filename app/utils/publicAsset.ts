/** Join base URL (e.g. Nuxt `app.baseURL`) with a path under `public/` — no trailing/duplicate slashes. */
function joinBaseAndPath(baseURL: string, pathWithoutLeadingSlash: string): string {
   const base = (baseURL || '/').trim() || '/';
   const tail = pathWithoutLeadingSlash.replace(/^\/+/, '');
   if (base === '/') {
      return tail ? `/${tail}` : '/';
   }
   const left = base.endsWith('/') ? base.slice(0, -1) : base;
   return tail ? `${left}/${tail}` : left;
}

/** Absolute URL for a file under `public/` (respects `app.baseURL`, e.g. GitHub Pages project sites). */
export function joinPublicAsset(baseURL: string, absolutePublicPath: string): string {
   const tail = absolutePublicPath.startsWith('/')
      ? absolutePublicPath.slice(1)
      : absolutePublicPath;
   return joinBaseAndPath(baseURL, tail);
}
