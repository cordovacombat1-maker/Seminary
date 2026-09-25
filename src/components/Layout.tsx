import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Layout({ children }: { children: ReactNode }) {
  const { session, isAdmin, profile, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-burgundy-50 text-burgundy-800' : 'text-stone-700 hover:bg-stone-100'}`;
  const nav = session ? (
    <>
      <NavLink to="/dashboard" className={link} onClick={() => setOpen(false)}>Dashboard</NavLink>
      <NavLink to="/library" className={link} onClick={() => setOpen(false)}>Library</NavLink>
      <NavLink to="/transcript" className={link} onClick={() => setOpen(false)}>Transcript</NavLink>
      <NavLink to="/account" className={link} onClick={() => setOpen(false)}>Account</NavLink>
      {isAdmin && <NavLink to="/admin" className={link} onClick={() => setOpen(false)}>Admin</NavLink>}
      <button
        className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-stone-700 hover:bg-stone-100"
        onClick={async () => {
          await logout();
          setOpen(false);
          navigate('/');
        }}
      >
        Log out
      </button>
    </>
  ) : (
    <>
      <NavLink to="/login" className={link} onClick={() => setOpen(false)}>Log in</NavLink>
      <NavLink to="/signup" className={link} onClick={() => setOpen(false)}>Sign up</NavLink>
    </>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-20 border-b border-stone-200 bg-parchment/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to={session ? '/dashboard' : '/'} className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="font-serif text-xl font-bold text-burgundy-800">Seminary</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">{nav}</nav>
          <button className="btn-ghost md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        {open && <nav className="space-y-1 border-t border-stone-200 px-4 py-2 md:hidden">{nav}</nav>}
        {session && profile && !profile.full_name && (
          <div className="bg-gold-400/20 px-4 py-2 text-center text-sm">
            Please <Link to="/account" className="font-medium underline">add your name</Link> — it will appear on your certificates.
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="no-print border-t border-stone-200 py-6 text-center text-xs text-stone-500">
        <p>Certificates of completion only — this is not an accredited degree program.</p>
        <p className="mt-1">
          <Link to="/attribution" className="underline">Sources &amp; attribution</Link> · Scripture: Berean Standard Bible (public domain) · Greek &amp; Hebrew data: STEPBible.org (CC BY 4.0)
        </p>
      </footer>
    </div>
  );
}
