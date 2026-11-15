import { describe, expect, it } from "vitest";
import {
  BA_STEP_UP_ACTIONS,
  BA_STEP_UP_ACTION_LABELS,
  baStepUpPermission,
  isBaStepUpAction,
} from "@/lib/admin-step-up-actions";

describe("BA step-up actions", () => {
  it("only exposes high-risk certificate actions", () => {
    expect(Object.keys(BA_STEP_UP_ACTIONS)).toEqual([
      "ba.certificates.issue",
      "ba.certificates.revoke",
      "ba.certificates.delete",
    ]);
    expect(isBaStepUpAction("ba.certificates.issue")).toBe(true);
    expect(isBaStepUpAction("ba.certificates.update")).toBe(false);
    expect(isBaStepUpAction("ba.complaints.delete")).toBe(false);
  });

  it("maps each action to its permission and label", () => {
    expect(baStepUpPermission("ba.certificates.issue")).toBe(
      "ba:certificates:issue",
    );
    expect(baStepUpPermission("ba.certificates.revoke")).toBe(
      "ba:certificates:revoke",
    );
    expect(baStepUpPermission("ba.certificates.delete")).toBe(
      "ba:certificates:delete",
    );
    for (const action of Object.keys(BA_STEP_UP_ACTIONS)) {
      expect(BA_STEP_UP_ACTION_LABELS[action as keyof typeof BA_STEP_UP_ACTION_LABELS]).toBeTruthy();
    }
  });
});
