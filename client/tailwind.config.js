/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
      },
      colors: {
        accent: {
          DEFAULT: '#22d3ee',
          hover: '#67e8f9',
          muted: 'rgba(34, 211, 238, 0.2)',
        },
      },
    },
  },
  plugins: [],
};
