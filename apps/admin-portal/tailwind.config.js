/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#090d16',
        surface: '#111726',
        'surface-hover': '#192238',
        border: '#1f293d',
        primary: '#3b82f6',
        accent: '#06b6d4',
      },
    },
  },
  plugins: [],
};
