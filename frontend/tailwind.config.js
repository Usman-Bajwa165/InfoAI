/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",   // your pages folder
    "./components/**/*.{js,ts,jsx,tsx}", // optional components folder
    "./app/**/*.{js,ts,jsx,tsx}"      // if you use /app folder
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
