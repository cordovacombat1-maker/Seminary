import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, PageTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import { db } from '../lib/config';

export default function Account() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const { error } = await db().from('profiles').update({ full_name: name.trim() }).eq('id', profile.id);
    if (error) setMsg({ kind: 'error', text: 'Could not save your name. Please try again.' });
    else {
      setMsg({ kind: 'success', text: 'Saved. New certificates will use this name.' });
      await refreshProfile();
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
        <p className="text-sm"><Link to="/reset-password" className="text-burgundy-700 underline">Change password</Link></p>
      </form>
    </div>
  );
}
