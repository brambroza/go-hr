import { test } from "node:test";
import assert from "node:assert/strict";
import { appLink } from "../lib/notify-links";

test("appLink: approver and requester links open the mobile pages", () => {
  assert.equal(appLink("/approvals?id=12", true), "/m/approvals/12");
  assert.equal(appLink("/me/requests?id=7", true), "/m/requests/7");
  assert.equal(appLink("/requests/7", true), "/m/requests/7");
  assert.equal(appLink("/approvals", true), "/m/approvals");
});

test("appLink: an employee record link becomes the team page on mobile", () => {
  assert.equal(appLink("/employees/5", true), "/m/team");
  assert.equal(appLink("/employees/5?tab=docs", true), "/m/team");
});

test("appLink: desktop keeps the stored link; unknown links pass through; null stays null", () => {
  assert.equal(appLink("/approvals?id=12", false), "/approvals?id=12");
  assert.equal(appLink("/m/payslips/3", true), "/m/payslips/3");
  assert.equal(appLink("/learning/courses/2", true), "/learning/courses/2");
  assert.equal(appLink(null, true), null);
});
