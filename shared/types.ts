// Shapes of the curriculum JSON files in /curriculum.

export type Tradition = 'Patristic' | 'Catholic' | 'Lutheran' | 'Reformed' | 'Wesleyan' | 'Anabaptist' | 'Other';

export interface Objective {
  id: string;
  text: string;
}

export interface LibraryReading {
  author: string;
  title: string;
  section: string;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  type: 'multiple_choice';
  question: string;
  options: string[];
  answer: number; // index into options
  explanation?: string;
}

export interface ShortAnswerQuestion {
  id: string;
  type: 'short_answer';
  question: string;
  answer_key: string; // what a good answer must contain
}

export type QuizQuestion = MultipleChoiceQuestion | ShortAnswerQuestion;

export interface DrillConfig {
  language: 'greek' | 'hebrew';
  /** SQL LIKE patterns over STEPBible morphology codes, e.g. ["N-%"] or ["HVq%"] */
  morph_patterns: string[];
  /** Which fields the student must parse, e.g. ["Case","Number","Gender"] */
  fields: string[];
  /** Optional list of STEPBible book codes to draw words from */
  books?: string[];
  instructions: string;
}

export interface Lesson {
  id: string;
  title: string;
  objectives: Objective[];
  scripture_passages: string[];
  library_readings: LibraryReading[];
  key_terms: KeyTerm[];
  discussion_questions: string[];
  quiz_bank: QuizQuestion[];
  paper_prompt?: string;
  supplementary_viewing?: string;
  drill?: DrillConfig;
}

export interface Course {
  id: string;
  title: string;
  tier: number; // 1-5, 6 = Capstone
  tier_name: string;
  description: string;
  prerequisites: string[];
  elective?: boolean;
  lessons: Lesson[];
}

/** Public copy sent to the browser: no answer keys. */
export type PublicLesson = Omit<Lesson, 'quiz_bank'> & { quiz_bank_size: number };
export type PublicCourse = Omit<Course, 'lessons'> & { lessons: PublicLesson[] };

export const TIER_NAMES: Record<number, string> = {
  1: 'Foundations',
  2: 'Languages',
  3: 'Biblical Studies',
  4: 'Theology',
  5: 'Ministry',
  6: 'Capstone',
};

export const RUBRIC = [
  { key: 'thesis', label: 'Thesis', description: 'A clear, arguable claim that the paper actually defends.' },
  { key: 'exegesis', label: 'Exegesis', description: 'Careful reading of Scripture in its literary, historical and canonical context.' },
  { key: 'sources', label: 'Use of sources', description: 'Accurate, fair and properly cited use of the assigned readings and other sources.' },
  { key: 'reasoning', label: 'Theological reasoning', description: 'Sound argument, awareness of other views, and coherent theological synthesis.' },
  { key: 'clarity', label: 'Clarity', description: 'Organisation, style, grammar and readability.' },
] as const;

export type RubricKey = (typeof RUBRIC)[number]['key'];

export const QUIZ_LENGTH = 10;
export const QUIZ_PASS_PERCENT = 80;
export const PAPER_PASS_AVERAGE = 3;
