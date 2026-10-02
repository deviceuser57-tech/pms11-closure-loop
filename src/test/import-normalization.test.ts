import { describe, expect, it } from "vitest";
import { normalizeRecord, toDatabaseRecord } from "@/lib/import.server";
import type { SeedRecord } from "@/lib/seed/derived";

const base = (): SeedRecord => ({
  entity: "task",
  rid: "T-TEST-001",
  title: "Normalization test",
  source_kind: "imported",
  evidence_ids: null as unknown as string[],
  acceptance_ids: null as unknown as string[],
  rule_ids: null as unknown as string[],
  links: null as unknown as string[],
  status: null as unknown as string,
  owner: " ",
  due_date: "" as unknown as string,
  data: null as unknown as Record<string, unknown>,
});

describe("import normalization", () => {
  it("converts null arrays to empty arrays and null data to an object", () => {
    const n = normalizeRecord(base());
    expect(n.evidence_ids).toEqual([]);
    expect(n.acceptance_ids).toEqual([]);
    expect(n.rule_ids).toEqual([]);
    expect(n.links).toEqual([]);
    expect(n.data).toEqual({});
  });

  it("removes blank optional values so database defaults/nullability apply", () => {
    const n = normalizeRecord(base());
    expect(n.owner).toBeUndefined();
    expect(n.status).toBeUndefined();
    expect(n.due_date).toBeUndefined();
  });

  it("builds a database payload with non-null arrays", () => {
    const db = toDatabaseRecord(base());
    expect(db.evidence_ids).toEqual([]);
    expect(db.acceptance_ids).toEqual([]);
    expect(db.rule_ids).toEqual([]);
    expect(db.links).toEqual([]);
    expect(db.data).toEqual({});
  });
});
