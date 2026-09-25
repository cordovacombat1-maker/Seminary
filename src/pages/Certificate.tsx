import { Link, useParams } from 'react-router-dom';
import { Alert, Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';
import { getCourse } from '../lib/curriculum';
import { useProgress } from '../lib/progress';

export default function CertificatePage() {
  const { courseId } = useParams();
  const course = getCourse(courseId);
  const { session } = useAuth();
  const { data, error } = useProgress(session?.user.id);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const cert = data.certificates.find((c) => c.course_id === courseId);
  if (!course || !cert) return <Alert kind="info">This certificate becomes available when you complete every lesson in the course.</Alert>;
  const date = new Date(cert.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap justify-between gap-2">
        <Link to={`/course/${course.id}`} className="text-sm text-burgundy-700 underline">← {course.title}</Link>
        <button className="btn-primary" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <div className="mx-auto aspect-[1.414/1] w-full max-w-4xl bg-white p-3 shadow-lg print:shadow-none">
        <div className="flex h-full flex-col items-center justify-center border-[6px] border-double border-burgundy-700 p-6 text-center sm:p-12">
          <p className="font-serif text-sm uppercase tracking-[0.3em] text-stone-500 sm:text-base">Seminary</p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-burgundy-800 sm:mt-6 sm:text-5xl">Certificate of Completion</h1>
          <p className="mt-4 font-serif text-base italic text-stone-600 sm:mt-8 sm:text-lg">This certifies that</p>
          <p className="mt-2 border-b border-stone-400 px-8 pb-1 font-serif text-2xl font-semibold sm:text-4xl">{cert.student_name}</p>
          <p className="mt-4 font-serif text-base italic text-stone-600 sm:text-lg">has completed the course</p>
          <p className="mt-2 font-serif text-xl font-semibold text-burgundy-800 sm:text-3xl">{cert.course_title}</p>
          <p className="mt-4 font-serif text-stone-700 sm:mt-8">{date}</p>
          <p className="mt-6 max-w-xl text-[10px] leading-snug text-stone-500 sm:mt-10 sm:text-xs">
            This certificate recognizes the completion of a non-accredited course of study. It is not an academic degree, diploma, or accredited credential.
            Certificate ID: {cert.id}
          </p>
        </div>
      </div>
    </div>
  );
}
