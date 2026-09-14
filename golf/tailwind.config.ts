import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        turf: {
          50: "#f1f8f2",
          100: "#dcedde",
          200: "#bcdcc1",
          300: "#8fc298",
          400: "#5da16a",
          500: "#3c854b",
          600: "#2b6a39",
          700: "#23542f",
          800: "#1e4328",
          900: "#193722",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
