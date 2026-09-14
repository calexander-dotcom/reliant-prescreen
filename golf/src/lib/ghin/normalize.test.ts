import { describe, expect, it } from "vitest";
import {
  normalizeCourseDetail,
  normalizeCourseSummaries,
  normalizeGolfers,
  normalizeLoginToken,
  parseHandicapIndex,
} from "./normalize";

describe("parseHandicapIndex", () => {
  it("reads a normal index", () => {
    expect(parseHandicapIndex("12.4")).toBe(12.4);
    expect(parseHandicapIndex(8)).toBe(8);
  });

  it("reads a plus handicap as a negative number", () => {
    expect(parseHandicapIndex("+1.2")).toBe(-1.2);
    expect(parseHandicapIndex("+0.4")).toBe(-0.4);
  });

  it("treats no-handicap markers as unknown", () => {
    expect(parseHandicapIndex("NH")).toBeNull();
    expect(parseHandicapIndex("WD")).toBeNull();
    expect(parseHandicapIndex("")).toBeNull();
    expect(parseHandicapIndex(null)).toBeNull();
  });
});

describe("normalizeGolfers", () => {
  it("reads snake_case favorites", () => {
    const players = normalizeGolfers({
      golfers: [
        { first_name: "Chris", last_name: "Alexander", ghin: "1234567", handicap_index: "12.4" },
        { first_name: "Dale", last_name: "Ruiz", ghin: "7654321", handicap_index: "+1.1" },
      ],
    });

    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      id: "ghin-1234567",
      name: "Chris Alexander",
      handicapIndex: 12.4,
      ghinNumber: "1234567",
      source: "ghin",
    });
    expect(players[1].handicapIndex).toBe(-1.1);
  });

  it("reads favorites wrapped one level deeper", () => {
    const players = normalizeGolfers({
      favorites: [{ golfer: { player_name: "Pat Lee", golfer_id: 987, hi_display: "3.1" } }],
    });
    expect(players[0]).toMatchObject({ name: "Pat Lee", handicapIndex: 3.1, id: "ghin-987" });
  });

  it("reads a bare array", () => {
    const players = normalizeGolfers([
      { FirstName: "Sam", LastName: "Ortiz", GHINNumber: "555", HandicapIndex: 20 },
    ]);
    expect(players[0]).toMatchObject({ name: "Sam Ortiz", handicapIndex: 20 });
  });

  it("drops duplicates and unusable rows", () => {
    const players = normalizeGolfers({
      golfers: [
        { first_name: "A", last_name: "B", ghin: "1" },
        { first_name: "A", last_name: "B", ghin: "1" },
        { nothing: "useful" },
      ],
    });
    expect(players).toHaveLength(1);
    expect(players[0].handicapIndex).toBeNull();
  });

  it("returns an empty list for an unexpected payload", () => {
    expect(normalizeGolfers(null)).toEqual([]);
    expect(normalizeGolfers({ message: "nope" })).toEqual([]);
  });
});

describe("normalizeCourseDetail", () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    Number: index + 1,
    Par: index % 3 === 0 ? 5 : 4,
    Length: 400 + index,
    Allocation: 18 - index,
  }));

  it("reads the PascalCase course rating payload", () => {
    const course = normalizeCourseDetail({
      CourseDetails: {
        CourseID: "12345",
        CourseName: "Test Dunes",
        City: "Monterey",
        State: "CA",
        TeeSets: [
          {
            TeeSetRatingId: "77001",
            TeeSetRatingName: "Blue",
            Gender: "M",
            TotalYardage: 6828,
            TotalPar: 72,
            Ratings: [
              { RatingType: "Front", CourseRating: 37.1, SlopeRating: 140 },
              { RatingType: "Total", CourseRating: 74.7, SlopeRating: 144 },
            ],
            Holes: holes,
          },
        ],
      },
    });

    expect(course).not.toBeNull();
    expect(course).toMatchObject({ id: "12345", name: "Test Dunes", state: "CA" });
    const tee = course!.tees[0];
    // The 18-hole numbers come from the "Total" rating, not the first entry.
    expect(tee).toMatchObject({
      id: "77001",
      name: "Blue",
      courseRating: 74.7,
      slopeRating: 144,
      par: 72,
      yardage: 6828,
    });
    expect(tee.holes).toHaveLength(18);
    expect(tee.holes[0]).toMatchObject({ number: 1, par: 5, strokeIndex: 18 });
    expect(tee.holes[17]).toMatchObject({ number: 18, strokeIndex: 1 });
  });

  it("reads a snake_case payload with ratings on the tee", () => {
    const course = normalizeCourseDetail({
      course: {
        course_id: 999,
        course_name: "City Muni",
        tees: [
          {
            tee_name: "White",
            course_rating: 69.5,
            slope_rating: 118,
            holes: [
              { number: 2, par: 3, allocation: 17 },
              { number: 1, par: 4, allocation: 6 },
            ],
          },
        ],
      },
    });

    const tee = course!.tees[0];
    expect(tee).toMatchObject({ name: "White", courseRating: 69.5, slopeRating: 118 });
    // Par is summed from the holes when no total is given, and holes get sorted.
    expect(tee.par).toBe(7);
    expect(tee.holes.map((hole) => hole.number)).toEqual([1, 2]);
  });

  it("falls back to scratch-neutral ratings when none are present", () => {
    const course = normalizeCourseDetail({
      CourseName: "No Ratings",
      TeeSets: [{ TeeSetRatingName: "Reds", TotalPar: 70, Holes: [] }],
    });
    expect(course!.tees[0]).toMatchObject({
      slopeRating: 113,
      courseRating: 70,
      par: 70,
    });
  });

  it("gives up only when there is no course name", () => {
    expect(normalizeCourseDetail({ TeeSets: [] })).toBeNull();
    expect(normalizeCourseDetail(null)).toBeNull();
  });
});

describe("normalizeCourseSummaries", () => {
  it("reads either casing and dedupes", () => {
    const courses = normalizeCourseSummaries({
      courses: [
        { CourseID: "1", CourseName: "Alpha", City: "Reno", State: "NV" },
        { course_id: "2", course_name: "Beta" },
        { CourseID: "1", CourseName: "Alpha" },
        { junk: true },
      ],
    });
    expect(courses).toHaveLength(2);
    expect(courses[0]).toEqual({ id: "1", name: "Alpha", city: "Reno", state: "NV" });
    expect(courses[1]).toMatchObject({ id: "2", name: "Beta", city: null });
  });
});

describe("normalizeLoginToken", () => {
  it("finds the token however it is nested", () => {
    expect(normalizeLoginToken({ golfer_user: { golfer_user_token: "abc" } })).toBe("abc");
    expect(normalizeLoginToken({ token: "xyz" })).toBe("xyz");
    expect(normalizeLoginToken({ data: { user: { jwt: "deep" } } })).toBe("deep");
    expect(normalizeLoginToken({ nope: true })).toBeNull();
  });
});
