const preset = require('@carrental/ui/tailwind-preset');
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};
