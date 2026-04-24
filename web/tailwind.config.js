// filepath: web/tailwind.config.js
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#1a1a1a",
          surface: "#2a2a2a",
          hover: "#3a3a3a",
          text: "#e0e0e0",
          muted: "#a0a0a0",
        },
      },
    },
  },
  plugins: [],
};
