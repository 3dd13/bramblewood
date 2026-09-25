// Behaviour tests on the fictional data set (tests/data) with "today" frozen at 2026-11-15.
//   14 matches: 4 past, 10 upcoming. Next: Tue 17 Nov, AA Mens v Hilltop (away).
import { test, expect } from "@playwright/test";
import { open, matches, expectNoHorizontalOverflow } from "./helpers";

const chip = (page, name: string) => page.getByRole("button", { name, exact: true });

test("loads with all matches, past dimmed and next match highlighted", async ({ page }) => {
  const errors = await open(page);
  await expect(matches(page)).toHaveCount(14);
  await expect(page.locator("#list-count")).toHaveText("14 matches · 10 still to play");
  await expect(page.locator("#list .is-past")).toHaveCount(4);
  await expect(page.locator("#list .is-next")).toHaveCount(1);
  await expect(page.locator("#list .is-next")).toContainText("Hilltop");
  await expect(page.locator("#next-up")).toContainText("Tuesday 17 November, 7:30pm");
  await expect(page.locator("#next-up")).toContainText("AA Mens v Hilltop (away)");
  await expect(page.locator("#season")).toHaveText("2026/27");
  expect(errors).toEqual([]);
});

test("team filter selects one or more teams and syncs the URL", async ({ page }) => {
  await open(page);
  await chip(page, "AA Mens").click();
  await expect(matches(page)).toHaveCount(5);
  await expect(page.locator("#list .team-badge")).toHaveText(Array(5).fill("AA Mens"));
  await expect(page).toHaveURL(/\?teams=aa-mens$/);
  await expect(chip(page, "AA Mens")).toHaveAttribute("aria-pressed", "true");

  await chip(page, "BB Mixed").click();
  await expect(matches(page)).toHaveCount(8);
  await expect(page).toHaveURL(/teams=aa-mens,bb-mixed/);

  await chip(page, "All teams").click();
  await expect(matches(page)).toHaveCount(14);
  await expect(page).not.toHaveURL(/teams=/);
});

test("home/away filter", async ({ page }) => {
  await open(page);
  await page.locator("#ha-toggle").getByRole("button", { name: "Away" }).click();
  await expect(matches(page)).toHaveCount(7);
  await expect(page.locator("#list .ha")).toHaveText(Array(7).fill("Away"));
  await page.locator("#ha-toggle").getByRole("button", { name: "Home" }).click();
  await expect(page.locator("#list .ha")).toHaveText(Array(7).fill("Home"));
  await expect(page).toHaveURL(/ha=H/);
});

test("hide past matches", async ({ page }) => {
  await open(page);
  await page.getByLabel("Hide past matches").check();
  await expect(matches(page)).toHaveCount(10);
  await expect(page.locator("#list .is-past")).toHaveCount(0);
  await expect(page).toHaveURL(/past=hide/);
});

test("match details: venues, map links, TBC and notes", async ({ page }) => {
  await open(page);
  const home = page.locator("#m-2026-10-08-aa-mens-riverside-a");
  await expect(home).toContainText("Testtown Sports Hall, 1 Example Road, Testtown TT1 1AA");
  await expect(home.getByRole("link", { name: "Map" })).toHaveAttribute("href", /google\.com\/maps\/search\/.*Testtown%20Sports%20Hall/);

  await expect(page.locator("#m-2026-11-17-aa-mens-hilltop")).toContainText("Hilltop School, 3 Hill Street");
  await expect(page.locator("#m-2026-11-30-aa-mens-oakfield")).toContainText("Venue TBC");
  await expect(page.locator("#m-2027-01-15-dd-combi-meadow")).toContainText("Time TBC");
  await expect(page.locator("#m-2026-12-11-cc-ladies-hilltop .notes")).toHaveText("Rearranged from 27 Nov");
});

test("calendar view: month navigation within the season", async ({ page }) => {
  await open(page);
  await page.locator("#view-toggle").getByRole("button", { name: "Calendar" }).click();
  await expect(page.locator("#cal-title")).toHaveText("November 2026");
  await expect(page).toHaveURL(/view=calendar&month=2026-11/);
  await expect(matches(page, "#agenda")).toHaveCount(6);

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.locator("#cal-title")).toHaveText("October 2026");
  await expect(page.getByRole("button", { name: "Previous month" })).toBeDisabled();

  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.locator("#cal-title")).toHaveText("January 2027");
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled();
});

test("calendar view: selecting a day shows that day's matches", async ({ page }) => {
  await open(page, "view=calendar");
  await page.getByRole("gridcell", { name: /^Friday 20 November: 2 matches/ }).click();
  await expect(matches(page, "#agenda")).toHaveCount(2);
  await expect(page.locator("#agenda-title")).toHaveText("Friday 20 November · 2 matches");

  await page.getByRole("button", { name: "Show whole month" }).click();
  await expect(matches(page, "#agenda")).toHaveCount(6);
});

test("shared links reproduce the same view", async ({ page }) => {
  await open(page, "teams=aa-mens&ha=H&view=calendar&month=2026-12");
  await expect(chip(page, "AA Mens")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ha-toggle").getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#cal-title")).toHaveText("December 2026");
  await expect(matches(page, "#agenda")).toHaveCount(1);
  await expect(matches(page, "#agenda")).toContainText("Meadow");
});

test("subscribe panel links to working calendar feeds", async ({ page, baseURL }) => {
  await open(page, "teams=bb-mixed");
  await page.getByText("Add fixtures to your calendar").click();
  // A single selected team pre-selects its feed.
  await expect(page.locator("#sub-team")).toHaveValue("bb-mixed");
  const host = new URL(baseURL!).host;
  await expect(page.locator("#sub-webcal")).toHaveAttribute("href", `webcal://${host}/calendar/bb-mixed.ics`);
  await expect(page.locator("#sub-google")).toHaveAttribute("href", /calendar\.google\.com\/calendar\/render\?cid=webcal/);

  for (const feed of ["all", "aa-mens", "bb-mixed", "cc-ladies", "dd-combi"]) {
    const res = await page.request.get(`calendar/${feed}.ics`);
    expect(res.status(), feed).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
  }
  const all = await (await page.request.get("calendar/all.ics")).text();
  expect(all.match(/BEGIN:VEVENT/g)).toHaveLength(14);
});

test("no horizontal scrolling in either view", async ({ page }) => {
  await open(page);
  await expectNoHorizontalOverflow(page);
  await page.locator("#view-toggle").getByRole("button", { name: "Calendar" }).click();
  await expectNoHorizontalOverflow(page);
});
