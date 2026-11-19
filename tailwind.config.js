/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./js/**/*.js"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fleet: {
          dark: '#0f172a',
          card: '#1e293b',
          border: '#334155'
        }
      }
    },
  },
  plugins: [],
}
