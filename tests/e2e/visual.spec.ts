// Visual regression: compares screenshots with committed baselines in tests/__screenshots__/.
// Runs in desktop/phone × light/dark projects against the fictional data set.
// Update baselines deliberately: see TESTING.md.
import { test, expect, type Page } from "@playwright/test";
import { open } from "./helpers";

const shot = { fullPage: true };

/** Screenshots start from a still page: top of the page, no hover. */
async function settle(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test("overview", async ({ page }) => {
  await open(page);
  await settle(page);
  await expect(page).toHaveScreenshot("overview.png", shot);
});

test("fixtures – one team", async ({ page }) => {
  await open(page, "teams=aa-mens&view=list");
  await settle(page);
  await expect(page).toHaveScreenshot("fixtures-one-team.png", shot);
});

test("fixtures – several teams, away only", async ({ page }) => {
  await open(page, "teams=aa-mens,bb-mixed,dd-combi&ha=A&view=list");
  await settle(page);
  await expect(page).toHaveScreenshot("fixtures-multi-away.png", shot);
});

test("calendar – month", async ({ page }) => {
  await open(page, "view=calendar");
  await settle(page);
  await expect(page).toHaveScreenshot("calendar-month.png", shot);
});

test("calendar – day selected", async ({ page }) => {
  await open(page, "view=calendar&month=2026-11&day=2026-11-20");
  await settle(page);
  await expect(page).toHaveScreenshot("calendar-day.png", shot);
});

test("add-to-calendar panel", async ({ page }, info) => {
  test.skip(info.project.name.endsWith("-dark"), "light theme only");
  await open(page, "teams=aa-mens,bb-mixed&view=list");
  await page.getByRole("button", { name: "Add to my calendar" }).click();
  await page.mouse.move(0, 0);
  await expect(page.locator("#cal-panel")).toHaveScreenshot("add-to-calendar.png");
});
