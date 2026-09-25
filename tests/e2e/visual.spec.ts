// Visual regression: compares screenshots with committed baselines in tests/__screenshots__/.
// Runs in desktop/phone × light/dark projects against the fictional data set.
// Update baselines deliberately: see TESTING.md.
import { test, expect } from "@playwright/test";
import { open } from "./helpers";

const shot = { fullPage: true };

test("list view – all teams", async ({ page }) => {
  await open(page);
  await expect(page).toHaveScreenshot("list-all.png", shot);
});

test("list view – one team, away only", async ({ page }) => {
  await open(page, "teams=aa-mens&ha=A");
  await expect(page).toHaveScreenshot("list-filtered.png", shot);
});

test("calendar view – month", async ({ page }) => {
  await open(page, "view=calendar");
  await expect(page).toHaveScreenshot("calendar-month.png", shot);
});

test("calendar view – day selected", async ({ page }) => {
  await open(page, "view=calendar");
  await page.getByRole("gridcell", { name: /^Friday 20 November/ }).click();
  await expect(page).toHaveScreenshot("calendar-day.png", shot);
});

test("subscribe panel open", async ({ page }, info) => {
  test.skip(info.project.name.endsWith("-dark"), "light theme only");
  await open(page);
  await page.getByText("Add fixtures to your calendar").click();
  await expect(page.locator("#subscribe")).toHaveScreenshot("subscribe.png");
});
