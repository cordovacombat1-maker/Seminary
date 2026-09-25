// npm run ingest:stepbible
// Loads STEPBible data (https://github.com/STEPBible/STEPBible-Data, CC BY 4.0, Tyndale House Cambridge):
//   TAGNT (Greek NT) + TAHOT (Hebrew OT)  -> original_words
//   TBESG + TBESH (lexicons)              -> lexicon
//   TEGMC + TEHMC (morphology codes)      -> morphology_codes
//   TIPNR (proper names)                  -> proper_names
// TTESV is deliberately NOT loaded (it is licensed for non-commercial use only).
import { hebrewMainMorph, hebrewMainStrongs, parseMorphDescription } from '../shared/morph';
import { download, isMain, loadEnv, supabaseAdmin, upsertBatches } from './lib';

const RAW = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/';

// Current file names in the STEPBible repository. If STEPBible renames a file, the script
// looks it up by prefix through the GitHub API instead.
const FILES: Record<string, string> = {
  TAGNT1: 'Translators Amalgamated OT+NT/TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt',
  TAGNT2: 'Translators Amalgamated OT+NT/TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt',
  TAHOT1: 'Translators Amalgamated OT+NT/TAHOT Gen-Deu - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
  TAHOT2: 'Translators Amalgamated OT+NT/TAHOT Jos-Est - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
  TAHOT3: 'Translators Amalgamated OT+NT/TAHOT Job-Sng - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
  TAHOT4: 'Translators Amalgamated OT+NT/TAHOT Isa-Mal - Translators Amalgamated Hebrew OT - STEPBible.org CC BY.txt',
  TBESG: 'Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt',
  TBESH: 'Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt',
  TEGMC: 'Morphology codes/TEGMC - Translators Expansion of Greek Morphhology Codes - STEPBible.org CC BY.txt',
  TEHMC: 'Morphology codes/TEHMC - Translators Expansion of Hebrew Morphology Codes - STEPBible.org CC BY.txt',
  TIPNR: 'Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt',
};

let tree: string[] | null = null;
async function findByPrefix(key: string): Promise<string | null> {
  if (!tree) {
    try {
      const res = await fetch('https://api.github.com/repos/STEPBible/STEPBible-Data/git/trees/master?recursive=1');
      const body = (await res.json()) as { tree?: { path: string }[] };
      tree = (body.tree ?? []).map((t) => t.path);
    } catch {
      tree = [];
    }
  }
  const stem = FILES[key].split('/').pop()!.split(' - ')[0]; // e.g. "TAGNT Mat-Jhn"
  return tree.find((p) => p.split('/').pop()!.startsWith(stem) && !p.startsWith('Older') && p.endsWith('.txt')) ?? null;
}

async function getFile(key: string): Promise<string> {
  if (key === 'TTESV') throw new Error('TTESV is non-commercial and must not be loaded.');
  const encode = (p: string) => p.split('/').map(encodeURIComponent).join('/');
  let text = await download(RAW + encode(FILES[key]), `stepbible-${key}.txt`);
  if (!text) {
    const alt = await findByPrefix(key);
    if (alt) text = await download(RAW + encode(alt), `stepbible-${key}.txt`);
  }
  if (!text) throw new Error(`Could not download ${key} from STEPBible's GitHub repository.`);
  return text.replace(/^﻿/, '');
}

const REF = /^([1-3][A-Z][a-z]|[A-Z][a-z]{2})\.(\d+)\.(\d+)([^#\t]*)#(\d+)=(\S*)$/;

export interface WordRow {
  language: 'greek' | 'hebrew';
  book: string;
  chapter: number;
  verse: number;
  word_num: number;
  word: string;
  translit: string | null;
  english: string | null;
  strongs: string | null;
  main_strongs: string | null;
  grammar: string | null;
  main_morph: string | null;
  lemma: string | null;
  gloss: string | null;
  editions: string | null;
  alt_ref: string | null;
}

export function parseTagnt(text: string): WordRow[] {
  const rows: WordRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t');
    const m = cols[0]?.match(REF);
    if (!m || cols.length < 5) continue;
    const [, book, ch, vs, , num, editions] = m;
    const wm = cols[1].match(/^(.*?)\s*\((.*)\)\s*$/);
    const [strongs, grammarRaw = ''] = cols[3].split('=');
    const grammar = grammarRaw.trim();
    const mainMorph = grammar.split(' + ')[0].trim() || null;
    const [lemma, gloss] = (cols[4] ?? '').split('=');
    rows.push({
      language: 'greek',
      book,
      chapter: Number(ch),
      verse: Number(vs),
      word_num: Number(num),
      word: (wm ? wm[1] : cols[1]).trim(),
      translit: wm ? wm[2].trim() : null,
      english: cols[2]?.trim() || null,
      strongs: strongs.trim() || null,
      main_strongs: strongs.trim() || null,
      grammar: grammar || null,
      main_morph: mainMorph,
      lemma: lemma?.trim() || null,
      gloss: gloss?.trim() || null,
      editions: editions || null,
      alt_ref: null,
    });
  }
  return rows;
}

export function parseTahot(text: string): WordRow[] {
  const rows: WordRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t');
    const m = cols[0]?.match(REF);
    if (!m || cols.length < 6) continue;
    const [, book, ch, vs, alt, num, type] = m;
    const dStrongs = cols[4]?.trim() ?? '';
    const grammar = cols[5]?.trim() ?? '';
    const mainStrongs = hebrewMainStrongs(dStrongs);
    // Expanded tags look like: H9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}
    const expanded = cols[11] ?? '';
    const braced = expanded.match(/\{([^}]*)\}/)?.[1] ?? expanded.split('/').pop() ?? '';
    const parts = braced.split('=');
    const gloss = (parts[2] ?? '').replace(/^[:\s]+/, '').split('»')[0].trim();
    rows.push({
      language: 'hebrew',
      book,
      chapter: Number(ch),
      verse: Number(vs),
      word_num: Number(num),
      word: cols[1]?.trim() ?? '',
      translit: cols[2]?.trim() || null,
      english: cols[3]?.trim() || null,
      strongs: dStrongs || null,
      main_strongs: mainStrongs,
      grammar: grammar || null,
      main_morph: hebrewMainMorph(grammar, dStrongs),
      lemma: parts[1]?.trim() || null,
      gloss: gloss || null,
      editions: type || null,
      alt_ref: alt?.replace(/[()]/g, '').trim() || null,
    });
  }
  return rows;
}

export interface LexRow {
  strongs: string;
  language: 'greek' | 'hebrew';
  lemma: string;
  translit: string | null;
  morph: string | null;
  gloss: string | null;
  definition: string | null;
}

export function parseLexicon(text: string, language: 'greek' | 'hebrew'): LexRow[] {
  const out = new Map<string, LexRow>();
  const prefix = language === 'greek' ? 'G' : 'H';
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t');
    if (cols.length < 8 || !new RegExp(`^${prefix}\\d{4}`).test(cols[0])) continue;
    const key = cols[1].split('=')[0].trim(); // dStrong, e.g. G0976 or H0430G
    if (!/^[GH]\d{4}[A-Za-z]?$/.test(key) || out.has(key)) continue;
    out.set(key, {
      strongs: key,
      language,
      lemma: cols[3].trim(),
      translit: cols[4]?.trim() || null,
      morph: cols[5]?.trim() || null,
      gloss: cols[6]?.trim() || null,
      definition: cols[7]?.trim() || null,
    });
  }
  return [...out.values()];
}

export interface MorphRow {
  code: string;
  language: 'greek' | 'hebrew';
  description: string;
  parsed: Record<string, string>;
  summary: string | null;
  explanation: string | null;
}

export function parseMorphology(text: string, language: 'greek' | 'hebrew'): MorphRow[] {
  const lines = text.split(/\r?\n/);
  const out = new Map<string, MorphRow>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Z][^\t ]*)\t(Function=.*)$/);
    if (!m || out.has(m[1])) continue;
    const following = [];
    for (let j = i + 1; j < lines.length && j < i + 5 && lines[j].startsWith('\t'); j++) following.push(lines[j].trim().replace(/^"|"$/g, ''));
    out.set(m[1], {
      code: m[1],
      language,
      description: m[2].trim(),
      parsed: parseMorphDescription(m[2]),
      summary: following[0] ?? null,
      explanation: following.slice(1).join(' ') || null,
    });
  }
  return [...out.values()];
}

export function parseProperNames(text: string) {
  const rows: { name: string; strongs: string | null; kind: string; description: string; references_text: string | null }[] = [];
  let kind = 'other';
  let cur: (typeof rows)[number] | null = null;
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\$=+\s*(PERSON|PLACE|OTHER)/i);
    if (section) {
      kind = section[1].toLowerCase() === 'person' ? 'person' : section[1].toLowerCase() === 'place' ? 'place' : 'other';
      continue;
    }
    const head = line.match(/^([^@\t–$]+)@([^=\t]+)=([GH]\d{4}[A-Za-z]?)[^\t]*\t([^\t]*)/);
    if (head) {
      cur = { name: head[1].trim(), strongs: head[3], kind, description: head[4].trim(), references_text: null };
      rows.push(cur);
      continue;
    }
    if (cur && line.startsWith('– Total')) cur.references_text = (line.split('\t')[3] ?? '').trim().slice(0, 4000) || null;
    if (cur && line.startsWith('@Short=')) cur.description = `${cur.description}. ${line.slice(7).trim()}`.replace(/^\.\s*/, '');
  }
  return rows;
}

const dedupe = (rows: WordRow[]) => [...new Map(rows.map((r) => [`${r.language}.${r.book}.${r.chapter}.${r.verse}.${r.word_num}`, r])).values()];

async function main() {
  loadEnv();
  const db = supabaseAdmin();
  const only = process.argv.slice(2);
  const want = (k: string) => !only.length || only.includes(k);

  if (want('morphology')) {
    console.log('\nMorphology codes (TEGMC, TEHMC)…');
    const rows = [...parseMorphology(await getFile('TEGMC'), 'greek'), ...parseMorphology(await getFile('TEHMC'), 'hebrew')];
    await upsertBatches(db, 'morphology_codes', rows, 'code');
  }
  if (want('lexicon')) {
    console.log('\nLexicons (TBESG, TBESH)…');
    const rows = [...parseLexicon(await getFile('TBESG'), 'greek'), ...parseLexicon(await getFile('TBESH'), 'hebrew')];
    await upsertBatches(db, 'lexicon', rows, 'strongs', 500);
  }
  if (want('greek')) {
    console.log('\nGreek New Testament (TAGNT)…');
    const rows = dedupe([...parseTagnt(await getFile('TAGNT1')), ...parseTagnt(await getFile('TAGNT2'))]);
    await upsertBatches(db, 'original_words', rows as unknown as Record<string, unknown>[], 'language,book,chapter,verse,word_num');
  }
  if (want('hebrew')) {
    console.log('\nHebrew Old Testament (TAHOT)…');
    for (const k of ['TAHOT1', 'TAHOT2', 'TAHOT3', 'TAHOT4']) {
      const rows = dedupe(parseTahot(await getFile(k)));
      await upsertBatches(db, 'original_words', rows as unknown as Record<string, unknown>[], 'language,book,chapter,verse,word_num');
    }
  }
  if (want('names')) {
    console.log('\nProper names (TIPNR)…');
    const rows = parseProperNames(await getFile('TIPNR'));
    const { error } = await db.from('proper_names').delete().gte('id', 0);
    if (error) throw new Error(error.message);
    for (let i = 0; i < rows.length; i += 1000) {
      const { error: e } = await db.from('proper_names').insert(rows.slice(i, i + 1000));
      if (e) throw new Error(e.message);
    }
    console.log(`  proper_names: ${rows.length.toLocaleString()}`);
  }
  console.log('\nDone. STEPBible data loaded (CC BY 4.0, STEPBible.org / Tyndale House).');
}

if (isMain(import.meta.url)) main().catch((e) => { console.error('\n' + (e as Error).message); process.exit(1); });
