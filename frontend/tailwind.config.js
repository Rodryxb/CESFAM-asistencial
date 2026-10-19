/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        minsal: { DEFAULT: "#C4121A", dark: "#9E0E15", light: "#FDE8E8" },
        inacap: { DEFAULT: "#C4121A", dark: "#9E0E15", light: "#FDE8E8" },
        fondo: "#F8FAFC",
      },
      fontFamily: { sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
