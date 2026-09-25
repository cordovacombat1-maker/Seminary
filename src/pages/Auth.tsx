import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui';
import { db } from '../lib/config';

function friendlyAuthError(msg: string): string {
  if (/invalid login/i.test(msg)) return 'That email and password don’t match. Please try again.';
  if (/already registered|already exists/i.test(msg)) return 'An account with that email already exists. Try logging in instead.';
  if (/password should be|weak/i.test(msg)) return 'Please choose a stronger password (at least 8 characters).';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link we sent.';
  if (/rate limit/i.test(msg)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/fetch|network/i.test(msg)) return 'Could not connect. Check your internet connection and try again.';
  return msg;
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6 sm:p-8">
        <h1 className="mb-6 text-2xl font-bold text-burgundy-800">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(friendlyAuthError(error.message));
    else navigate(from, { replace: true });
  };
  return (
    <AuthCard title="Log in">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <div className="flex justify-between text-sm">
          <Link to="/reset-password" className="text-burgundy-700 underline">Forgot password?</Link>
          <Link to="/signup" className="text-burgundy-700 underline">Create an account</Link>
        </div>
      </form>
    </AuthCard>
  );
}

export function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Please choose a password of at least 8 characters.');
    setBusy(true);
    setError(null);
    const { data, error } = await db().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setBusy(false);
    if (error) return setError(friendlyAuthError(error.message));
    if (data.session) navigate('/dashboard');
    else setSent(true);
  };
  if (sent)
    return (
      <AuthCard title="Check your email">
        <p className="text-stone-700">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then log in.</p>
        <Link to="/login" className="btn-primary mt-6 w-full">Go to log in</Link>
      </AuthCard>
    );
  return (
    <AuthCard title="Create your account">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="name">Full name (as it should appear on certificates)</label>
          <input id="name" required className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (8+ characters)</label>
          <input id="password" type="password" required minLength={8} className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating account…' : 'Sign up'}</button>
        <p className="text-center text-sm">Already have an account? <Link to="/login" className="text-burgundy-700 underline">Log in</Link></p>
      </form>
    </AuthCard>
  );
}

export function ResetPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/update-password` });
    setBusy(false);
    if (error) setError(friendlyAuthError(error.message));
    else setSent(true);
  };
  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <Alert kind="success">If an account exists for {email}, we’ve emailed a link to reset the password.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>Send reset link</button>
        </form>
      )}
    </AuthCard>
  );
}

export function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Please choose a password of at least 8 characters.');
    const { error } = await db().auth.updateUser({ password });
    if (error) setError(friendlyAuthError(error.message));
    else {
      setDone(true);
      setTimeout(() => navigate('/dashboard'), 1500);
    }
  };
  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <Alert kind="success">Password updated. Taking you to your dashboard…</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <label className="label" htmlFor="password">New password</label>
            <input id="password" type="password" required minLength={8} className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary w-full">Save new password</button>
        </form>
      )}
    </AuthCard>
  );
}
