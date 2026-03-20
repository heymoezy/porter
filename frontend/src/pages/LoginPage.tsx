import { useState, useEffect } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { colors, spacing, typography, animation, elevation, radius } from '../design-system/tokens';

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.bg,
    padding: spacing.md,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  // Animated background grid
  grid: {
    position: 'absolute' as const,
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(99, 102, 241, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(99, 102, 241, 0.04) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none' as const,
  },
  // Radial glow behind card
  glow: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
  },
  wordmark: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.bold,
    letterSpacing: '-0.04em',
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: spacing.xs,
    lineHeight: typography.lineHeights.tight,
  },
  tagline: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    color: colors.text3,
    textAlign: 'center' as const,
    marginBottom: spacing['2xl'],
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  card: {
    background: 'rgba(30, 39, 54, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid rgba(99, 102, 241, 0.2)`,
    borderRadius: radius.lg,
    padding: `${spacing['2xl']} ${spacing['2xl']}`,
    width: '100%',
    maxWidth: '400px',
    boxShadow: `${elevation.lg}, ${elevation.glow}`,
    position: 'relative' as const,
    zIndex: 1,
  },
  formTitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
    marginTop: 0,
  },
  formSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    color: colors.text3,
    marginBottom: spacing.xl,
    marginTop: 0,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  label: {
    display: 'block',
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text2,
    marginBottom: spacing.xs,
  },
  inputBase: {
    width: '100%',
    padding: `${spacing.sm} ${spacing.md}`,
    background: 'rgba(17, 24, 39, 0.6)',
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.base,
    color: colors.text,
    outline: 'none',
    transition: `border-color ${animation.fast} ${animation.smooth}, box-shadow ${animation.fast} ${animation.smooth}`,
    boxSizing: 'border-box' as const,
  },
  errorBox: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    marginBottom: spacing.md,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    color: '#f87171',
  },
  submitBtn: {
    width: '100%',
    padding: `${spacing.md} ${spacing.md}`,
    background: `linear-gradient(135deg, ${colors.raw.accent} 0%, #818cf8 100%)`,
    border: 'none',
    borderRadius: radius.md,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: '#ffffff',
    cursor: 'pointer',
    marginTop: spacing.lg,
    transition: `opacity ${animation.fast} ${animation.smooth}, transform ${animation.fast} ${animation.springy}, box-shadow ${animation.fast} ${animation.smooth}`,
    boxShadow: `0 4px 15px rgba(99, 102, 241, 0.4)`,
  },
  footerText: {
    textAlign: 'center' as const,
    fontFamily: typography.fontFamily,
    fontSize: typography.sizes.sm,
    color: colors.text3,
    marginTop: spacing.lg,
  },
  link: {
    color: colors.accent,
    textDecoration: 'none',
    fontWeight: typography.weights.medium,
  },
};

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const wordmarkControls = useAnimationControls();

  // Wordmark breathing animation
  useEffect(() => {
    const breathe = async () => {
      while (true) {
        await wordmarkControls.start({
          y: [-3, 3],
          transition: { duration: 3, ease: 'easeInOut', repeat: 0 },
        });
        await wordmarkControls.start({
          y: [3, -3],
          transition: { duration: 3, ease: 'easeInOut', repeat: 0 },
        });
      }
    };
    breathe();
  }, [wordmarkControls]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.ok || data.data)) {
        window.location.href = '/';
      } else {
        setError(data?.error?.message || data?.message || 'Invalid username or password');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (field: string) => ({
    ...styles.inputBase,
    borderColor: focusedField === field ? colors.raw.accent : 'var(--border)',
    boxShadow: focusedField === field ? `0 0 0 3px rgba(99, 102, 241, 0.15)` : 'none',
  });

  return (
    <div style={styles.page}>
      {/* Background grid */}
      <div style={styles.grid} />
      {/* Radial glow */}
      <div style={styles.glow} />

      {/* Wordmark */}
      <motion.div
        animate={wordmarkControls}
        initial={{ y: 0 }}
        style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...animation.gentle, delay: 0.1 }}
        >
          <div style={styles.wordmark}>PORTER</div>
          <div style={styles.tagline}>Intelligent workspace</div>
        </motion.div>
      </motion.div>

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...animation.spring, delay: 0.2 }}
        style={styles.card}
      >
        <h2 style={styles.formTitle}>Welcome back</h2>
        <p style={styles.formSubtitle}>Sign in to your workspace</p>

        {error && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={animation.spring}
            style={styles.errorBox}
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={styles.fieldGroup}>
            <label htmlFor="uname" style={styles.label}>Username</label>
            <input
              id="uname"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocusedField('uname')}
              onBlur={() => setFocusedField(null)}
              style={inputStyle('uname')}
              placeholder="Enter your username"
              autoComplete="username"
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="pw" style={styles.label}>Password</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('pw')}
              onBlur={() => setFocusedField(null)}
              style={inputStyle('pw')}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <motion.button
            type="submit"
            className="login-btn"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            whileHover={{ scale: 1.02, boxShadow: '0 6px 25px rgba(99, 102, 241, 0.55)' }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </motion.button>
        </form>

        <p style={styles.footerText}>
          Don't have an account?{' '}
          <a href="/v2/register" style={styles.link}>Register</a>
        </p>
      </motion.div>
    </div>
  );
}
