/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef3fb',
          100: '#d9e4f5',
          200: '#b3c8ea',
          500: '#2d5290',
          600: '#1f3f77',
          700: '#17305d',
          800: '#102347',
          900: '#0b1a36',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
