import { VOLUMES } from '../../shared/library';
import { PageTitle } from '../components/ui';

const TRADITION_ORDER = ['Patristic', 'Catholic', 'Lutheran', 'Reformed', 'Wesleyan', 'Anabaptist', 'Other'];

export default function Attribution() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 font-serif">
      <PageTitle sub="This school is built on the generosity of those who placed these texts and data in the public domain or under open licences.">Sources &amp; Attribution</PageTitle>

      <section>
        <h2 className="text-2xl font-bold text-burgundy-800">Greek and Hebrew data</h2>
        <p className="mt-2 leading-relaxed">
          Original-language texts, lexicons, morphology and proper-name data are from{' '}
          <a className="underline" href="https://www.stepbible.org" target="_blank" rel="noopener noreferrer">STEPBible.org</a>, produced by{' '}
          <a className="underline" href="https://tyndalehouse.com" target="_blank" rel="noopener noreferrer">Tyndale House, Cambridge</a>, and released under the{' '}
          <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 International licence (CC BY 4.0)</a>.
          Datasets used (from <a className="underline" href="https://github.com/STEPBible/STEPBible-Data" target="_blank" rel="noopener noreferrer">github.com/STEPBible/STEPBible-Data</a>):
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li><strong>TAGNT</strong> — Translators Amalgamated Greek New Testament</li>
          <li><strong>TAHOT</strong> — Translators Amalgamated Hebrew Old Testament</li>
          <li><strong>TBESG</strong> and <strong>TBESH</strong> — Translators Brief lexicons of Extended Strong’s for Greek and Hebrew</li>
          <li><strong>TEGMC</strong> and <strong>TEHMC</strong> — Translators Expansion of Greek and Hebrew Morphology Codes</li>
          <li><strong>TIPNR</strong> — Translators Individualised Proper Names with all References</li>
        </ul>
        <p className="mt-2 text-sm text-stone-600">
          The data has been reformatted into database tables for this app; the content is otherwise unchanged. STEPBible’s non-commercial datasets
          (such as TTESV) are not used.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-burgundy-800">Bible translations</h2>
        <ul className="mt-2 list-disc space-y-2 pl-6">
          <li>
            <strong>Berean Standard Bible (BSB)</strong> — The Holy Bible, Berean Standard Bible, BSB. Dedicated to the public domain on April 30, 2023.{' '}
            <a className="underline" href="https://berean.bible" target="_blank" rel="noopener noreferrer">berean.bible</a>
          </li>
          <li>
            <strong>World English Bible (WEB)</strong> — public domain. “World English Bible” is a trademark of eBible.org.{' '}
            <a className="underline" href="https://worldenglish.bible" target="_blank" rel="noopener noreferrer">worldenglish.bible</a> ·{' '}
            <a className="underline" href="https://ebible.org" target="_blank" rel="noopener noreferrer">ebible.org</a>
          </li>
          <li><strong>King James Version (KJV)</strong> — public domain (outside the United Kingdom, where Crown rights apply).</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-burgundy-800">The library</h2>
        <p className="mt-2 leading-relaxed">
          All library texts are public-domain editions (published before 1929), obtained from{' '}
          <a className="underline" href="https://ccel.org" target="_blank" rel="noopener noreferrer">the Christian Classics Ethereal Library (CCEL)</a>,{' '}
          <a className="underline" href="https://www.gutenberg.org" target="_blank" rel="noopener noreferrer">Project Gutenberg</a>, and the{' '}
          <a className="underline" href="https://archive.org" target="_blank" rel="noopener noreferrer">Internet Archive</a>. We are grateful to the volunteers of these projects.
        </p>
        {TRADITION_ORDER.map((t) => {
          const vols = VOLUMES.filter((v) => v.tradition === t);
          if (!vols.length) return null;
          return (
            <div key={t} className="mt-4">
              <h3 className="text-lg font-semibold">{t === 'Other' ? 'Other (Arminian, Anglican, historical)' : t}</h3>
              <ul className="mt-1 space-y-1 pl-6 text-sm leading-relaxed" style={{ listStyleType: 'disc' }}>
                {vols.map((v) => (
                  <li key={v.id}>
                    {v.label}. <span className="text-stone-600">{v.editor}.</span>{' '}
                    <a className="underline" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="text-2xl font-bold text-burgundy-800">Thirdmill video lessons</h2>
        <p className="mt-2 leading-relaxed">
          Some lessons include a “Watch: Thirdmill lesson” link. These links go to{' '}
          <a className="underline" href="https://thirdmill.org" target="_blank" rel="noopener noreferrer">thirdmill.org</a>, the website of Third Millennium Ministries,
          which owns that content. We only link to it; none of Thirdmill’s material is copied, hosted, or used to train or ground the tutor. This school is not affiliated with Third Millennium Ministries.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-burgundy-800">AI</h2>
        <p className="mt-2 leading-relaxed">
          Tutoring, quizzes and grading are provided by Anthropic’s Claude models. Library search uses Voyage AI embeddings. AI can make mistakes — every tutor
          message has a “Report an error” button, and reports are reviewed by the school.
        </p>
        <p className="mt-2 leading-relaxed">This program awards certificates of completion. It is not an accredited degree program.</p>
      </section>
    </div>
  );
}
