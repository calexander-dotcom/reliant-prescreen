/**
 * Data-driven pre-screening script.
 *
 * Each question is answered by a single inbound SMS. The flow walks the list in
 * order; `parse` normalizes the raw text into a stored value and rejects invalid
 * answers (the candidate is re-prompted until the answer parses).
 *
 * Reshape the screening simply by editing this array — the conversation engine
 * and webhook do not need to change.
 */

export type Answer = string | number | boolean;

export interface ParseResult {
  ok: boolean;
  /** Normalized value to store when ok. */
  value?: Answer;
  /** Message shown to the candidate when the answer could not be parsed. */
  error?: string;
}

export interface Question {
  /** Stable key the answer is stored under. */
  id: string;
  /** Prompt sent to the candidate. */
  prompt: string;
  parse: (raw: string) => ParseResult;
}

const YES = new Set(['y', 'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', '1', 'true']);
const NO = new Set(['n', 'no', 'nope', 'nah', '0', 'false']);

function yesNo(raw: string): ParseResult {
  const t = raw.trim().toLowerCase();
  if (YES.has(t)) return { ok: true, value: true };
  if (NO.has(t)) return { ok: true, value: false };
  return { ok: false, error: 'Please reply YES or NO.' };
}

function nonNegativeNumber(raw: string): ParseResult {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'Please reply with a number (e.g. 5).' };
  }
  return { ok: true, value: n };
}

function nonEmptyText(raw: string): ParseResult {
  const t = raw.trim();
  if (t.length === 0) {
    return { ok: false, error: 'Please provide an answer.' };
  }
  return { ok: true, value: t };
}

export const SCREENING_QUESTIONS: Question[] = [
  {
    id: 'full_name',
    prompt: 'Thanks for your interest! To start, what is your full name?',
    parse: nonEmptyText,
  },
  {
    id: 'profession',
    prompt: 'What is your profession or specialty? (e.g. RN, LPN, CNA)',
    parse: nonEmptyText,
  },
  {
    id: 'active_license',
    prompt: 'Do you hold an active license/certification for this role? Reply YES or NO.',
    parse: yesNo,
  },
  {
    id: 'years_experience',
    prompt: 'How many years of experience do you have? Reply with a number.',
    parse: nonNegativeNumber,
  },
  {
    id: 'available_immediately',
    prompt: 'Are you available to start within the next 2 weeks? Reply YES or NO.',
    parse: yesNo,
  },
  {
    id: 'shift_preference',
    prompt: 'Which shift do you prefer? (Day, Night, or Flexible)',
    parse: nonEmptyText,
  },
];
