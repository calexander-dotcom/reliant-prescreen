"use client";

import type { CourseSummary } from "./ghin/normalize";
import type { GhinProbe } from "./ghin/shape";
import type { Course, Player } from "./types";

/** Browser-side calls to this app's own routes, which proxy GHIN server-side. */

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | null;

  constructor(message: string, status: number, detail: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const record = (payload ?? {}) as { error?: string; detail?: string };
    throw new ApiError(
      record.error || `Request failed (${response.status}).`,
      response.status,
      record.detail ?? null,
    );
  }

  return payload as T;
}

export async function apiLogin(emailOrGhin: string, password: string): Promise<string> {
  const { token } = await request<{ token: string }>("/api/ghin/login", {
    method: "POST",
    body: JSON.stringify({ emailOrGhin, password }),
  });
  return token;
}

export interface GolferLookup {
  players: Player[];
  probes: GhinProbe[];
}

export async function apiFollowing(token: string): Promise<GolferLookup> {
  const payload = await request<GolferLookup>("/api/ghin/following", { token });
  return { players: payload.players ?? [], probes: payload.probes ?? [] };
}

/** Name or GHIN number lookup — does not need saved favorites. */
export async function apiSearchGolfers(
  token: string,
  query: string,
): Promise<GolferLookup> {
  const payload = await request<GolferLookup>(
    `/api/ghin/golfers/search?q=${encodeURIComponent(query)}`,
    { token },
  );
  return { players: payload.players ?? [], probes: payload.probes ?? [] };
}

export interface CourseLookup {
  courses: CourseSummary[];
  probes: GhinProbe[];
}

export async function apiFavoriteCourses(token: string): Promise<CourseLookup> {
  const payload = await request<CourseLookup>("/api/ghin/favorite-courses", {
    token,
  });
  return { courses: payload.courses ?? [], probes: payload.probes ?? [] };
}

export async function apiSearchCourses(
  token: string,
  query: string,
): Promise<CourseSummary[]> {
  const { courses } = await request<{ courses: CourseSummary[] }>(
    `/api/ghin/courses/search?q=${encodeURIComponent(query)}`,
    { token },
  );
  return courses ?? [];
}

export async function apiCourse(token: string, id: string): Promise<Course> {
  const { course } = await request<{ course: Course }>(
    `/api/ghin/courses/${encodeURIComponent(id)}`,
    { token },
  );
  return course;
}
