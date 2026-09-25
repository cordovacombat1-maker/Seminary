import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Alert, Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Account from './pages/Account';
import Admin from './pages/Admin';
import Attribution from './pages/Attribution';
import { Login, ResetPassword, Signup, UpdatePassword } from './pages/Auth';
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
  const { config, configError } = useAuth();
  if (configError) return <Alert>We could not load the site settings. Please refresh the page in a moment.</Alert>;
  if (config?.missing.length) {
    return (
      <Alert kind="info">
        This site isn&apos;t fully set up yet. (Administrator: add {config.missing.join(', ')} in Netlify&apos;s environment variables,
        then redeploy. See the README.)
      </Alert>
    );
  }
  return null;
}

export default function App() {
  const { ready, config, passwordRecovery } = useAuth();
  if (!ready) return <Layout><Spinner /></Layout>;
  const connected = !!config?.supabaseUrl && !!config?.supabaseAnonKey;
  return (
    <Layout>
      <SetupNotice />
      {passwordRecovery && <Navigate to="/update-password" replace />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/attribution" element={<Attribution />} />
        {connected && (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
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
