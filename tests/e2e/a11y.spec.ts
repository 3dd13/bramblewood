// Accessibility (TESTING.md stage 7): axe-core scans of the main states, WCAG 2 A/AA rules.
// Runs in desktop-light, desktop-dark and phone-light, so contrast is checked in both themes.
// Fails on serious or critical violations.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { open } from "./helpers";

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(report, report.join("\n")).toEqual([]);
}

test("overview", async ({ page }) => {
  await open(page);
  await scan(page);
});

test("fixtures – one team", async ({ page }) => {
  await open(page, "teams=aa-mens&view=list");
  await scan(page);
});

test("calendar with a day selected", async ({ page }) => {
  await open(page, "view=calendar&month=2026-11&day=2026-11-20");
  await scan(page);
});

test("add-to-calendar panel open", async ({ page }) => {
  await open(page, "view=list");
  await page.getByRole("button", { name: "Add to my calendar" }).click();
  const panel = page.locator("#cal-panel");
  await expect(panel).toBeVisible();
  // Let the open animation finish: axe measures contrast on the faded-in frame otherwise.
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await scan(page);
});
