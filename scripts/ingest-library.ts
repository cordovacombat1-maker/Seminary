// npm run ingest:library              -> loads the "core" volumes (fits Supabase's free plan)
// npm run ingest:library -- --all     -> loads every volume (needs a paid Supabase plan: ~2-3 GB)
// npm run ingest:library -- calvin-institutes aquinas-summa   -> only these volume ids
// npm run ingest:library -- --list    -> show volumes and whether they are loaded
// Add --force to re-load a volume that is already loaded.
//
// For each volume: download a public-domain text (Project Gutenberg or CCEL, or a file you put in
// scripts/library-texts/<volume-id>.txt), check it is the right book, split it into ~800-token chunks
// with ~100-token overlap, embed each chunk with Voyage AI (voyage-3), and store it in library_chunks.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chunkSections, splitIntoSections, type Chunk } from '../shared/chunk';
import { VOLUMES, WORKS, type Volume, type Work } from '../shared/library';
import { embed } from '../netlify/lib/voyage';
import { download, isMain, loadEnv, requireEnv, ROOT, supabaseAdmin, withRetry } from './lib';

const MANUAL_DIR = path.join(ROOT, 'scripts', 'library-texts');

// ---------- downloading ----------

let catalog: { id: string; title: string; authors: string; language: string; type: string }[] | null = null;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function gutenbergIds(title: string, author: string): Promise<string[]> {
  if (!catalog) {
    const csv = await download('https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv', 'gutenberg-catalog.csv');
    catalog = [];
    if (csv) {
      // records can contain newlines inside quotes; join lines until quotes balance
      let buf = '';
      for (const line of csv.split('\n').slice(1)) {
        buf = buf ? `${buf}\n${line}` : line;
        if ((buf.match(/"/g)?.length ?? 0) % 2) continue;
        const c = parseCsvLine(buf);
        buf = '';
        catalog.push({ id: c[0], type: c[1], title: c[3] ?? '', language: c[4] ?? '', authors: c[5] ?? '' });
      }
    }
  }
  const t = title.toLowerCase();
  const a = author.toLowerCase();
  return catalog
    .filter((b) => b.type === 'Text' && b.language.includes('en') && b.title.toLowerCase().includes(t) && b.authors.toLowerCase().includes(a))
    .map((b) => b.id);
}

async function fromGutenberg(vol: Volume, title: string, author: string): Promise<{ text: string; url: string } | null> {
  for (const id of await gutenbergIds(title, author)) {
    for (const url of [`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, `https://www.gutenberg.org/files/${id}/${id}-0.txt`]) {
      const text = await download(url, `${vol.id}-pg${id}.txt`);
      if (text && verified(vol, text)) return { text: stripGutenberg(text), url: `https://www.gutenberg.org/ebooks/${id}` };
    }
  }
  return null;
}

async function fromCcel(vol: Volume, p: string): Promise<{ text: string; url: string } | null> {
  const [author, work] = p.split('/');
  const candidates: string[] = [];
  // Look on the book's page for its plain-text download link
  for (const page of [`https://ccel.org/ccel/${p}.html`, `https://www.ccel.org/ccel/${p}.html`, `https://ccel.org/ccel/${p}`]) {
    const html = await download(page, `${vol.id}-ccel-page.html`);
    if (!html) continue;
    for (const m of html.matchAll(/href="([^"]+\.txt)"/g)) candidates.push(new URL(m[1], page).href);
    if (candidates.length) break;
  }
  candidates.push(
    `https://ccel.org/ccel/${author[0]}/${author}/${work}/cache/${work}.txt`,
    `https://www.ccel.org/ccel/${author}/${work}.txt`,
    `https://ccel.org/ccel/${author}/${work}/cache/${work}.txt`,
  );
  for (const url of [...new Set(candidates)]) {
    const text = await download(url, `${vol.id}-ccel-${Buffer.from(url).toString('base64url').slice(-20)}.txt`);
    if (text && !/^\s*<!doctype html/i.test(text) && verified(vol, text)) return { text, url: `https://ccel.org/ccel/${p}` };
  }
  return null;
}

function verified(vol: Volume, text: string): boolean {
  return text.length > 20_000 && vol.verify.some((v) => text.includes(v));
}

export function stripGutenberg(text: string): string {
  const start = text.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);
  const end = text.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  let t = text;
  if (end > 0) t = t.slice(0, end);
  if (start >= 0) t = t.slice(t.indexOf('\n', start) + 1);
  return t;
}

async function getText(vol: Volume): Promise<{ text: string; url: string } | null> {
  const manual = path.join(MANUAL_DIR, `${vol.id}.txt`);
  if (existsSync(manual)) {
    const text = readFileSync(manual, 'utf8');
    if (verified(vol, text)) return { text: stripGutenberg(text), url: vol.sourceUrl };
    console.warn(`  ${manual} does not look like the right book (none of: ${vol.verify.join(', ')}). Ignoring it.`);
  }
  for (const s of vol.sources) {
    if (s.type === 'gutenberg') {
      const r = await fromGutenberg(vol, s.title, s.author);
      if (r) return r;
    } else if (s.type === 'ccel') {
      const r = await fromCcel(vol, s.path);
      if (r) return r;
    }
  }
  return null;
}

// ---------- attributing text to works inside a volume ----------

const isHeadingLike = (line: string) => {
  const t = line.trim();
  if (t.length < 4 || t.length > 120) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return letters.length >= 4 && letters === letters.toUpperCase();
};

/**
 * Split a volume's text into segments, one per work, using upper-case heading lines that match a
 * work's headingPatterns. Text before any match (or in a single-work volume) goes to the default.
 */
export function segmentByWork(text: string, works: Work[], fallback: Work | null): { work: Work | null; text: string }[] {
  const patterns = works.flatMap((w) => (w.headingPatterns ?? []).map((p) => ({ w, p: p.toUpperCase() })));
  if (!patterns.length) return [{ work: fallback, text }];
  const segments: { work: Work | null; lines: string[] }[] = [{ work: fallback, lines: [] }];
  for (const line of text.split(/\r?\n/)) {
    if (isHeadingLike(line)) {
      const up = line.trim().toUpperCase();
      // prefer the longest matching pattern (most specific)
      const hit = patterns.filter(({ p }) => up.includes(p)).sort((a, b) => b.p.length - a.p.length)[0];
      if (hit && hit.w !== segments[segments.length - 1].work) segments.push({ work: hit.w, lines: [] });
    }
    segments[segments.length - 1].lines.push(line);
  }
  return segments.filter((s) => s.lines.join('').trim().length > 0).map((s) => ({ work: s.work, text: s.lines.join('\n') }));
}

// ---------- main ----------

interface ChunkRow {
  work_id: string;
  volume_id: string;
  author: string;
  title: string;
  tradition: string;
  section_ref: string;
  source_url: string;
  chunk_index: number;
  content: string;
  token_count: number;
}

function sectionRef(vol: Volume, work: Work | null, ref: string): string {
  const inner = ref === vol.label ? '' : ref;
  if (work && work.volumes.length > 1) {
    const volNo = `Vol. ${work.volumes.indexOf(vol.id) + 1}`;
    return inner ? `${volNo} > ${inner}` : volNo;
  }
  return inner;
}

export function buildChunks(vol: Volume, text: string, sourceUrl: string): ChunkRow[] {
  const works = WORKS.filter((w) => w.volumes.includes(vol.id));
  // A volume that belongs to exactly one work (e.g. Calvin's Institutes, Hodge vol. 2) is attributed to it directly.
  const single = works.length === 1 ? works[0] : null;
  const segments = single ? [{ work: single, text }] : segmentByWork(text, works, null);
  const rows: ChunkRow[] = [];
  for (const seg of segments) {
    const chunks: Chunk[] = chunkSections(splitIntoSections(seg.text, vol.label));
    for (const c of chunks) {
      if (c.content.length < 200) continue; // skip scraps (tables of contents, page furniture)
      rows.push({
        work_id: seg.work?.id ?? vol.id,
        volume_id: vol.id,
        author: seg.work?.author ?? vol.editor,
        title: seg.work ? seg.work.title : vol.label,
        tradition: seg.work?.tradition ?? vol.tradition,
        section_ref: sectionRef(vol, seg.work, c.sectionRef),
        source_url: sourceUrl,
        chunk_index: rows.length,
        content: c.content,
        token_count: c.tokens,
      });
    }
  }
  return rows;
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const db = supabaseAdmin();

  if (args.includes('--list')) {
    for (const v of VOLUMES) {
      const { count } = await db.from('library_chunks').select('id', { count: 'exact', head: true }).eq('volume_id', v.id);
      console.log(`${(count ?? 0) > 0 ? '✓' : ' '} ${v.id.padEnd(24)} ${v.priority.padEnd(8)} ${String(count ?? 0).padStart(6)} chunks  ${v.label}`);
    }
    return;
  }
  requireEnv('VOYAGE_API_KEY');
  const ids = args.filter((a) => !a.startsWith('--'));
  const selected = ids.length ? VOLUMES.filter((v) => ids.includes(v.id)) : VOLUMES.filter((v) => args.includes('--all') || v.priority === 'core');
  if (ids.length && selected.length !== ids.length) {
    console.error(`Unknown volume id(s): ${ids.filter((i) => !VOLUMES.some((v) => v.id === i)).join(', ')}. Run with --list to see ids.`);
    process.exit(1);
  }
  const tokens = selected.reduce((n, v) => n + v.approxTokens, 0);
  console.log(`Loading ${selected.length} volume(s), roughly ${(tokens / 1e6).toFixed(0)} million tokens.`);
  console.log(`Voyage cost estimate: about $${((tokens * 1.15) / 1e6 * 0.06).toFixed(2)} after Voyage's free allowance. This can take a while; you can stop and re-run — finished volumes are skipped.\n`);

  const failed: string[] = [];
  for (const vol of selected) {
    const { count } = await db.from('library_chunks').select('id', { count: 'exact', head: true }).eq('volume_id', vol.id);
    if ((count ?? 0) > 0 && !force) {
      console.log(`✓ ${vol.label} — already loaded (${count} chunks)`);
      continue;
    }
    console.log(`→ ${vol.label}`);
    const got = await getText(vol);
    if (!got) {
      const manual = vol.sources.find((s) => s.type === 'manual');
      console.warn(`  ✗ Could not get a verified copy. ${manual && manual.type === 'manual' ? manual.hint : `You can download it yourself from ${vol.sourceUrl} (plain text) and save it as scripts/library-texts/${vol.id}.txt, then re-run.`}`);
      failed.push(vol.id);
      continue;
    }
    const rows = buildChunks(vol, got.text, got.url);
    console.log(`  ${rows.length.toLocaleString()} chunks from ${got.url}`);
    if (force) await db.from('library_chunks').delete().eq('volume_id', vol.id);
    const BATCH = 64;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const vectors = await withRetry('Voyage embeddings', () => embed(slice.map((r) => `${r.author}, ${r.title}, ${r.section_ref}\n\n${r.content}`), 'document'), 8);
      const withVec = slice.map((r, j) => ({ ...r, embedding: JSON.stringify(vectors[j]) }));
      await withRetry('saving chunks', async () => {
        const { error } = await db.from('library_chunks').upsert(withVec, { onConflict: 'volume_id,chunk_index' });
        if (error) throw new Error(error.message);
      });
      process.stdout.write(`\r  embedded ${Math.min(i + BATCH, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
    process.stdout.write('\n');
  }
  console.log(failed.length ? `\nFinished, but ${failed.length} volume(s) could not be downloaded: ${failed.join(', ')} (see messages above).` : '\nFinished. All selected volumes are loaded.');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error('\n' + (e as Error).message); process.exit(1); });
