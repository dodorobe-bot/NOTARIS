/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#F1F4FA',
          100: '#DEE5F2',
          200: '#B9C6E0',
          300: '#8FA2C7',
          400: '#5D76A6',
          500: '#3A5585',
          600: '#25406C',
          700: '#16345F',
          800: '#10274C',
          900: '#0B1D3A',
          950: '#071427',
        },
        gold: {
          300: '#E2CB8C',
          400: '#D4B45F',
          500: '#C8A34A',
          600: '#A9863A',
          700: '#85682C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,29,58,0.06), 0 8px 24px -16px rgba(11,29,58,0.18)',
        pop: '0 24px 60px -12px rgba(7,20,39,0.35)',
      },
    },
  },
  plugins: [],
}
