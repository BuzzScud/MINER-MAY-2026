/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mempool: {
          bg: '#0d1117',
          card: '#161b22',
          border: '#21262d',
          accent: '#238636',
          'accent-light': '#2ea043',
        },
      },
    },
  },
  plugins: [],
}
