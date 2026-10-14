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
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        panel: {
          bg: 'rgba(17, 24, 39, 0.88)',
          border: 'rgba(255, 255, 255, 0.12)',
          card: 'rgba(31, 41, 55, 0.75)',
        },
      },
    },
  },
  plugins: [],
};
