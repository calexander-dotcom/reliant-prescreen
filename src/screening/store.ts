import type { Answer } from './questions.js';

export type SessionStatus = 'active' | 'completed' | 'opted_out';

export interface Session {
  /** Candidate phone number in E.164 (the conversation key). */
  phone: string;
  /** Index of the question the candidate is currently answering. */
  currentIndex: number;
  /** Collected answers keyed by question id. */
  answers: Record<string, Answer>;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface SessionStore {
  get(phone: string): Promise<Session | undefined>;
  save(session: Session): Promise<void>;
}

/**
 * In-memory store — fine for a single instance and for tests. Swap in a
 * Redis/Postgres-backed implementation of SessionStore for production
 * (multi-instance) deployments.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  async get(phone: string): Promise<Session | undefined> {
    return this.sessions.get(phone);
  }

  async save(session: Session): Promise<void> {
    this.sessions.set(session.phone, session);
  }
}

export function newSession(phone: string, now: number): Session {
  return {
    phone,
    currentIndex: 0,
    answers: {},
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}
