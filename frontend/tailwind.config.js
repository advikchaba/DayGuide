/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-soft': 'var(--bg-soft)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--border)',
        ink: 'var(--text)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        accent2: 'var(--accent-2)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
      },
      borderRadius: {
        xl2: '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        glow: '0 25px 60px -25px var(--accent)',
        card: '0 20px 45px -30px rgba(0,0,0,0.9)',
      },
      fontFamily: {
        sans: ['Lato', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Abril Fatface', 'Georgia', 'serif'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '60%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s ease-out both',
        pop: 'pop 0.35s ease-out both',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 6s linear infinite',
      },
    },
  },
  plugins: [],
}
