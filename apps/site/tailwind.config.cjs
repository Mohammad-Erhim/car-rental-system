const preset = require('@carrental/ui/tailwind-preset');
/**
 * apps/site Tailwind config. Extends the shared UI preset with the marketing design layer
 * (brand / warm-accent / layered-surface tokens + elevation + motion) defined in
 * src/app/globals.css. These classes are used only by the public site, not the ops dashboard.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [preset],
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          strong: 'hsl(var(--brand-strong))',
          foreground: 'hsl(var(--on-brand))',
        },
        'on-brand': 'hsl(var(--on-brand))',
        warm: {
          DEFAULT: 'hsl(var(--warm))',
          strong: 'hsl(var(--warm-strong))',
          foreground: 'hsl(var(--warm-foreground))',
        },
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          muted: 'hsl(var(--surface-muted))',
          sunken: 'hsl(var(--surface-sunken))',
        },
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          muted: 'hsl(var(--ink-muted))',
        },
        hairline: 'hsl(var(--hairline))',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        glow: 'var(--shadow-glow)',
      },
      backgroundImage: {
        'brand-gradient': 'var(--gradient-brand)',
      },
      borderRadius: {
        '2xl': '1.125rem',
        '3xl': '1.625rem',
      },
      maxWidth: {
        prose: '65ch',
      },
      keyframes: {
        'mkt-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-14px)' },
        },
      },
      animation: {
        'mkt-float': 'mkt-float 7s ease-in-out infinite',
      },
    },
  },
};
