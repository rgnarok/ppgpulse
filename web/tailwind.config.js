/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5F6FA',
        surface: '#FFFFFF',
        side: '#0E1626',
        sidetx: '#9FB0C9',
        primary: {
          DEFAULT: '#4F46E5',
          dark: '#4338CA',
          light: '#EEF0FF',
        },
        ink: '#0F172A',
        muted: '#64748B',
        faint: '#94A3B8',
        line: '#E7E9F0',
        line2: '#DDE1EA',
        ok: '#10B981',
        amber: '#F59E0B',
        danger: '#EF4444',
        sky: '#0EA5E9',
        violet: '#8B5CF6',
        teal: '#14B8A6',
        gold: '#C99A2E',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.05)',
        lg2: '0 12px 40px rgba(16,24,40,.14)',
      },
    },
  },
  plugins: [],
};
