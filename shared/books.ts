// Canonical book list. Codes match the STEPBible data (e.g. "Gen", "Jhn", "1Co")
// and are used in every database table.
import versification from './versification.json';

export interface Book {
  code: string;
  name: string;
  testament: 'OT' | 'NT';
  aliases: string[];
}

const RAW: [string, string, string[]][] = [
  ['Gen', 'Genesis', ['gen', 'ge', 'gn']],
  ['Exo', 'Exodus', ['exod', 'exo', 'ex']],
  ['Lev', 'Leviticus', ['lev', 'le', 'lv']],
  ['Num', 'Numbers', ['num', 'nu', 'nm']],
  ['Deu', 'Deuteronomy', ['deut', 'deu', 'dt']],
  ['Jos', 'Joshua', ['josh', 'jos']],
  ['Jdg', 'Judges', ['judg', 'jdg', 'jg']],
  ['Rut', 'Ruth', ['ruth', 'rut', 'ru']],
  ['1Sa', '1 Samuel', ['1 sam', '1sam', '1 sa', '1sa', 'i samuel', 'first samuel']],
  ['2Sa', '2 Samuel', ['2 sam', '2sam', '2 sa', '2sa', 'ii samuel', 'second samuel']],
  ['1Ki', '1 Kings', ['1 kgs', '1kgs', '1 ki', '1ki', 'i kings', 'first kings']],
  ['2Ki', '2 Kings', ['2 kgs', '2kgs', '2 ki', '2ki', 'ii kings', 'second kings']],
  ['1Ch', '1 Chronicles', ['1 chr', '1chr', '1 chron', '1ch', 'i chronicles']],
  ['2Ch', '2 Chronicles', ['2 chr', '2chr', '2 chron', '2ch', 'ii chronicles']],
  ['Ezr', 'Ezra', ['ezra', 'ezr']],
  ['Neh', 'Nehemiah', ['neh', 'ne']],
  ['Est', 'Esther', ['esth', 'est', 'es']],
  ['Job', 'Job', ['job', 'jb']],
  ['Psa', 'Psalms', ['psalm', 'ps', 'psa', 'pss', 'psm']],
  ['Pro', 'Proverbs', ['prov', 'pro', 'pr', 'prv']],
  ['Ecc', 'Ecclesiastes', ['eccl', 'ecc', 'ec', 'qoheleth']],
  ['Sng', 'Song of Songs', ['song of solomon', 'song', 'sng', 'sos', 'canticles', 'song of sol']],
  ['Isa', 'Isaiah', ['isa', 'is']],
  ['Jer', 'Jeremiah', ['jer', 'je']],
  ['Lam', 'Lamentations', ['lam', 'la']],
  ['Ezk', 'Ezekiel', ['ezek', 'ezk', 'eze']],
  ['Dan', 'Daniel', ['dan', 'da', 'dn']],
  ['Hos', 'Hosea', ['hos', 'ho']],
  ['Jol', 'Joel', ['joel', 'jol', 'jl']],
  ['Amo', 'Amos', ['amos', 'amo', 'am']],
  ['Oba', 'Obadiah', ['obad', 'oba', 'ob']],
  ['Jon', 'Jonah', ['jonah', 'jon', 'jnh']],
  ['Mic', 'Micah', ['mic', 'mi']],
  ['Nam', 'Nahum', ['nah', 'nam', 'na']],
  ['Hab', 'Habakkuk', ['hab', 'hb']],
  ['Zep', 'Zephaniah', ['zeph', 'zep', 'zp']],
  ['Hag', 'Haggai', ['hag', 'hg']],
  ['Zec', 'Zechariah', ['zech', 'zec', 'zc']],
  ['Mal', 'Malachi', ['mal', 'ml']],
  ['Mat', 'Matthew', ['matt', 'mat', 'mt']],
  ['Mrk', 'Mark', ['mark', 'mrk', 'mk', 'mr']],
  ['Luk', 'Luke', ['luke', 'luk', 'lk']],
  ['Jhn', 'John', ['john', 'jhn', 'jn']],
  ['Act', 'Acts', ['acts', 'act', 'ac']],
  ['Rom', 'Romans', ['rom', 'ro', 'rm']],
  ['1Co', '1 Corinthians', ['1 cor', '1cor', '1 co', '1co', 'i corinthians', 'first corinthians']],
  ['2Co', '2 Corinthians', ['2 cor', '2cor', '2 co', '2co', 'ii corinthians', 'second corinthians']],
  ['Gal', 'Galatians', ['gal', 'ga']],
  ['Eph', 'Ephesians', ['eph', 'ephes']],
  ['Php', 'Philippians', ['phil', 'php', 'pp']],
  ['Col', 'Colossians', ['col', 'co']],
  ['1Th', '1 Thessalonians', ['1 thess', '1thess', '1 th', '1th', 'i thessalonians']],
  ['2Th', '2 Thessalonians', ['2 thess', '2thess', '2 th', '2th', 'ii thessalonians']],
  ['1Ti', '1 Timothy', ['1 tim', '1tim', '1 ti', '1ti', 'i timothy']],
  ['2Ti', '2 Timothy', ['2 tim', '2tim', '2 ti', '2ti', 'ii timothy']],
  ['Tit', 'Titus', ['titus', 'tit']],
  ['Phm', 'Philemon', ['philem', 'phm', 'phlm']],
  ['Heb', 'Hebrews', ['heb']],
  ['Jas', 'James', ['jas', 'jm']],
  ['1Pe', '1 Peter', ['1 pet', '1pet', '1 pe', '1pe', 'i peter']],
  ['2Pe', '2 Peter', ['2 pet', '2pet', '2 pe', '2pe', 'ii peter']],
  ['1Jn', '1 John', ['1 jn', '1jn', '1 john', '1john', 'i john']],
  ['2Jn', '2 John', ['2 jn', '2jn', '2 john', '2john', 'ii john']],
  ['3Jn', '3 John', ['3 jn', '3jn', '3 john', '3john', 'iii john']],
  ['Jud', 'Jude', ['jude', 'jud']],
  ['Rev', 'Revelation', ['rev', 're', 'revelations', 'apocalypse', 'revelation of john']],
];

export const BOOKS: Book[] = RAW.map(([code, name, aliases], i) => ({
  code,
  name,
  testament: i < 39 ? 'OT' : 'NT',
  aliases,
}));

export const BOOK_BY_CODE: Record<string, Book> = Object.fromEntries(BOOKS.map((b) => [b.code, b]));

const VERSES: Record<string, number[]> = (versification as { books: Record<string, number[]> }).books;

export function chapterCount(code: string): number {
  return VERSES[code]?.length ?? 0;
}

export function verseCount(code: string, chapter: number): number {
  return VERSES[code]?.[chapter - 1] ?? 0;
}

const norm = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

const LOOKUP = new Map<string, string>();
for (const b of BOOKS) {
  LOOKUP.set(norm(b.name), b.code);
  LOOKUP.set(norm(b.code), b.code);
  for (const a of b.aliases) LOOKUP.set(norm(a), b.code);
}
// Common spellings with roman numerals / words for numbered books
for (const b of BOOKS) {
  const m = b.name.match(/^([123]) (.+)$/);
  if (m) {
    const roman = ['', 'i', 'ii', 'iii'][Number(m[1])];
    LOOKUP.set(norm(`${roman} ${m[2]}`), b.code);
    LOOKUP.set(norm(`${m[1]}${m[2]}`), b.code);
  }
}

export function findBook(name: string): string | null {
  return LOOKUP.get(norm(name)) ?? null;
}
