/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/preline/preline.js",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mempool: {
          bg: '#f9fafb',
          card: '#ffffff',
          border: '#e5e7eb',
          accent: '#2563eb',
          'accent-light': '#3b82f6',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
