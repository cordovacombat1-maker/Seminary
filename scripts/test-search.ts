// npm run test:search -- "justification by faith"
// Checks that the library, Bible and STEPBible data are loaded and that search returns cited results.
import { lexiconEntry, lookupOriginal, lookupVerse, searchLibrary } from '../netlify/lib/biblical';
import { isMain, loadEnv, requireEnv, supabaseAdmin } from './lib';

async function main() {
  loadEnv();
  requireEnv('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VOYAGE_API_KEY');
  const db = supabaseAdmin();
  const query = process.argv.slice(2).join(' ') || 'the knowledge of God and of ourselves';
  let ok = true;

  const verse = await lookupVerse(db, 'John 3:16', 'BSB');
  const v = 'verses' in verse ? verse.verses?.[0]?.text : undefined;
  console.log(`\nBible (BSB) John 3:16: ${v ?? 'NOT LOADED — run npm run ingest:bible'}`);
  ok &&= !!v;

  const orig = await lookupOriginal(db, 'John 1:1');
  const words = ('words' in orig ? orig.words : undefined) ?? [];
  console.log(`STEPBible John 1:1: ${words.length ? words.map((w) => `${w.word} (${w.strongs}, ${w.morphology_code})`).slice(0, 5).join(' ') + ' …' : 'NOT LOADED — run npm run ingest:stepbible'}`);
  ok &&= words.length > 0;

  const lex = await lexiconEntry(db, 'G0026');
  const entry = 'entries' in lex ? lex.entries?.[0] : undefined;
  console.log(`Lexicon G0026: ${entry ? `${entry.lemma} — ${entry.gloss}` : 'NOT LOADED'}`);
  ok &&= !!entry;

  const res = await searchLibrary(db, query, { count: 5 });
  console.log(`\nLibrary search (${res.method}) for "${query}":`);
  if (!res.results.length) console.log('  no results — run npm run ingest:library');
  for (const r of res.results) console.log(`  • (${r.citation}) [${r.similarity.toFixed(3)}]\n    ${r.content.slice(0, 160).replace(/\s+/g, ' ')}…\n    ${r.source_url}`);
  ok &&= res.results.length > 0 && res.results.every((r) => r.author && r.title);

  console.log(ok ? '\n✓ Everything is loaded and search returns cited results.' : '\n✗ Something is missing (see above).');
  process.exit(ok ? 0 : 1);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
