import { describe, expect, it } from "vitest";
import { actionProposalSchema } from "./schemas";

const proposal = {
  actionId: "AP-1",
  type: "SNAPSHOT",
  arguments: {},
  reason: "Read the latest page state",
  risk: "low",
};

describe("actionProposalSchema", () => {
  it("accepts an empty backend target for actions without an element", () => {
    const parsed = actionProposalSchema.safeParse({
      ...proposal,
      target: {},
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.target).toBeUndefined();
  });

  it("still validates targeted actions", () => {
    expect(
      actionProposalSchema.safeParse({
        ...proposal,
        type: "SET_EDITOR",
        target: {
          snapshotId: "snap_1",
          frameId: 0,
          elementId: "el_1",
        },
      }).success,
    ).toBe(true);
  });
});
