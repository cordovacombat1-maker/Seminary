import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Alert, Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Account from './pages/Account';
import Admin from './pages/Admin';
import Attribution from './pages/Attribution';
import { Login, ResetPassword, Signup } from './pages/Auth';
import CertificatePage from './pages/Certificate';
import CoursePage from './pages/Course';
import Dashboard from './pages/Dashboard';
import DrillPage from './pages/Drill';
import Home from './pages/Home';
import LessonPage from './pages/Lesson';
import LibraryPage from './pages/Library';
import PaperPage from './pages/Paper';
import QuizPage from './pages/Quiz';
import Transcript from './pages/Transcript';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const loc = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

function SetupNotice() {
  const { config, configError, isAdmin } = useAuth();
  if (configError) return <Alert>We could not load the site settings. Please refresh the page in a moment.</Alert>;
  if (!config) return null;
  if (!config.database) {
    return <Alert kind="info">This site is still being set up (its database is created automatically on the first deploy). Please check back in a few minutes.</Alert>;
  }
  if (!config.ai) {
    return (
      <Alert kind="info">
        The AI tutor is not switched on yet.{' '}
        {isAdmin ? 'Netlify turns on its built-in AI automatically after the site’s first production deploy on a credit-based plan — see the README.' : 'Please check back soon.'}
      </Alert>
    );
  }
  if (isAdmin && !config.textsLoaded) {
    return (
      <Alert kind="info">
        Welcome! Next step: <Link className="underline" to="/admin">open the Admin page</Link> and click <strong>Load texts</strong> to load the Bible, Greek/Hebrew data and library.
      </Alert>
    );
  }
  return null;
}

export default function App() {
  const { ready, config } = useAuth();
  if (!ready) return <Layout><Spinner /></Layout>;
  const connected = !!config?.database;
  return (
    <Layout>
      <SetupNotice />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/attribution" element={<Attribution />} />
        {connected && (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/course/:courseId" element={<RequireAuth><CoursePage /></RequireAuth>} />
            <Route path="/lesson/:lessonId" element={<RequireAuth><LessonPage /></RequireAuth>} />
            <Route path="/lesson/:lessonId/quiz" element={<RequireAuth><QuizPage /></RequireAuth>} />
            <Route path="/lesson/:lessonId/drill" element={<RequireAuth><DrillPage /></RequireAuth>} />
            <Route path="/lesson/:lessonId/paper" element={<RequireAuth><PaperPage /></RequireAuth>} />
            <Route path="/transcript" element={<RequireAuth><Transcript /></RequireAuth>} />
            <Route path="/certificate/:courseId" element={<RequireAuth><CertificatePage /></RequireAuth>} />
            <Route path="/library" element={<RequireAuth><LibraryPage /></RequireAuth>} />
            <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          </>
        )}
        <Route path="*" element={<div className="py-10"><h1 className="text-2xl font-bold">Page not found</h1></div>} />
      </Routes>
    </Layout>
  );
}
