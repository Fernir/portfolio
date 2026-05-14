export function stripAsteriskFootnotes(text: string): string {
   return text
      .replace(/\n[ \t]*\*[^\n]+$/u, '')
      .replace(/[ \t]+\*+$/u, '')
      .trim();
}
