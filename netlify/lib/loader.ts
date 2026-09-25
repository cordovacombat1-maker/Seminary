// One-time loading of the Bible, STEPBible and library texts into the database, run from the
// Admin page ("Load texts"). The page calls one step at a time, so each request stays short;
// steps can be re-run safely and finished steps are skipped.
import { VOLUMES, type Volume } from '../../shared/library';
import { query } from './db';
import { loadBsb, loadKjv, loadWeb, uniqueVerses, type BibleRow } from './ingest/bible';
import { buildChunks, getText } from './ingest/library';
import { dedupeWords, getFile, parseLexicon, parseMorphology, parseProperNames, parseTagnt, parseTahot } from './ingest/stepbible';

export interface LoadStep {
  id: string;
  label: string;
  group: 'Bible' | 'Greek & Hebrew' | 'Library' | 'Library (extra)';
  run: () => Promise<{ rows: number; detail: string }>;
}

export class SkipStep extends Error {}

const TABLE_KEYS: Record<string, string> = {
  bible_verses: '(translation, book, chapter, verse)',
  original_words: '(language, book, chapter, verse, word_num)',
  lexicon: '(strongs)',
  morphology_codes: '(code)',
  library_chunks: '(volume_id, chunk_index)',
  proper_names: '',
};

/** Insert rows in ~2 MB batches using jsonb_populate_recordset (one round trip per batch). */
export async function bulkInsert(table: keyof typeof TABLE_KEYS, rows: object[]): Promise<number> {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const conflict = TABLE_KEYS[table] ? `on conflict ${TABLE_KEYS[table]} do nothing` : '';
  let batch: object[] = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    await query(
      `insert into ${table} (${cols.join(', ')})
       select ${cols.join(', ')} from jsonb_populate_recordset(null::${table}, $1::jsonb) ${conflict}`,
      [JSON.stringify(batch)],
    );
    batch = [];
    size = 0;
  };
  for (const r of rows) {
    batch.push(r);
    size += JSON.stringify(r).length;
    if (size > 2_000_000) await flush();
  }
  await flush();
  return rows.length;
}

async function bibleStep(name: string, loader: () => Promise<BibleRow[]>) {
  const rows = uniqueVerses(await loader());
  if (rows.length < 30000) throw new Error(`Only ${rows.length} verses of the ${name} could be downloaded (expected about 31,000). Try again later.`);
  return { rows: await bulkInsert('bible_verses', rows), detail: `${rows.length.toLocaleString()} verses` };
}

async function wordsStep(keys: string[], parse: (t: string) => ReturnType<typeof parseTagnt>) {
  let n = 0;
  for (const k of keys) n += await bulkInsert('original_words', dedupeWords(parse(await getFile(k))));
  return { rows: n, detail: `${n.toLocaleString()} words` };
}

async function libraryStep(vol: Volume) {
  if (!vol.sources.some((s) => s.type !== 'manual')) {
    throw new SkipStep('No reliable free online copy to download automatically; this book is optional.');
  }
  const got = await getText(vol);
  if (!got) throw new Error(`Could not download a verified copy from ${vol.sourceUrl}. The site may be busy — try again later.`);
  const rows = buildChunks(vol, got.text, got.url);
  await query('delete from library_chunks where volume_id = $1', [vol.id]);
  await bulkInsert('library_chunks', rows);
  return { rows: rows.length, detail: `${rows.length.toLocaleString()} passages from ${got.url}` };
}

export const LOAD_STEPS: LoadStep[] = [
  { id: 'bible-bsb', label: 'Berean Standard Bible', group: 'Bible', run: () => bibleStep('BSB', loadBsb) },
  { id: 'bible-kjv', label: 'King James Version', group: 'Bible', run: () => bibleStep('KJV', loadKjv) },
  { id: 'bible-web', label: 'World English Bible', group: 'Bible', run: () => bibleStep('WEB', loadWeb) },
  {
    id: 'step-morphology',
    label: 'Greek & Hebrew grammar codes (TEGMC, TEHMC)',
    group: 'Greek & Hebrew',
    run: async () => {
      const rows = [...parseMorphology(await getFile('TEGMC'), 'greek'), ...parseMorphology(await getFile('TEHMC'), 'hebrew')];
      return { rows: await bulkInsert('morphology_codes', rows), detail: `${rows.length.toLocaleString()} codes` };
    },
  },
  {
    id: 'step-lexicon-greek',
    label: 'Greek lexicon (TBESG)',
    group: 'Greek & Hebrew',
    run: async () => {
      const rows = parseLexicon(await getFile('TBESG'), 'greek');
      return { rows: await bulkInsert('lexicon', rows), detail: `${rows.length.toLocaleString()} entries` };
    },
  },
  {
    id: 'step-lexicon-hebrew',
    label: 'Hebrew lexicon (TBESH)',
    group: 'Greek & Hebrew',
    run: async () => {
      const rows = parseLexicon(await getFile('TBESH'), 'hebrew');
      return { rows: await bulkInsert('lexicon', rows), detail: `${rows.length.toLocaleString()} entries` };
    },
  },
  { id: 'step-greek-1', label: 'Greek New Testament: Matthew–John (TAGNT)', group: 'Greek & Hebrew', run: () => wordsStep(['TAGNT1'], parseTagnt) },
  { id: 'step-greek-2', label: 'Greek New Testament: Acts–Revelation (TAGNT)', group: 'Greek & Hebrew', run: () => wordsStep(['TAGNT2'], parseTagnt) },
  { id: 'step-hebrew-1', label: 'Hebrew Old Testament: Genesis–Deuteronomy (TAHOT)', group: 'Greek & Hebrew', run: () => wordsStep(['TAHOT1'], parseTahot) },
  { id: 'step-hebrew-2', label: 'Hebrew Old Testament: Joshua–Esther (TAHOT)', group: 'Greek & Hebrew', run: () => wordsStep(['TAHOT2'], parseTahot) },
  { id: 'step-hebrew-3', label: 'Hebrew Old Testament: Job–Song of Songs (TAHOT)', group: 'Greek & Hebrew', run: () => wordsStep(['TAHOT3'], parseTahot) },
  { id: 'step-hebrew-4', label: 'Hebrew Old Testament: Isaiah–Malachi (TAHOT)', group: 'Greek & Hebrew', run: () => wordsStep(['TAHOT4'], parseTahot) },
  {
    id: 'step-names',
    label: 'Proper names (TIPNR)',
    group: 'Greek & Hebrew',
    run: async () => {
      const rows = parseProperNames(await getFile('TIPNR'));
      await query('delete from proper_names');
      return { rows: await bulkInsert('proper_names', rows), detail: `${rows.length.toLocaleString()} names` };
    },
  },
  ...[...VOLUMES]
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'core' ? -1 : 1))
    .map(
      (vol): LoadStep => ({
        id: `library-${vol.id}`,
        label: vol.label,
        group: vol.priority === 'core' ? 'Library' : 'Library (extra)',
        run: () => libraryStep(vol),
      }),
    ),
];

export interface StepStatus {
  id: string;
  label: string;
  group: LoadStep['group'];
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  detail: string;
  rows: number;
}

export async function loadStatus(): Promise<StepStatus[]> {
  const rows = await query<{ id: string; status: StepStatus['status']; detail: string; rows_loaded: number }>('select id, status, detail, rows_loaded from load_steps');
  const byId = new Map(rows.map((r) => [r.id, r]));
  return LOAD_STEPS.map((s) => {
    const r = byId.get(s.id);
    return { id: s.id, label: s.label, group: s.group, status: r?.status ?? 'pending', detail: r?.detail ?? '', rows: r?.rows_loaded ?? 0 };
  });
}

async function setStatus(id: string, status: StepStatus['status'], detail: string, rows = 0) {
  await query(
    `insert into load_steps (id, status, detail, rows_loaded, updated_at) values ($1, $2, $3, $4, now())
     on conflict (id) do update set status = excluded.status, detail = excluded.detail, rows_loaded = excluded.rows_loaded, updated_at = now()`,
    [id, status, detail.slice(0, 500), rows],
  );
}

export async function runLoadStep(id: string, force = false): Promise<StepStatus> {
  const step = LOAD_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown step ${id}`);
  const current = (await loadStatus()).find((s) => s.id === id)!;
  if (current.status === 'done' && !force) return current;
  await setStatus(id, 'running', 'Downloading…');
  try {
    const { rows, detail } = await step.run();
    await setStatus(id, 'done', detail, rows);
  } catch (e) {
    if (e instanceof SkipStep) await setStatus(id, 'skipped', e.message);
    else {
      console.error(`load step ${id} failed`, e);
      await setStatus(id, 'failed', (e as Error).message || 'Failed');
    }
  }
  return (await loadStatus()).find((s) => s.id === id)!;
}
