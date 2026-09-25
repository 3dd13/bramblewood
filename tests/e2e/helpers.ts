import { expect, type Page } from "@playwright/test";

/** "Today" for all tests on the fictional data set (a Sunday). */
export const TODAY = new Date("2026-11-15T10:00:00");

/** Freeze the clock, fail on console errors, and open the page. */
export async function open(page: Page, query = "") {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.setFixedTime(TODAY);
  await page.goto(query ? `./?${query}` : "./");
  await expect(page.locator("#team-chips .chip").first()).toBeVisible();
  return errors;
}

export const matches = (page: Page, scope = "#list") => page.locator(`${scope} .match`);

/** The page must never scroll sideways (phone layouts). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page is wider than the viewport").toBeLessThanOrEqual(0);
}
