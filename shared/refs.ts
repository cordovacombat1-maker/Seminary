// Parse human Bible references like "John 3:16", "Rom 3:21-26", "Gen 1:1-2:3", "Psalm 23", "Isa 52:13-53:12".
import { BOOK_BY_CODE, chapterCount, findBook, verseCount } from './books';

export interface PassageRange {
  book: string; // STEPBible book code
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

export class RefError extends Error {}

/** Parse a single reference (one continuous range). Throws RefError if invalid. */
export function parseReference(input: string): PassageRange {
  const s = input.trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  // STEPBible style "Jhn.3.16"
  const step = s.match(/^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)$/);
  if (step) {
    const book = findBook(step[1]);
    if (!book) throw new RefError(`Unknown book in "${input}"`);
    const c = Number(step[2]);
    const v = Number(step[3]);
    return validate({ book, startChapter: c, startVerse: v, endChapter: c, endVerse: v }, input);
  }
  const m = s.match(/^((?:[1-3]|i{1,3})?\s?[A-Za-z][A-Za-z .]*?)\s*(\d+)(?::(\d+))?(?:\s*-\s*(\d+)(?::(\d+))?)?\s*$/i);
  if (!m) throw new RefError(`Could not read reference "${input}"`);
  const book = findBook(m[1]);
  if (!book) throw new RefError(`Unknown book "${m[1].trim()}" in "${input}"`);
  const c1 = Number(m[2]);
  const v1 = m[3] ? Number(m[3]) : null;
  const a = m[4] ? Number(m[4]) : null;
  const b = m[5] ? Number(m[5]) : null;
  let range: PassageRange;
  const singleChapterBook = chapterCount(book) === 1;
  if (v1 === null) {
    if (singleChapterBook && a === null && !/:/.test(s)) {
      // "Jude 3" means verse 3
      range = { book, startChapter: 1, startVerse: c1, endChapter: 1, endVerse: c1 };
    } else if (singleChapterBook && a !== null && b === null) {
      // "Jude 3-4" means verses 3-4
      range = { book, startChapter: 1, startVerse: c1, endChapter: 1, endVerse: a };
    } else {
      // whole chapter(s): "Psalm 23", "Gen 1-3"
      const c2 = a ?? c1;
      if (b !== null) range = { book, startChapter: c1, startVerse: 1, endChapter: c2, endVerse: b };
      else range = { book, startChapter: c1, startVerse: 1, endChapter: c2, endVerse: verseCount(book, c2) };
    }
  } else if (a === null) {
    range = { book, startChapter: c1, startVerse: v1, endChapter: c1, endVerse: v1 };
  } else if (b === null) {
    range = { book, startChapter: c1, startVerse: v1, endChapter: c1, endVerse: a };
  } else {
    range = { book, startChapter: c1, startVerse: v1, endChapter: a, endVerse: b };
  }
  return validate(range, input);
}

function validate(r: PassageRange, input: string): PassageRange {
  const chapters = chapterCount(r.book);
  if (r.startChapter < 1 || r.startChapter > chapters || r.endChapter < 1 || r.endChapter > chapters)
    throw new RefError(`"${input}": ${BOOK_BY_CODE[r.book].name} has ${chapters} chapters`);
  if (r.startVerse < 1 || r.startVerse > verseCount(r.book, r.startChapter))
    throw new RefError(`"${input}": verse ${r.startVerse} does not exist in chapter ${r.startChapter}`);
  if (r.endVerse < 1 || r.endVerse > verseCount(r.book, r.endChapter))
    throw new RefError(`"${input}": verse ${r.endVerse} does not exist in chapter ${r.endChapter}`);
  if (r.endChapter < r.startChapter || (r.endChapter === r.startChapter && r.endVerse < r.startVerse))
    throw new RefError(`"${input}": range ends before it starts`);
  return r;
}

export function formatRange(r: PassageRange): string {
  const name = BOOK_BY_CODE[r.book].name;
  const wholeChapters = r.startVerse === 1 && r.endVerse === verseCount(r.book, r.endChapter);
  if (wholeChapters && chapterCount(r.book) > 1) {
    return r.startChapter === r.endChapter ? `${name} ${r.startChapter}` : `${name} ${r.startChapter}-${r.endChapter}`;
  }
  if (r.startChapter === r.endChapter) {
    return r.startVerse === r.endVerse
      ? `${name} ${r.startChapter}:${r.startVerse}`
      : `${name} ${r.startChapter}:${r.startVerse}-${r.endVerse}`;
  }
  return `${name} ${r.startChapter}:${r.startVerse}-${r.endChapter}:${r.endVerse}`;
}

/** Number of verses in a range (for capping reading-pane size). */
export function rangeSize(r: PassageRange): number {
  let n = 0;
  for (let c = r.startChapter; c <= r.endChapter; c++) {
    const from = c === r.startChapter ? r.startVerse : 1;
    const to = c === r.endChapter ? r.endVerse : verseCount(r.book, c);
    n += to - from + 1;
  }
  return n;
}
