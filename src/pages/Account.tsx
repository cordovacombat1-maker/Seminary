import { useState, type FormEvent } from 'react';
import { Alert, PageTitle } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type Msg = { kind: 'success' | 'error'; text: string } | null;

export default function Account() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [msg, setMsg] = useState<Msg>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'update_name', fullName: name.trim() }) });
      setMsg({ kind: 'success', text: 'Saved. New certificates will use this name.' });
      await refreshProfile();
    } catch (err) {
      setMsg({ kind: 'error', text: (err as Error).message });
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'change_password', currentPassword: current, newPassword: next }) });
      setPwMsg({ kind: 'success', text: 'Password changed.' });
      setCurrent('');
      setNext('');
    } catch (err) {
      setPwMsg({ kind: 'error', text: (err as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageTitle>Account</PageTitle>
      <form onSubmit={save} className="card space-y-4 p-6">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <p className="text-sm text-stone-600">Email: {profile?.email}</p>
        <div>
          <label className="label" htmlFor="name">Full name (shown on certificates)</label>
          <input id="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary">Save</button>
      </form>
      <form onSubmit={changePassword} className="card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Change password</h2>
        {pwMsg && <Alert kind={pwMsg.kind}>{pwMsg.text}</Alert>}
        <div>
          <label className="label" htmlFor="current">Current password</label>
          <input id="current" type="password" autoComplete="current-password" className="input" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="new">New password (8+ characters)</label>
          <input id="new" type="password" autoComplete="new-password" minLength={8} className="input" required value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <button className="btn-primary">Change password</button>
      </form>
    </div>
  );
}
