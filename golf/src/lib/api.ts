"use client";

import type { CourseSummary } from "./ghin/normalize";
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

export async function apiFavorites(token: string): Promise<Player[]> {
  const { players } = await request<{ players: Player[] }>("/api/ghin/favorites", {
    token,
  });
  return players ?? [];
}

export async function apiFavoriteCourses(token: string): Promise<CourseSummary[]> {
  const { courses } = await request<{ courses: CourseSummary[] }>(
    "/api/ghin/favorite-courses",
    { token },
  );
  return courses ?? [];
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
