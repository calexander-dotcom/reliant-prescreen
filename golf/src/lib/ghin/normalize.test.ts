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
    expect(courses[0]).toMatchObject({
      id: "1",
      name: "Alpha",
      city: "Reno",
      state: "NV",
    });
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

/**
 * Shapes taken from a real capture of GHIN's own site. Key names are exactly
 * what the API returns; every value here is made up.
 */
describe("real GHIN payload shapes", () => {
  it("reads the followed-golfers list", () => {
    const players = normalizeGolfers({
      golfers: [
        {
          id: 1111111,
          first_name: "Ada",
          last_name: "Byron",
          soft_cap: "false",
          hard_cap: "false",
          gender: "F",
          handicap_index_display: "14.2",
          message_club_authorized: null,
          low_hi_display: "12.8",
          low_hi_date: "2026-05-01",
          golf_association_id: 22,
          club_id: 333,
          club_name: "Somewhere CC",
          suffix: null,
          use_scaling: false,
        },
        {
          id: 2222222,
          first_name: "Grace",
          last_name: "Hopper",
          gender: "F",
          handicap_index_display: "+1.4",
          low_hi_display: "+1.8",
          club_name: "Elsewhere GC",
        },
      ],
    });

    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({
      id: "ghin-1111111",
      name: "Ada Byron",
      ghinNumber: "1111111",
      // Comes from handicap_index_display, not handicap_index.
      handicapIndex: 14.2,
      source: "ghin",
    });
    // A plus index stays negative through the display field too.
    expect(players[1].handicapIndex).toBe(-1.4);
  });

  it("falls back to the low index when no current one is published", () => {
    const players = normalizeGolfers({
      golfers: [{ id: 9, first_name: "N", last_name: "H", low_hi_display: "20.1" }],
    });
    expect(players[0].handicapIndex).toBe(20.1);
  });

  it("reads my_courses, which nests under golfer_course_preference", () => {
    const courses = normalizeCourseSummaries({
      golfer_course_preference: [
        {
          id: 1,
          course_id: 50001,
          course_name: "Test Links",
          tee_id: "77001",
          tee_name: "Blue",
          facility_id: 999,
          facility_name: "Test Links Facility",
          order_number: 1,
        },
      ],
    });
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({
      id: "50001",
      name: "Test Links",
      facility: "Test Links Facility",
    });
  });

  it("reads the recently-played course list", () => {
    const courses = normalizeCourseSummaries({
      courses: [
        {
          CourseId: "50001",
          CourseName: "Test Links",
          CourseCity: "Monterey",
          CourseState: "CA",
          TeeSetId: "77001",
          TeeName: "Blue",
          FacilityId: "1",
          FacilityName: "Test Links Facility",
          Ratings: [
            { RatingType: "Total", CourseRating: 73.5, SlopeRating: 134, BogeyRating: 98.4 },
          ],
        },
      ],
    });
    expect(courses[0]).toMatchObject({
      id: "50001",
      name: "Test Links",
      city: "Monterey",
      state: "CA",
    });
  });

  it("reads course details straight off the top level, unwrapped", () => {
    const course = normalizeCourseDetail({
      Facility: { FacilityName: "Test Links Facility" },
      Season: { SeasonName: "Year Round" },
      CourseId: 50001,
      CourseName: "Test Links",
      CourseStatus: "Active",
      CourseNumber: 1,
      CourseCity: "Monterey",
      CourseState: "CA",
      TeeSets: [
        {
          Ratings: [
            { RatingType: "Total", CourseRating: 73.5, SlopeRating: 134, BogeyRating: 98.4 },
            { RatingType: "Front", CourseRating: 36.5, SlopeRating: 135, BogeyRating: 49 },
            { RatingType: "Back", CourseRating: 37.0, SlopeRating: 133, BogeyRating: 49.4 },
          ],
          Holes: [
            { Number: 1, HoleId: 1, Length: 317, Par: 4, Allocation: 17 },
            { Number: 2, HoleId: 2, Length: 520, Par: 5, Allocation: 3 },
          ],
          TeeSetRatingId: "77001",
          TeeSetRatingName: "Blue",
          Gender: "M",
          HolesNumber: 18,
          TotalYardage: 6543,
          TotalMeters: 5983,
          StrokeAllocation: "Standard",
          TotalPar: 72,
          IsShorter: false,
        },
      ],
    });

    expect(course).toMatchObject({
      id: "50001",
      name: "Test Links",
      city: "Monterey",
      state: "CA",
    });
    const tee = course!.tees[0];
    expect(tee).toMatchObject({
      id: "77001",
      name: "Blue",
      gender: "M",
      // The "Total" rating, not the first entry in the array.
      courseRating: 73.5,
      slopeRating: 134,
      par: 72,
      yardage: 6543,
    });
    // Allocation is the stroke index, which is what strokes get assigned by.
    expect(tee.holes[0]).toMatchObject({ number: 1, par: 4, yardage: 317, strokeIndex: 17 });
    expect(tee.holes[1]).toMatchObject({ number: 2, par: 5, strokeIndex: 3 });
  });
});
