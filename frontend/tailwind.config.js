/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Clash Display', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
        'body': ['Satoshi', 'sans-serif'],
      },
      colors: {
        'ink': {
          50: '#f7f7f8',
          100: '#eeeef0',
          200: '#d9d9de',
          300: '#b8b8c1',
          400: '#91919f',
          500: '#747483',
          600: '#5d5d6b',
          700: '#4c4c58',
          800: '#41414b',
          900: '#393941',
          950: '#1a1a1f',
        },
        'volt': {
          50: '#f0fdf5',
          100: '#dcfce8',
          200: '#bbf7d1',
          300: '#86efad',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803c',
          800: '#166533',
          900: '#14532b',
        },
        'signal': {
          50: '#fef3f2',
          100: '#fee4e2',
          200: '#ffc9c6',
          300: '#ffa09a',
          400: '#ff6b61',
          500: '#f93c30',
          600: '#e71f12',
          700: '#c2160b',
          800: '#a1160d',
          900: '#851912',
        },
        'pulse': {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7c22ce',
          800: '#6b21a8',
          900: '#581c87',
        }
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slide-up 0.5s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(34, 197, 94, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(34, 197, 94, 0.6)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

