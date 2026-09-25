// Helpers for STEPBible morphology codes (TEGMC for Greek, TEHMC for Hebrew).

/**
 * Turn a TEGMC/TEHMC description such as
 *   "Function=Verb; Tense=Present; Voice=Active; Mood=Indicative; Person=3rd; Number=Singular"
 *   "Function=Verb ; Stem=Qal (hence Action=Simple; Voice=Active); Form=Perfect (hence ...); Person=Third"
 * into { Function: "Verb", Tense: "Present", ... }.
 */
export function parseMorphDescription(desc: string): Record<string, string> {
  const out: Record<string, string> = {};
  const cleaned = desc.replace(/\([^)]*\)/g, ''); // drop "(hence ...)" notes
  for (const part of cleaned.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim().replace(/\s+/g, ' ');
    if (key && value && !(key in out)) out[key] = value;
  }
  return out;
}

/** Fields a student can be asked to parse, in display order. */
export const GREEK_FIELDS = ['Function', 'Tense', 'Voice', 'Mood', 'Form', 'Case', 'Person', 'Number', 'Gender'] as const;
export const HEBREW_FIELDS = ['Function', 'Stem', 'Form', 'Person', 'Gender', 'Number', 'State'] as const;

export const FIELD_LABELS: Record<string, string> = {
  Function: 'Part of speech',
  Tense: 'Tense',
  Voice: 'Voice',
  Mood: 'Mood',
  Case: 'Case',
  Person: 'Person',
  Number: 'Number',
  Gender: 'Gender',
  Stem: 'Stem (binyan)',
  Form: 'Form',
  State: 'State',
};

export function normalizeAnswer(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface ParseCheck {
  field: string;
  expected: string;
  given: string;
  correct: boolean;
}

/** Compare a student's parsing against the real morphology fields. */
export function checkParsing(expected: Record<string, string>, given: Record<string, string>, fields: string[]): ParseCheck[] {
  return fields
    .filter((f) => f in expected)
    .map((f) => ({
      field: f,
      expected: expected[f],
      given: given[f] ?? '',
      correct: normalizeAnswer(expected[f]) === normalizeAnswer(given[f]),
    }));
}

/**
 * For a Hebrew grammar string like "HR/Ncfsa" or "HC/Vqw3ms" and dStrongs like "H9003/{H7225G}",
 * return the full code of the main (braced) word, e.g. "HNcfsa".
 */
export function hebrewMainMorph(grammar: string, dStrongs: string): string | null {
  if (!grammar) return null;
  const lang = grammar[0];
  const segs = grammar.slice(1).split('/').map((s) => s.trim());
  const strongSegs = dStrongs.split('/');
  let idx = strongSegs.findIndex((s) => s.includes('{'));
  if (idx < 0 || idx >= segs.length) idx = segs.length - 1;
  const seg = segs[idx];
  return seg ? lang + seg : null;
}

export function hebrewMainStrongs(dStrongs: string): string | null {
  const braced = dStrongs.match(/\{(H\d{4}[A-Za-z]?)\}/);
  if (braced) return braced[1];
  const any = dStrongs.match(/H\d{4}[A-Za-z]?/g);
  return any ? any[any.length - 1] : null;
}

/** Normalise Strong's numbers: "g976" -> "G0976", "H430G" -> "H0430G". */
export function normalizeStrongs(s: string): string | null {
  const m = s.trim().match(/^([GHgh])0*(\d{1,4})([A-Za-z]?)$/);
  if (!m) return null;
  return m[1].toUpperCase() + m[2].padStart(4, '0') + m[3].toUpperCase();
}

/** SQL LIKE pattern (as used in drill configs) -> RegExp */
export function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp('^' + escaped + '$');
}
