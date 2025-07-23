/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}"
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        'primary-bg': '#181A20',      // Main background
        'card-bg': '#232634',         // Card/input background
        'accent': '#FFD600',          // Accent yellow
        'text-main': '#fff',          // Main text
        'text-secondary': '#CACACB',  // Secondary text
        'input-placeholder': '#888',  // Placeholder text
      },
      borderRadius: {
        'theme': '8px', // For consistent rounded corners
      }
    },
  },
  plugins: [],
}

