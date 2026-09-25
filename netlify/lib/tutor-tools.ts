// The tools the tutor can call. Each runs server-side against the app's database.
import type Anthropic from '@anthropic-ai/sdk';
import type { Lesson } from '../../shared/types';
import { lexiconEntry, lookupOriginal, lookupVerse, searchLibrary } from './biblical';

export const TUTOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'lookup_verse',
    description:
      'Get the text of a Bible passage. Use before quoting or discussing any Scripture. Reference examples: "John 3:16", "Romans 3:21-26", "Genesis 1:1-2:3", "Psalm 23". Returns up to 60 verses.',
    input_schema: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'A single Bible reference or continuous range.' },
        translation: { type: 'string', enum: ['BSB', 'KJV', 'WEB'], description: 'Defaults to BSB.' },
      },
      required: ['reference'],
    },
  },
  {
    name: 'lookup_original',
    description:
      'Get the original Greek (NT) or Hebrew/Aramaic (OT) words of a passage from STEPBible (TAGNT/TAHOT), each with transliteration, English gloss, Strong\'s number, lexicon form, and full morphological parsing. Use for ANY Greek or Hebrew claim. Keep ranges short (up to 6 verses).',
    input_schema: {
      type: 'object',
      properties: { reference: { type: 'string', description: 'e.g. "John 1:1" or "Genesis 1:1-3"' } },
      required: ['reference'],
    },
  },
  {
    name: 'lexicon',
    description:
      "Look up a Greek or Hebrew word in the STEPBible lexicons (TBESG/TBESH) by Strong's number, e.g. G0026 (agapē) or H2617 (chesed). Returns lemma, transliteration, gloss and definition.",
    input_schema: {
      type: 'object',
      properties: { strongs_number: { type: 'string', description: "Strong's number such as G0976, H1254 or H1254A" } },
      required: ['strongs_number'],
    },
  },
  {
    name: 'search_library',
    description:
      'Keyword search over the public-domain theology, church history and commentary library (Church Fathers, Augustine, Anselm, Aquinas, Luther, Calvin, Wesley, Arminius, Hodge, Schaff, Edersheim, Matthew Henry, JFB, Spurgeon, etc.). Returns passages with author, title, section and source URL for citation. Search with distinctive key words (names, technical terms, phrases the author would use), not whole questions; if nothing comes back, try other words. Use a tradition filter to find a specific tradition\'s own view on a disputed question.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Key words to look for, e.g. "justification faith works" or "Arius Son begotten".' },
        tradition_filter: {
          type: 'string',
          enum: ['Patristic', 'Catholic', 'Lutheran', 'Reformed', 'Wesleyan', 'Anabaptist', 'Other'],
          description: 'Optional: restrict to one tradition.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'mark_objective_complete',
    description:
      "Record that the student has demonstrated understanding of one lesson objective. Call only after the student has shown understanding in their own words. Use the objective's id exactly as given in the lesson JSON (e.g. \"o1\").",
    input_schema: {
      type: 'object',
      properties: { objective_id: { type: 'string' } },
      required: ['objective_id'],
    },
  },
];

export interface ToolContext {
  lesson: Lesson;
  markObjective: (objectiveId: string) => Promise<{ allComplete: boolean; remaining: string[] }>;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  objectiveCompleted?: string;
  lessonComplete?: boolean;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'lookup_verse': {
        const reference = str(args.reference);
        if (!reference) return { content: 'reference is required', isError: true };
        return { content: JSON.stringify(await lookupVerse(reference, str(args.translation) || 'BSB')) };
      }
      case 'lookup_original': {
        const reference = str(args.reference);
        if (!reference) return { content: 'reference is required', isError: true };
        return { content: JSON.stringify(await lookupOriginal(reference)) };
      }
      case 'lexicon': {
        const s = str(args.strongs_number);
        if (!s) return { content: 'strongs_number is required', isError: true };
        return { content: JSON.stringify(await lexiconEntry(s)) };
      }
      case 'search_library': {
        const query = str(args.query);
        if (!query) return { content: 'query is required', isError: true };
        const res = await searchLibrary(query, { tradition: str(args.tradition_filter) || null, count: 5 });
        return {
          content: JSON.stringify({
            method: res.method,
            note: res.note,
            results: res.results.map((r) => ({
              cite_as: r.citation,
              author: r.author,
              title: r.title,
              section: r.section_ref,
              tradition: r.tradition,
              source_url: r.source_url,
              text: r.content,
            })),
          }),
        };
      }
      case 'mark_objective_complete': {
        const id = str(args.objective_id);
        if (!ctx.lesson.objectives.some((o) => o.id === id)) {
          return {
            content: `Unknown objective id "${id}". Valid ids: ${ctx.lesson.objectives.map((o) => o.id).join(', ')}`,
            isError: true,
          };
        }
        const { allComplete, remaining } = await ctx.markObjective(id);
        return {
          content: allComplete
            ? 'Objective recorded. ALL objectives are now complete: tell the student the lesson is finished, summarise briefly, and tell them the quiz below the chat is now unlocked.'
            : `Objective recorded. Remaining objectives: ${remaining.join(', ')}.`,
          objectiveCompleted: id,
          lessonComplete: allComplete,
        };
      }
      default:
        return { content: `Unknown tool ${name}`, isError: true };
    }
  } catch (e) {
    console.error(`tool ${name} failed`, e);
    return { content: `The ${name} lookup failed (${(e as Error).message}). Tell the student you could not verify this right now.`, isError: true };
  }
}
