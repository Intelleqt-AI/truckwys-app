/** @type {import('tailwindcss').Config} */
// Truckwys design tokens → NativeWind theme ("v3", mirrors the web's theme.css).
// Every colour resolves to a CSS variable injected by ThemeProvider (src/theme/
// tokens.ts is the source of truth), so dark/light — and the status hues — swap
// together. global.css holds the same values as a pre-hydration fallback.
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Surfaces
        'bg-deep': 'var(--bg-deep)',
        surface: 'var(--bg-surface)',
        'surface-hover': 'var(--bg-surface-hover)',
        raised: 'var(--bg-raised)',
        elevated: 'var(--bg-elevated)',
        input: 'var(--bg-input)',
        backdrop: 'var(--backdrop)',
        // Borders / hairlines
        line: 'var(--border-subtle)',
        'line-active': 'var(--border-active)',
        'line-row': 'var(--border-row)',
        'line-strong': 'var(--border-strong)',
        'line-control': 'var(--border-control)',
        // Accent: data, links, focus, selected marks — not a fill
        accent: 'var(--accent-primary)',
        'accent-dim': 'var(--accent-dim)',
        link: 'var(--link)',
        // Text
        fg: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        faint: 'var(--text-tertiary)',
        disabled: 'var(--text-disabled)',
        'on-accent': 'var(--text-on-accent)',
        // Buttons (ink primary)
        'btn-primary': 'var(--btn-primary-bg)',
        'btn-primary-fg': 'var(--btn-primary-fg)',
        'btn-danger': 'var(--btn-danger-bg)',
        'btn-danger-fg': 'var(--btn-danger-fg)',
        // Status: bare = text colour, `-dot` = dots/marks, `-bg` = banners only
        success: 'var(--status-success-text)',
        'success-dot': 'var(--status-success-dot)',
        'success-bg': 'var(--status-success-bg)',
        warning: 'var(--status-warning-text)',
        'warning-dot': 'var(--status-warning-dot)',
        'warning-bg': 'var(--status-warning-bg)',
        danger: 'var(--status-danger-text)',
        'danger-dot': 'var(--status-danger-dot)',
        'danger-bg': 'var(--status-danger-bg)',
        info: 'var(--status-info-text)',
        'info-dot': 'var(--status-info-dot)',
        'info-bg': 'var(--status-info-bg)',
        neutral: 'var(--status-neutral-text)',
        'neutral-dot': 'var(--status-neutral-dot)',
        'neutral-bg': 'var(--status-neutral-bg)',
        // Quote pipeline stages — folded onto the status tones (v3 has no
        // per-stage hues): draft neutral, sent/transit info, accepted/completed success.
        'stage-draft': 'var(--status-neutral-dot)',
        'stage-sent': 'var(--status-info-dot)',
        'stage-accepted': 'var(--status-success-dot)',
        'stage-transit': 'var(--status-info-dot)',
        'stage-completed': 'var(--status-success-dot)',
        // Confidence
        'conf-high': 'var(--status-success-text)',
        'conf-medium': 'var(--status-warning-text)',
        'conf-low': 'var(--status-danger-text)',
      },
      fontFamily: {
        sans: ['System'],
      },
      // Web v3 scale, phone-adapted. Names are unchanged so existing classes
      // keep working; body stays 15 (web is 14) for touch readability.
      fontSize: {
        figure: ['32px', { lineHeight: '38px', letterSpacing: '-0.96px' }],
        display: ['24px', { lineHeight: '30px', letterSpacing: '-0.6px' }],
        title: ['20px', { lineHeight: '26px', letterSpacing: '-0.2px' }],
        heading: ['15px', { lineHeight: '22px', letterSpacing: '-0.15px' }],
        body: ['15px', { lineHeight: '22px' }],
        callout: ['14px', { lineHeight: '20px' }],
        sub: ['13px', { lineHeight: '20px' }],
        caption: ['12px', { lineHeight: '16px' }],
        micro: ['11px', { lineHeight: '16px' }],
        nano: ['10px', { lineHeight: '13px' }],
      },
      letterSpacing: {
        body: '-0.01em',
        display: '-0.025em',
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        pill: '100px',
        // Role-based radius scale — see src/theme/tokens.ts `radius` for the
        // JS-style equivalents. Matches the web: chip 6, control 8, card/menu 12,
        // sheet/dialog 16.
        chip: '6px',
        control: '8px',
        card: '12px',
        menu: '12px',
        panel: '16px',
      },
      spacing: {
        screen: '16px',
      },
    },
  },
  plugins: [],
};
