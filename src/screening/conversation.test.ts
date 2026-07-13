import { describe, it, expect } from 'vitest';
import { advance } from './conversation.js';
import { SCREENING_QUESTIONS } from './questions.js';
import type { Session } from './store.js';

const PHONE = '+15555550123';
const T0 = 1_700_000_000_000;

/** Drive a full happy-path conversation and return the final session. */
function runConversation(answers: string[]): { session: Session; lastReplies: string[] } {
  let session: Session | undefined;
  let lastReplies: string[] = [];
  // Kick off with an initial inbound to receive question 0.
  const start = advance(PHONE, session, 'hi', T0);
  session = start.session;
  lastReplies = start.replies;
  for (const answer of answers) {
    const result = advance(PHONE, session, answer, T0);
    session = result.session;
    lastReplies = result.replies;
  }
  return { session: session!, lastReplies };
}

describe('advance', () => {
  it('greets a first-time contact with the first question', () => {
    const { session, replies } = advance(PHONE, undefined, 'hello', T0);
    expect(session.phone).toBe(PHONE);
    expect(session.status).toBe('active');
    expect(session.currentIndex).toBe(0);
    expect(replies).toEqual([SCREENING_QUESTIONS[0].prompt]);
  });

  it('walks the full script and completes with all answers stored', () => {
    const { session, lastReplies } = runConversation([
      'Jane Doe',
      'RN',
      'yes',
      '7',
      'YES',
      'Night',
    ]);
    expect(session.status).toBe('completed');
    expect(session.answers).toEqual({
      full_name: 'Jane Doe',
      profession: 'RN',
      active_license: true,
      years_experience: 7,
      available_immediately: true,
      shift_preference: 'Night',
    });
    expect(lastReplies[0]).toMatch(/completed the pre-screening/i);
  });

  it('re-prompts on an invalid answer without advancing', () => {
    const start = advance(PHONE, undefined, 'hi', T0); // -> asks full_name
    const named = advance(PHONE, start.session, 'Jane', T0); // -> asks profession
    const licensed = advance(PHONE, named.session, 'RN', T0); // -> asks active_license (yes/no)
    const bad = advance(PHONE, licensed.session, 'maybe', T0);
    expect(bad.session.currentIndex).toBe(licensed.session.currentIndex);
    expect(bad.replies[0]).toMatch(/YES or NO/i);
    // The question is repeated as the second reply.
    expect(bad.replies[1]).toBe(SCREENING_QUESTIONS[bad.session.currentIndex].prompt);
  });

  it('rejects a negative number for years of experience', () => {
    const start = advance(PHONE, undefined, 'hi', T0);
    const named = advance(PHONE, start.session, 'Jane', T0);
    const prof = advance(PHONE, named.session, 'RN', T0);
    const licensed = advance(PHONE, prof.session, 'yes', T0); // -> asks years_experience
    const bad = advance(PHONE, licensed.session, '-3', T0);
    expect(bad.session.answers.years_experience).toBeUndefined();
    expect(bad.replies[0]).toMatch(/number/i);
  });

  it('opts a candidate out on STOP and stays silent afterward', () => {
    const start = advance(PHONE, undefined, 'hi', T0);
    const stopped = advance(PHONE, start.session, 'STOP', T0);
    expect(stopped.session.status).toBe('opted_out');
    expect(stopped.replies[0]).toMatch(/opted out/i);

    const afterStop = advance(PHONE, stopped.session, 'hello again', T0);
    expect(afterStop.replies).toEqual([]);
    expect(afterStop.session.status).toBe('opted_out');
  });

  it('re-opens the screening from the top on START', () => {
    const start = advance(PHONE, undefined, 'hi', T0);
    const stopped = advance(PHONE, start.session, 'STOP', T0);
    const restarted = advance(PHONE, stopped.session, 'START', T0);
    expect(restarted.session.status).toBe('active');
    expect(restarted.session.currentIndex).toBe(0);
    expect(restarted.replies).toEqual([SCREENING_QUESTIONS[0].prompt]);
  });

  it('answers HELP without changing progress', () => {
    const start = advance(PHONE, undefined, 'hi', T0);
    const named = advance(PHONE, start.session, 'Jane', T0);
    const help = advance(PHONE, named.session, 'help', T0);
    expect(help.session.currentIndex).toBe(named.session.currentIndex);
    expect(help.replies[0]).toMatch(/automated pre-screening/i);
  });

  it('acknowledges further messages after completion without re-running', () => {
    const { session } = runConversation(['Jane Doe', 'RN', 'yes', '7', 'YES', 'Night']);
    const after = advance(PHONE, session, 'anything', T0);
    expect(after.session.status).toBe('completed');
    expect(after.replies[0]).toMatch(/already complete/i);
  });
});
