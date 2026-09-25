import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui';
import { useAuth } from '../lib/auth';

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
  const { login } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { signup, config } = useAuth();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Please choose a password of at least 8 characters.');
    setBusy(true);
    setError(null);
    try {
      await signup(email.trim(), password, name.trim());
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Create your account">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {config && !config.hasAccounts && (
          <Alert kind="info">You are the first person to sign up, so this account will be the site administrator.</Alert>
        )}
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
  return (
    <AuthCard title="Forgot your password?">
      <p className="text-stone-700">
        Please contact the person who runs this site. They can set a temporary password for you from the Admin page, and you can
        change it under <strong>Account</strong> after you log in.
      </p>
      <Link to="/login" className="btn-primary mt-6 w-full">Back to log in</Link>
    </AuthCard>
  );
}
