import type { Config } from 'tailwindcss'

export default {
   theme: {
      extend: {
         fontFamily: {
            sans: ['Instrument Sans', 'system-ui', 'sans-serif'],
            heading: ['Unbounded', 'system-ui', 'sans-serif'],
         },
         colors: {
            ink: {
               DEFAULT: 'var(--text)',
               muted: 'var(--text-muted)',
            },
            forest: {
               accent: 'var(--accent)',
               hot: 'var(--accent-hot)',
               deep: 'var(--bg-deep)',
            },
         },
      },
   },
   plugins: [],
} satisfies Config
