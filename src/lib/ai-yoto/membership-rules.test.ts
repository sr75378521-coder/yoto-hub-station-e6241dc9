// @vitest-environment node
import { expect, it } from "vitest";
import { effectivePlan, assertMembershipAdmin } from "./membership-rules";
it("awards full Pro Max with no expiration", () =>
  expect(effectivePlan("free", { plan: "pro_max", expires_at: null })).toBe("pro_max"));
it("expired awards no longer grant access", () =>
  expect(
    effectivePlan("free", { plan: "pro_max", expires_at: "2026-01-01" }, Date.parse("2026-10-23")),
  ).toBe("free"));
it("awards never reduce an existing paid tier", () =>
  expect(effectivePlan("pro_max", { plan: "basic", expires_at: null })).toBe("pro_max"));
it("only admins can award memberships", () => {
  expect(() => assertMembershipAdmin(false)).toThrow();
  expect(() => assertMembershipAdmin(true)).not.toThrow();
});
