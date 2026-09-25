// Split long texts into ~800-token chunks with ~100-token overlap, tracking section headings.

export const approxTokens = (s: string) => Math.ceil(s.length / 4);

export interface Section {
  ref: string; // e.g. "Book I, Chapter VII"
  text: string;
}

export interface Chunk {
  sectionRef: string;
  content: string;
  tokens: number;
}

export function chunkSections(sections: Section[], targetTokens = 800, overlapTokens = 100, minTokens = 150): Chunk[] {
  const chunks: Chunk[] = [];
  // Short sections (brief chapters, letters, psalms) are carried forward and merged with the next one,
  // so no text is lost and chunks stay a useful size. Merged chunks cite the range, e.g. "Psalm 1 – Psalm 3".
  let carry: { refs: string[]; paras: string[] } | null = null;
  const tokensOf = (ps: string[]) => ps.reduce((n, p) => n + approxTokens(p), 0);
  sections.forEach((sec, si) => {
    const paras = sec.text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .flatMap((p) => splitLong(p, targetTokens));
    let refs = [sec.ref];
    let buf: string[] = [];
    if (carry) {
      refs = [...carry.refs, sec.ref];
      buf = [...carry.paras, sec.ref];
      carry = null;
    }
    let bufTokens = tokensOf(buf);
    let fresh = bufTokens; // tokens not already emitted as overlap
    let flushed = false;
    const refLabel = () => (refs.length > 1 ? `${refs[0]} – ${refs[refs.length - 1]}` : refs[0]);
    const emit = () => {
      const content = buf.join('\n\n');
      chunks.push({ sectionRef: refLabel(), content, tokens: approxTokens(content) });
    };
    const flush = () => {
      emit();
      flushed = true;
      refs = [sec.ref];
      // carry overlap: take trailing paragraphs/sentences up to overlapTokens
      const tail: string[] = [];
      let t = 0;
      for (let i = buf.length - 1; i >= 0 && t < overlapTokens; i--) {
        let p = buf[i];
        if (approxTokens(p) + t > overlapTokens) {
          p = p.slice(-(overlapTokens - t) * 4);
          p = p.replace(/^\S*\s/, ''); // start on a word boundary
        }
        tail.unshift(p);
        t += approxTokens(p);
      }
      buf = tail;
      bufTokens = t;
      fresh = 0;
    };
    for (const p of paras) {
      const pt = approxTokens(p);
      if (bufTokens + pt > targetTokens && fresh > 0) flush();
      buf.push(p);
      bufTokens += pt;
      fresh += pt;
    }
    if (fresh === 0) return;
    const last = si === sections.length - 1;
    if (!flushed && bufTokens < minTokens && !last) carry = { refs, paras: buf };
    else emit();
  });
  return chunks;
}

function splitLong(p: string, target: number): string[] {
  if (approxTokens(p) <= target) return [p];
  const sentences = p.match(/[^.!?]+[.!?]+["'”’)]*\s*|[^.!?]+$/g) ?? [p];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (approxTokens(cur + s) > target && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (approxTokens(s) > target) {
      for (let i = 0; i < s.length; i += target * 4) out.push(s.slice(i, i + target * 4).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const HEADING_RE =
  /^(BOOK|PART|CHAPTER|CHAP\.|SECTION|SECT\.|ARTICLE|QUESTION|LECTURE|SERMON|HOMILY|LETTER|EPISTLE|TREATISE|DISCOURSE|DISPUTATION|PSALM|INTRODUCTION|PREFACE|APPENDIX|§)\b[^\n]{0,100}$/i;

/**
 * Split a plain text into sections using heading lines (e.g. "CHAPTER VII.", "BOOK II",
 * "ARTICLE 3"). Keeps a running path like "Book II > Chapter VII".
 */
export function splitIntoSections(text: string, fallbackRef = 'Text'): Section[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections: Section[] = [];
  const path: { level: number; label: string }[] = [];
  let cur: string[] = [];
  let curRef = fallbackRef;
  const levelOf = (w: string) => {
    const k = w.toUpperCase().replace('.', '');
    if (['BOOK', 'PART'].includes(k)) return 1;
    if (['CHAPTER', 'CHAP', 'QUESTION', 'LECTURE', 'SERMON', 'HOMILY', 'LETTER', 'EPISTLE', 'TREATISE', 'DISCOURSE', 'DISPUTATION', 'PSALM', 'INTRODUCTION', 'PREFACE', 'APPENDIX'].includes(k)) return 2;
    return 3;
  };
  const pushSection = () => {
    const t = cur.join('\n').trim();
    if (t) sections.push({ ref: curRef, text: t }); // short sections are merged later by chunkSections
    cur = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(HEADING_RE);
    // Headings are short, and usually upper-case or title-case lines on their own
    if (m && line.length <= 100 && (line === line.toUpperCase() || /^(Book|Part|Chapter|Section|Article|Question|Lecture|Sermon|Homily|Letter|Epistle)\s+[IVXLC\d]+\.?/.test(line))) {
      pushSection();
      const level = levelOf(m[1]);
      while (path.length && path[path.length - 1].level >= level) path.pop();
      path.push({ level, label: tidyHeading(line) });
      curRef = path.map((p) => p.label).join(' > ');
      continue;
    }
    cur.push(raw);
  }
  pushSection();
  return sections.length ? sections : [{ ref: fallbackRef, text }];
}

function tidyHeading(s: string): string {
  const t = s.replace(/\s+/g, ' ').replace(/[.:]+$/, '').trim();
  // Title-case upper-case headings: "CHAPTER VII" -> "Chapter VII"
  return t
    .split(' ')
    .map((w) => (/^[IVXLC]+$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(' ');
}
