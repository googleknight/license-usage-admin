import { describe, expect, it } from "bun:test";
import {
  keepKnown,
  parseLicenseQuery,
  parsePositiveInt,
  serializeLicenseQuery,
} from "./params";
import { DEFAULT_QUERY } from "./query";
import type { LicenseQuery } from "./types";

describe("keepKnown", () => {
  it("drops values outside the allowed union", () => {
    expect(keepKnown(["Active", "Bogus", "Expired"], ["Active", "Expired"])).toEqual([
      "Active",
      "Expired",
    ]);
  });

  it("de-duplicates repeated values", () => {
    expect(keepKnown(["Active", "Active"], ["Active", "Expired"])).toEqual(["Active"]);
  });

  it("returns empty when nothing matches", () => {
    expect(keepKnown(["Nope"], ["Active"])).toEqual([]);
  });
});

describe("parsePositiveInt", () => {
  it("falls back on an absent param", () => {
    expect(parsePositiveInt(null, 1)).toBe(1);
  });

  it("falls back on zero, negatives, and non-numbers", () => {
    expect(parsePositiveInt("0", 1)).toBe(1);
    expect(parsePositiveInt("-3", 1)).toBe(1);
    expect(parsePositiveInt("abc", 1)).toBe(1);
    expect(parsePositiveInt("2.5", 1)).toBe(1);
  });

  it("keeps a valid positive integer", () => {
    expect(parsePositiveInt("7", 1)).toBe(7);
  });
});

describe("parseLicenseQuery", () => {
  it("returns the default query for an empty URL", () => {
    expect(parseLicenseQuery(new URLSearchParams())).toEqual(DEFAULT_QUERY);
  });

  it("reads a fully specified query", () => {
    const params = new URLSearchParams(
      "q=acme&status=Active&status=Expired&plan=Enterprise&sort=customerName&dir=desc&page=3&size=50",
    );
    expect(parseLicenseQuery(params)).toEqual({
      search: "acme",
      statuses: ["Active", "Expired"],
      plans: ["Enterprise"],
      sortField: "customerName",
      sortDirection: "desc",
      page: 3,
      pageSize: 50,
    });
  });

  it("drops bogus statuses and plans", () => {
    const params = new URLSearchParams("status=Active&status=Bogus&plan=Gold");
    const query = parseLicenseQuery(params);
    expect(query.statuses).toEqual(["Active"]);
    expect(query.plans).toEqual([]);
  });

  it("falls back on an unknown sort field and a non-desc direction", () => {
    const params = new URLSearchParams("sort=nope&dir=sideways");
    const query = parseLicenseQuery(params);
    expect(query.sortField).toBe(DEFAULT_QUERY.sortField);
    expect(query.sortDirection).toBe("asc");
  });

  it("falls back on a page size that is not an offered option", () => {
    expect(parseLicenseQuery(new URLSearchParams("size=999")).pageSize).toBe(
      DEFAULT_QUERY.pageSize,
    );
  });

  it("falls back on a non-positive page", () => {
    expect(parseLicenseQuery(new URLSearchParams("page=-1")).page).toBe(1);
    expect(parseLicenseQuery(new URLSearchParams("page=0")).page).toBe(1);
  });
});

describe("serializeLicenseQuery", () => {
  it("omits every field left at its default", () => {
    expect(serializeLicenseQuery(DEFAULT_QUERY).toString()).toBe("");
  });

  it("writes only the non-default fields", () => {
    const query: LicenseQuery = {
      ...DEFAULT_QUERY,
      search: "acme",
      statuses: ["Active"],
      page: 2,
    };
    const params = serializeLicenseQuery(query);
    expect(params.get("q")).toBe("acme");
    expect(params.getAll("status")).toEqual(["Active"]);
    expect(params.get("page")).toBe("2");
    expect(params.get("sort")).toBeNull();
    expect(params.get("size")).toBeNull();
  });

  it("round-trips a non-default query", () => {
    const query: LicenseQuery = {
      search: "acme",
      statuses: ["Active", "Suspended"],
      plans: ["Trial"],
      sortField: "status",
      sortDirection: "desc",
      page: 4,
      pageSize: 50,
    };
    expect(parseLicenseQuery(serializeLicenseQuery(query))).toEqual(query);
  });
});
