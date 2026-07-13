import { SCREENING_QUESTIONS, type Question } from './questions.js';
import { newSession, type Session } from './store.js';

export interface AdvanceResult {
  session: Session;
  /** Messages to send back to the candidate, in order. Empty = stay silent. */
  replies: string[];
}

/**
 * Carrier compliance keywords. Note: if Advanced Opt-Out is enabled on the
 * Twilio number, STOP/START/HELP may be handled by Twilio before reaching us.
 * We still handle them defensively so the flow stays consistent either way.
 */
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);
const START_WORDS = new Set(['start', 'unstop']);
const HELP_WORDS = new Set(['help', 'info']);

const HELP_MESSAGE =
  'This is an automated pre-screening from Reliant. Answer each question to continue. Reply STOP to opt out.';

function isCommand(set: Set<string>, raw: string): boolean {
  return set.has(raw.trim().toLowerCase());
}

function completionMessage(): string {
  return "Thank you! You've completed the pre-screening. A recruiter will follow up with you shortly.";
}

/**
 * Core state machine. Pure and free of Twilio/IO so it can be unit-tested.
 *
 * @param phone     candidate phone number in E.164 (the conversation key)
 * @param existing  the candidate's current session, or undefined for a first contact
 * @param raw       the inbound SMS body
 * @param now       current epoch millis (injected for deterministic tests)
 * @param questions the screening script (injectable for tests)
 */
export function advance(
  phone: string,
  existing: Session | undefined,
  raw: string,
  now: number,
  questions: Question[] = SCREENING_QUESTIONS,
): AdvanceResult {
  // HELP works in any state and does not alter the flow.
  if (existing && isCommand(HELP_WORDS, raw)) {
    return { session: touch(existing, now), replies: [HELP_MESSAGE] };
  }

  // Opt-out from any active/completed state.
  if (existing && existing.status !== 'opted_out' && isCommand(STOP_WORDS, raw)) {
    return {
      session: { ...existing, status: 'opted_out', updatedAt: now },
      replies: ["You've been opted out and will not receive further messages. Reply START to opt back in."],
    };
  }

  // An opted-out candidate only re-engages by texting START.
  if (existing?.status === 'opted_out') {
    if (!isCommand(START_WORDS, raw)) {
      return { session: existing, replies: [] };
    }
    return { session: newSession(phone, now), replies: [questions[0].prompt] };
  }

  // First contact.
  if (!existing) {
    return { session: newSession(phone, now), replies: [questions[0].prompt] };
  }

  // Already finished — acknowledge without re-running the script.
  if (existing.status === 'completed') {
    return {
      session: touch(existing, now),
      replies: ['Your screening is already complete. A recruiter will be in touch. Reply STOP to opt out.'],
    };
  }

  // Active: parse the answer to the current question.
  const question = questions[existing.currentIndex];
  const parsed = question.parse(raw);
  if (!parsed.ok) {
    return {
      session: touch(existing, now),
      replies: [parsed.error ?? 'Sorry, I did not understand that.', question.prompt],
    };
  }

  const answers = { ...existing.answers, [question.id]: parsed.value! };
  const nextIndex = existing.currentIndex + 1;

  if (nextIndex >= questions.length) {
    return {
      session: { ...existing, answers, currentIndex: nextIndex, status: 'completed', updatedAt: now },
      replies: [completionMessage()],
    };
  }

  return {
    session: { ...existing, answers, currentIndex: nextIndex, updatedAt: now },
    replies: [questions[nextIndex].prompt],
  };
}

function touch(session: Session, now: number): Session {
  return { ...session, updatedAt: now };
}
