"use client";

import { useEffect, useState } from "react";
import { ApiError, apiCourse, apiMyCourses, apiSearchCourses } from "@/lib/api";
import { GhinDiagnostics } from "./GhinDiagnostics";
import type { CourseSummary } from "@/lib/ghin/normalize";
import type { GhinProbe } from "@/lib/ghin/shape";
import { preferredTeeId, saveTeePref } from "@/lib/storage";
import type { Round } from "@/lib/types";
import { Banner, Button, Card, Field, SectionTitle, Spinner, inputClass } from "./ui";

export function CoursePicker({
  round,
  update,
  golferId,
  token,
  onSessionExpired,
}: {
  round: Round;
  update: (next: Round) => void;
  golferId: string | null;
  token: string | null;
  /** Called when a lookup shows the GHIN session has run out. */
  onSessionExpired?: () => void;
}) {
  const [saved, setSaved] = useState<CourseSummary[]>([]);
  const [savedProbes, setSavedProbes] = useState<GhinProbe[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The round needs a course: the pars for the greenies, the stroke index for
  // the handicaps, the tees. Typing a name instead is a deliberate fallback
  // for when GHIN is out of reach, behind a tap, not the default path.
  const [withoutData, setWithoutData] = useState(
    () => round.course === null && round.courseName.trim().length > 0,
  );

  useEffect(() => {
    if (!golferId || !token) return;
    let cancelled = false;
    setBusy("saved");
    apiMyCourses(golferId, token)
      .then((result) => {
        if (cancelled) return;
        setSaved(result.courses);
        // Keep the attempt log so an empty list is explainable, not a mystery.
        setSavedProbes(result.courses.length === 0 ? result.probes : null);
      })
      .catch(() => {
        // A missing saved-courses endpoint is fine — search still works.
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [golferId, token]);

  const search = async () => {
    setBusy("search");
    setError(null);
    try {
      setResults(await apiSearchCourses(token, query.trim()));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Course search failed.");
      setResults([]);
    } finally {
      setBusy(null);
    }
  };

  const choose = async (summary: CourseSummary) => {
    setBusy(summary.id);
    setError(null);
    try {
      const course = await apiCourse(token, summary.id);
      // Open on the tee this course was played from last, not just the first.
      const teeId = preferredTeeId(course.id, course.tees);
      const tee = course.tees.find((entry) => entry.id === teeId) ?? course.tees[0] ?? null;
      update({
        ...round,
        course,
        courseName: course.name,
        teeId: tee?.id ?? null,
        holeCount: (tee?.holes.length ?? 18) > 9 ? 18 : tee?.holes.length === 9 ? 9 : 18,
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not load that course.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <SectionTitle hint="Pulls tees, ratings and hole-by-hole par and stroke index.">
        Course
      </SectionTitle>

      {round.course ? (
        <div className="mb-3 rounded-xl bg-turf-50 p-3 ring-1 ring-inset ring-turf-200">
          <div className="font-bold text-turf-900">{round.course.name}</div>
          <div className="text-sm text-turf-800">
            {[round.course.city, round.course.state].filter(Boolean).join(", ")}
          </div>
          {round.course.tees.length > 0 ? (
            <div className="mt-3">
              <Field label="Tees">
                <select
                  // Distinct from the per-player tee selects below it.
                  aria-label="Tees for the round"
                  value={round.teeId ?? ""}
                  onChange={(event) => {
                    const teeId = event.target.value;
                    const tee = round.course?.tees.find((entry) => entry.id === teeId);
                    // Remember it, so this course and the next open here.
                    if (round.course && tee) {
                      saveTeePref(round.course.id, tee.id, tee.name);
                    }
                    update({ ...round, teeId });
                  }}
                  className={inputClass}
                >
                  {round.course.tees.map((tee) => (
                    <option key={tee.id} value={tee.id}>
                      {tee.name}
                      {tee.gender ? ` (${tee.gender})` : ""} — {tee.courseRating} /{" "}
                      {tee.slopeRating}
                      {tee.yardage ? ` · ${tee.yardage} yds` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <Banner tone="warn">
              This course came back with no tee ratings, so handicaps fall back to
              scratch. You can still score and track money.
            </Banner>
          )}
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => update({ ...round, course: null, teeId: null, courseName: "" })}
            >
              Change course
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {token ? (
            <>
              {saved.length > 0 ? (
                <div>
                  <div className="mb-1.5 text-sm font-semibold text-neutral-700">
                    Your GHIN courses
                  </div>
                  <ul className="space-y-1.5">
                    {saved.map((course) => (
                      <CourseRow
                        key={course.id}
                        course={course}
                        busy={busy === course.id}
                        onChoose={() => void choose(course)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}

              {savedProbes ? (
                <GhinDiagnostics
                  probes={savedProbes}
                  subject="your courses"
                  onSignInAgain={onSessionExpired}
                />
              ) : null}

              <div>
                <Field label="Search GHIN courses" hint="This is the reliable path — GHIN's saved-course list is not always available.">
                  <div className="flex gap-2">
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className={inputClass}
                      placeholder="At least 3 letters"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && query.trim().length >= 3) {
                          void search();
                        }
                      }}
                    />
                    <Button
                      onClick={() => void search()}
                      disabled={query.trim().length < 3 || busy === "search"}
                    >
                      Find course
                    </Button>
                  </div>
                </Field>
                {busy === "search" || busy === "saved" ? (
                  <div className="mt-2">
                    <Spinner label="Asking GHIN…" />
                  </div>
                ) : null}
                {results !== null && results.length === 0 && busy !== "search" ? (
                  <p className="mt-2 text-sm text-neutral-600">No courses matched.</p>
                ) : null}
                {results && results.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {results.map((course) => (
                      <CourseRow
                        key={course.id}
                        course={course}
                        busy={busy === course.id}
                        onChoose={() => void choose(course)}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : (
            <Banner tone="warn">
              Sign in to GHIN above to choose the course. That brings the pars for
              the greenies, the stroke index for the handicaps, and the tees.
            </Banner>
          )}

          {error ? <Banner tone="error">{error}</Banner> : null}

          {withoutData ? (
            <Field
              label="Course name"
              hint="Without course data every hole is a par 4, so there are no greenies, and handicap strokes go by hole number."
            >
              <input
                value={round.courseName}
                onChange={(event) => update({ ...round, courseName: event.target.value })}
                className={inputClass}
                placeholder="Riverside Municipal"
                aria-label="Course name"
              />
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setWithoutData(true)}
              className="text-sm font-semibold text-turf-700 underline-offset-2 hover:underline"
            >
              No GHIN, or no signal? Start without course data
            </button>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <Field label="Holes">
          <div className="flex gap-2">
            {[9, 18].map((count) => (
              <Button
                key={count}
                variant={round.holeCount === count ? "primary" : "secondary"}
                onClick={() => update({ ...round, holeCount: count })}
              >
                {count} holes
              </Button>
            ))}
          </div>
        </Field>
      </div>
    </Card>
  );
}

function CourseRow({
  course,
  busy,
  onChoose,
}: {
  course: CourseSummary;
  busy: boolean;
  onChoose: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        disabled={busy}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2.5 text-left active:bg-neutral-100"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-neutral-900">
            {course.name}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {[course.city, course.state].filter(Boolean).join(", ") || "—"}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-turf-700">
          {busy ? "Loading…" : "Use"}
        </span>
      </button>
    </li>
  );
}
