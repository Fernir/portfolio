import type { Config } from 'tailwindcss'

export default {
   theme: {
      extend: {
         fontFamily: {
            sans: ['Instrument Sans', 'system-ui', 'sans-serif'],
            /** Не «display» — конфликтует по имени с CSS-свойством font-display */
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
            mario: {
               red: '#e52521',
               sky: '#5c94fc',
               grass: '#6bae58',
               grassDark: '#5a8048',
               chrome: '#3d4c38',
               chromeFg: '#f5f0dc',
               chromeMuted: '#a8c4a0',
               pageInk: '#0f1833',
               btnFace: '#6b8f71',
               btnInk: '#f8f4e8',
               btnBorder: '#1e1e1e',
            },
         },
         zIndex: {
            'mario-pixi': '2',
            'mario-screen': '3',
            'nav-lang': '80',
            'dropdown-menu': '90',
         },
         boxShadow: {
            'mario-btn': '2px 3px 0 #1a1a1a',
            'mario-header-bar': 'inset 0 -4px 0 0 rgba(0, 0, 0, 0.25)',
         },
         opacity: {
            45: '0.45',
         },
         borderRadius: {
            card: 'var(--radius-card)',
         },
         transitionTimingFunction: {
            'out-expo': 'var(--ease-out-expo)',
         },
         transitionDuration: {
            450: '450ms',
         },
      },
   },
   plugins: [],
} satisfies Config
