import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: [
          '"Geist Variable"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        display: ['"Fraunces Variable"', 'ui-serif', 'Georgia', 'Cambria', 'serif'],
      },
      colors: {
        // Editorial marketing palette (public + auth pages). Kept separate from
        // the shadcn semantic tokens so the back-office is unaffected.
        paper: { DEFAULT: '#FBFAF7', 200: '#F4F1EA', 300: '#EAE6DB' },
        ink: { DEFAULT: '#15140F', 700: '#26241D', 600: '#3A372F', 400: '#6B6658' },
        evergreen: {
          DEFAULT: '#2F5D50',
          dark: '#21463A',
          600: '#28503F',
          200: '#CDDAD1',
          100: '#E7EEE9',
        },
        clay: '#B4623F',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Warm-tinted (ink-hued) shadows for the editorial surfaces.
        'warm-sm': '0 1px 2px rgba(21, 20, 15, 0.06)',
        warm: '0 10px 34px -16px rgba(21, 20, 15, 0.22)',
        'warm-lg': '0 30px 70px -28px rgba(21, 20, 15, 0.34)',
      },
      keyframes: {
        // Used by Gamma's indeterminate progress bar.
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(200%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
