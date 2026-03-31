/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme palette (Trading212-inspired fintech blue)
        navy: {
          950: '#060D1A',
          900: '#0B1426',
          800: '#111D35',
          700: '#162040',
          600: '#1A2744',
          500: '#1E3A5F',
          400: '#2A4A7F',
          300: '#3B6BAA',
        },
        // Brand accent
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          light: '#60A5FA',
        },
      },
    },
  },
  plugins: [],
};
