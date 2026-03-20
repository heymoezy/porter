// Porter Design System Tokens
// Source of truth for all design decisions. New React components use these.
// Maps to existing CSS custom properties from Phase 1 CSS audit.

export const colors = {
  // Semantic — bridge to existing :root CSS variables
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  raised: 'var(--raised)',
  border: 'var(--border)',
  border2: 'var(--border2)',
  accent: 'var(--accent)',
  accentHover: 'var(--accent-h, #818cf8)',
  text: 'var(--text)',
  text2: 'var(--text2)',
  text3: 'var(--text3)',
  danger: 'var(--danger)',
  success: 'var(--success, #22c55e)',
  warning: 'var(--warning, #f59e0b)',

  // Raw values (for JS-driven animation where CSS vars can't be interpolated)
  raw: {
    accent: '#6366f1',
    accentGlow: 'rgba(99, 102, 241, 0.3)',
    bg: '#111827',
    surface: '#1E2736',
    text: '#F1F5F9',
  },
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
  page: '28px',    // Standard module padding (from Playwright tests: 28px)
} as const;

export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sizes: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '2rem',    // 32px
    '4xl': '2.5rem',  // 40px
    display: '3.5rem', // 56px — hero text
  },
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeights: {
    tight: '1.2',
    base: '1.5',
    relaxed: '1.75',
  },
} as const;

export const animation = {
  // Timing functions — "alive" feeling per Polsia reference
  springy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  snappy: 'cubic-bezier(0.2, 0, 0, 1)',

  // Durations
  fast: '150ms',
  normal: '300ms',
  slow: '500ms',
  dramatic: '800ms',

  // Framer Motion presets
  spring: { type: 'spring' as const, stiffness: 300, damping: 25 },
  gentle: { type: 'spring' as const, stiffness: 200, damping: 30 },
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 15 },
} as const;

export const elevation = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.2)',
  md: '0 4px 12px rgba(0, 0, 0, 0.25)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.3)',
  glow: `0 0 20px rgba(99, 102, 241, 0.3)`,
  accentGlow: `0 0 40px rgba(99, 102, 241, 0.3), 0 0 80px rgba(99, 102, 241, 0.15)`,
} as const;

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  xl: '24px',
  full: '9999px',
} as const;

export const tokens = { colors, spacing, typography, animation, elevation, radius } as const;
export default tokens;
