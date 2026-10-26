/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      colors: {
        panel: {
          bg: 'rgba(15, 23, 42, 0.92)',
          elevated: 'rgba(15, 23, 42, 0.96)',
          card: 'rgba(2, 6, 23, 0.72)',
          inset: 'rgba(2, 6, 23, 0.88)',
          border: 'rgba(148, 163, 184, 0.16)',
          borderStrong: 'rgba(148, 163, 184, 0.28)',
        },
      },
    },
  },
  plugins: [],
};
