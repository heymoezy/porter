import { useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

const PorterLogo = () => (
  <svg width="40" height="40" viewBox="0 0 34 34" fill="none">
    <rect width="34" height="34" rx="8" fill="var(--accent)" />
    <rect x="10" y="9" width="4" height="16" rx="1.5" fill="white" />
    <rect x="10" y="9" width="10" height="4" rx="1.5" fill="white" />
    <rect x="10" y="16" width="10" height="4" rx="1.5" fill="white" />
    <rect x="20" y="9" width="4" height="11" rx="1.5" fill="white" />
  </svg>
);

const fieldStyle = {
  width: '100%',
  background: 'var(--raised)',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--radius)',
  padding: '10px 12px',
  fontSize: '14px',
  color: 'var(--text)',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color .15s, box-shadow .15s',
  boxSizing: 'border-box' as const,
};

const labelStyle = {
  display: 'block' as const,
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text2)',
  marginBottom: '6px',
};

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [shakeFields, setShakeFields] = useState(false);
  const cardControls = useAnimationControls();

  const triggerError = (msg: string) => {
    setError(msg);
    setShakeFields(true);
    cardControls.start({
      x: [0, -8, 8, -5, 5, -2, 2, 0],
      transition: { duration: 0.4 },
    });
    setTimeout(() => setShakeFields(false), 600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim()) { triggerError('Email is required.'); return; }
    if (!password.trim()) { triggerError('Password is required.'); return; }
    if (password !== confirm) { triggerError('Passwords don\'t match.'); return; }
    if (password.length < 6) { triggerError('Minimum 6 characters.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.ok || data.data)) {
        setSuccess('Account created!');
        setTimeout(() => { window.location.href = '/v2/login'; }, 1200);
      } else {
        triggerError(data?.error?.message || data?.message || 'Registration failed.');
      }
    } catch {
      triggerError('Can\'t reach Porter.');
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError('');
  const inputBorder = shakeFields ? 'var(--danger)' : 'var(--border2)';
  const focusHandler = (e: React.FocusEvent<HTMLInputElement>) => { if (!shakeFields) e.target.style.borderColor = 'var(--accent)'; };
  const blurHandler = (e: React.FocusEvent<HTMLInputElement>) => { if (!shakeFields) e.target.style.borderColor = 'var(--border2)'; };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <motion.div
        animate={cardControls}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '40px',
          width: '360px',
          boxShadow: '0 20px 60px rgba(0,0,0,.24)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <PorterLogo />
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.4px' }}>
              Porter
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase' as const, marginTop: '3px' }}>
              Create your account
            </div>
          </div>
        </div>

        {/* Success */}
        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              marginBottom: '16px', padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)',
              color: '#4ade80', fontSize: '13px',
            }}
          >
            {success}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="reg-email" style={labelStyle}>Email</label>
            <input id="reg-email" type="email" value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              autoComplete="email" autoFocus
              style={{ ...fieldStyle, borderColor: inputBorder }}
              onFocus={focusHandler} onBlur={blurHandler} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="reg-password" style={labelStyle}>Password</label>
            <input id="reg-password" type="password" value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              autoComplete="new-password"
              style={{ ...fieldStyle, borderColor: inputBorder }}
              onFocus={focusHandler} onBlur={blurHandler} />
          </div>

          <div style={{ marginBottom: '4px' }}>
            <label htmlFor="reg-confirm" style={labelStyle}>Confirm password</label>
            <input id="reg-confirm" type="password" value={confirm}
              onChange={(e) => { setConfirm(e.target.value); clearError(); }}
              autoComplete="new-password"
              style={{ ...fieldStyle, borderColor: inputBorder }}
              onFocus={focusHandler} onBlur={blurHandler} />
          </div>

          {/* Inline error */}
          <div style={{ minHeight: '24px', display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            {error && (
              <motion.span
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ fontSize: '12px', color: '#f87171', fontWeight: 500 }}
              >
                {error}
              </motion.span>
            )}
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%', padding: '11px',
              borderRadius: 'var(--radius)',
              background: 'var(--accent)', color: '#FFFFFF',
              border: 'none', fontSize: '14px', fontWeight: 700,
              fontFamily: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: '.12s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </motion.button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <a href="/v2/login"
            style={{ fontSize: '12px', color: 'var(--text3)', textDecoration: 'none', transition: '.15s' }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text3)'; }}
          >
            Already have an account? Sign in
          </a>
        </div>
      </motion.div>
    </div>
  );
}
