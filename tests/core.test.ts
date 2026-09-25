import { describe, expect, it } from 'vitest';
import { chapterCount, findBook, verseCount } from '../shared/books';
import { chunkSections, splitIntoSections } from '../shared/chunk';
import { checkParsing, hebrewMainMorph, hebrewMainStrongs, likeToRegex, normalizeStrongs, parseMorphDescription } from '../shared/morph';
import { lessonRequirementsMet, lessonUnlocked } from '../shared/progress';
import { formatRange, parseReference, rangeSize } from '../shared/refs';
import { buildWindow, needsSummary } from '../netlify/lib/chat';
import { rangeFilter } from '../netlify/lib/biblical';
import { parseLexicon, parseMorphology, parseTagnt, parseTahot } from '../scripts/ingest-stepbible';
import { parseCsv, parseTabbed, parseWebJson } from '../scripts/ingest-bible';
import { segmentByWork, stripGutenberg } from '../scripts/ingest-library';
import { WORK_BY_ID } from '../shared/library';

describe('Bible references', () => {
  it('finds books by many names', () => {
    expect(findBook('1 Cor')).toBe('1Co');
    expect(findBook('I Samuel')).toBe('1Sa');
    expect(findBook('Song of Solomon')).toBe('Sng');
    expect(findBook('Psalm')).toBe('Psa');
    expect(findBook('Revelation of John')).toBe('Rev');
    expect(findBook('Jhn')).toBe('Jhn');
  });
  it('knows versification', () => {
    expect(chapterCount('Psa')).toBe(150);
    expect(verseCount('Jhn', 3)).toBe(36);
    expect(verseCount('Psa', 119)).toBe(176);
  });
  it('parses ranges', () => {
    expect(parseReference('John 3:16')).toEqual({ book: 'Jhn', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 });
    expect(parseReference('Gen 1:1-2:3')).toMatchObject({ endChapter: 2, endVerse: 3 });
    expect(parseReference('Psalm 23')).toMatchObject({ startVerse: 1, endVerse: 6 });
    expect(parseReference('Isaiah 52:13-53:12')).toMatchObject({ startChapter: 52, endChapter: 53, endVerse: 12 });
    expect(parseReference('Jude 3-4')).toMatchObject({ startChapter: 1, startVerse: 3, endVerse: 4 });
    expect(parseReference('Jhn.1.1')).toMatchObject({ book: 'Jhn', startVerse: 1 });
    expect(formatRange(parseReference('Rom 3:21-26'))).toBe('Romans 3:21-26');
    expect(rangeSize(parseReference('Psalm 23'))).toBe(6);
  });
  it('rejects impossible references', () => {
    expect(() => parseReference('John 22:1')).toThrow();
    expect(() => parseReference('Jude 2:1')).toThrow();
    expect(() => parseReference('Hezekiah 1:1')).toThrow();
    expect(() => parseReference('Rom 3:40')).toThrow();
  });
  it('builds PostgREST range filters', () => {
    expect(rangeFilter(parseReference('John 3:16-18'))).toBe('and(chapter.eq.3,verse.gte.16,verse.lte.18)');
    expect(rangeFilter(parseReference('Gen 1:1-3:5'))).toContain('and(chapter.gt.1,chapter.lt.3)');
  });
});

describe('STEPBible morphology', () => {
  it('parses Greek and Hebrew descriptions', () => {
    expect(parseMorphDescription('Function=Verb; Tense=Present; Voice=Active; Mood=Indicative; Person=3rd; Number=Singular')).toEqual({
      Function: 'Verb', Tense: 'Present', Voice: 'Active', Mood: 'Indicative', Person: '3rd', Number: 'Singular',
    });
    const heb = parseMorphDescription('Function=Verb ; Stem=Qal (hence Action=Simple; Voice=Active); Form=Perfect (hence Tense=Past/present; Mood=Indicative); Person=Third; Gender=Masculine; Number=Singular');
    expect(heb).toMatchObject({ Function: 'Verb', Stem: 'Qal', Form: 'Perfect', Person: 'Third' });
    expect(heb.Voice).toBeUndefined();
  });
  it('checks a student parsing against the real tags', () => {
    const r = checkParsing({ Function: 'Noun', Case: 'Nominative', Number: 'Singular', Gender: 'Feminine' }, { Case: 'nominative', Number: 'Plural', Gender: 'Feminine' }, ['Case', 'Number', 'Gender', 'Tense']);
    expect(r.map((x) => x.correct)).toEqual([true, false, true]);
  });
  it('finds the main Hebrew word', () => {
    expect(hebrewMainMorph('HR/Ncfsa', 'H9003/{H7225G}')).toBe('HNcfsa');
    expect(hebrewMainMorph('HVqp3ms', '{H1254A}')).toBe('HVqp3ms');
    expect(hebrewMainStrongs('H9003/{H7225G}')).toBe('H7225G');
    expect(normalizeStrongs('g25')).toBe('G0025');
    expect(normalizeStrongs('H430g')).toBe('H0430G');
    expect(likeToRegex('V-%').test('V-PAI-3S')).toBe(true);
    expect(likeToRegex('HV_p%').test('HVqp3ms')).toBe(true);
  });
  it('parses STEPBible file lines', () => {
    const tagnt = parseTagnt('Mat.1.1#01=NKO\tΒίβλος (Biblos)\t[The] book\tG0976=N-NSF\tβίβλος=book\tNA28+NA27\n1Co.13.4#03=NKO\tμακροθυμεῖ (makrothumei)\tis patient\tG3114=V-PAI-3S\tμακροθυμέω=be patient\tNA28');
    expect(tagnt).toHaveLength(2);
    expect(tagnt[0]).toMatchObject({ book: 'Mat', word: 'Βίβλος', translit: 'Biblos', main_morph: 'N-NSF', lemma: 'βίβλος', gloss: 'book' });
    expect(tagnt[1]).toMatchObject({ book: '1Co', chapter: 13, main_morph: 'V-PAI-3S' });
    const tahot = parseTahot("Gen.1.1#01=L\tבְּ/רֵאשִׁ֖ית\tbe./re.Shit\tin/ beginning\tH9003/{H7225G}\tHR/Ncfsa\t\t\tH7225G\t\t\tH9003=ב=in/{H7225G=רֵאשִׁית=: beginning»first:1_beginning}");
    expect(tahot[0]).toMatchObject({ main_strongs: 'H7225G', main_morph: 'HNcfsa', lemma: 'רֵאשִׁית', gloss: 'beginning' });
    const lex = parseLexicon('G0976\tG0976 =\tG0976\tβίβλος\tbiblos\tG:N-F\tbook\t<b>βίβλος</b>, a book', 'greek');
    expect(lex[0]).toMatchObject({ strongs: 'G0976', lemma: 'βίβλος', gloss: 'book' });
    const morph = parseMorphology('N-NSF\tFunction=Noun; Case=Nominative; Number=Singular; Gender=Feminine\n\tNoun Nominative Singular Feminine\n\ta female PERSON', 'greek');
    expect(morph[0]).toMatchObject({ code: 'N-NSF', parsed: { Case: 'Nominative' }, summary: 'Noun Nominative Singular Feminine' });
  });
});

describe('Bible text parsers', () => {
  it('reads the BSB tab format, CSV mirror and WEB JSON', () => {
    expect(parseTabbed('Verse\tBerean Standard Bible\nGenesis 1:1\tIn the beginning God created the heavens and the earth.', 'BSB')).toEqual([
      { translation: 'BSB', book: 'Gen', chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' },
    ]);
    expect(parseCsv('Book,Chapter,Verse,Text\nI Samuel,1,1,"Now there was a man, of Ramathaim."', 'KJV')[0]).toMatchObject({ book: '1Sa', text: 'Now there was a man, of Ramathaim.' });
    const web = parseWebJson([{ type: 'paragraph text', chapterNumber: 1, verseNumber: 1, value: 'In the beginning ' }, { type: 'line text', chapterNumber: 1, verseNumber: 1, value: 'was the Word.' }], 'Jhn');
    expect(web[0].text).toBe('In the beginning was the Word.');
  });
});

describe('Library chunking', () => {
  const para = (w: string, n: number) => Array.from({ length: n }, () => w).join(' ') + '.';
  it('splits sections by headings and chunks with overlap', () => {
    const text = ['BOOK I', 'CHAPTER I.', para('grace', 500), '', para('faith', 500), 'CHAPTER II.', para('hope', 900)].join('\n\n');
    const sections = splitIntoSections(text);
    expect(sections.map((s) => s.ref)).toEqual(['Book I > Chapter I', 'Book I > Chapter II']);
    const chunks = chunkSections(sections, 800, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.every((c) => c.tokens <= 1000)).toBe(true);
    // overlap: the second chunk of chapter I starts with the tail of the first
    expect(chunks[1].content.startsWith('grace')).toBe(true);
  });
  it('attributes text to works inside a shared volume', () => {
    const works = [WORK_BY_ID['clement-1'], WORK_BY_ID['irenaeus-heresies']];
    const segs = segmentByWork('Intro\nTHE FIRST EPISTLE OF CLEMENT TO THE CORINTHIANS\nclement text\nIRENÆUS AGAINST HERESIES.\nirenaeus text', works, null);
    expect(segs.map((s) => s.work?.id ?? null)).toEqual([null, 'clement-1', 'irenaeus-heresies']);
  });
  it('strips Project Gutenberg boilerplate', () => {
    expect(stripGutenberg('header\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\nBODY\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nlicense').trim()).toBe('BODY');
  });

  it('never drops short sections: they merge into the next chunk with a range reference', () => {
    const text = Array.from({ length: 30 }, (_, i) => `PSALM ${i + 1}\n\nShort psalm number ${i + 1} about the steadfast love of the Lord.`).join('\n\n');
    const chunks = chunkSections(splitIntoSections(text, 'Psalms'), 800, 100);
    const all = chunks.map((c) => c.content).join(' ');
    for (let i = 1; i <= 30; i++) expect(all).toContain(`Short psalm number ${i} `);
    expect(chunks.length).toBeLessThan(30);
    expect(chunks[0].sectionRef).toMatch(/^Psalm 1 – Psalm \d+$/);
  });
});

describe('Chat history and progress', () => {
  it('sends only the last 20 messages, starting with the student', () => {
    const thread = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
    const w = buildWindow(thread);
    expect(w.length).toBeLessThanOrEqual(21);
    expect(w[0].role).toBe('user');
    expect(buildWindow([{ role: 'assistant', content: 'hi' }])[0].role).toBe('user');
    expect(needsSummary(30, 0)).toBe(true);
    expect(needsSummary(30, 10)).toBe(false);
  });
  it('unlocks lessons in order and requires papers', () => {
    const course = { id: 'c', prerequisites: ['p'], lessons: [{ id: 'a' }, { id: 'b' }] } as never;
    expect(lessonUnlocked(course, 0, new Set(), new Set())).toBe(false);
    expect(lessonUnlocked(course, 0, new Set(['p']), new Set())).toBe(true);
    expect(lessonUnlocked(course, 1, new Set(['p']), new Set())).toBe(false);
    expect(lessonUnlocked(course, 1, new Set(['p']), new Set(['a']))).toBe(true);
    const lesson = { paper_prompt: 'Write' } as never;
    expect(lessonRequirementsMet(lesson, { tutor_completed_at: 'x', quiz_passed_at: 'x', paper_passed_at: null })).toBe(false);
    expect(lessonRequirementsMet(lesson, { tutor_completed_at: 'x', quiz_passed_at: 'x', paper_passed_at: 'x' })).toBe(true);
  });
});
