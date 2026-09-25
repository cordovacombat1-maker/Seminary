import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        greek: ['"Gentium Plus"', '"SBL Greek"', '"Times New Roman"', 'serif'],
      },
      colors: {
        parchment: '#faf7f0',
        ink: '#1f2328',
        burgundy: { 50: '#fbf3f3', 100: '#f4dfe0', 600: '#8c2f39', 700: '#74252f', 800: '#5c1d25' },
        gold: { 400: '#c9a227', 500: '#b08d1e' },
      },
    },
  },
  plugins: [typography],
};
