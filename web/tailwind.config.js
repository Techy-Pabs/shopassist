import { buildTheme, loadTokens } from './tokens.theme.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Not "extend": the token theme replaces Tailwind's defaults entirely
  theme: buildTheme(loadTokens()),
  plugins: [],
}
