// Behaviour tests on the fictional data set (tests/data) with "today" frozen at 2026-11-15.
//   14 matches (7 home, 7 away): 4 past, 10 upcoming. Next: Tue 17 Nov, AA Mens v Hilltop (away).
//   AA Mens 5 (3 home, 2 away, 1 played) · BB Mixed 3 · CC Ladies 3 · DD Combi 3.
import { test, expect, type Page } from "@playwright/test";
import { open, matches, teamChip, expectNoHorizontalOverflow } from "./helpers";

const seg = (page: Page, group: "ha" | "view", name: string) =>
  page.locator(`.seg--${group}`).getByRole("button", { name, exact: true });
const card = (page: Page, name: string) => page.locator(".team-card", { has: page.getByRole("heading", { name, exact: true }) });

// ── Overview ──────────────────────────────────────────────────────────
test("overview: page title, next match and one card per team", async ({ page }) => {
  const errors = await open(page);
  await expect(page).toHaveTitle("Bramblewood Fixtures");
  await expect(page.locator(".season-pill")).toHaveText("2026/27");

  const next = page.locator("#next-card");
  await expect(next).toContainText("AA Mens");
  await expect(next).toContainText("v Hilltop");
  await expect(next).toContainText("Away");
  await expect(next).toContainText("Tuesday 17 November");
  await expect(next).toContainText("7:30pm");
  await expect(next).toContainText("In 2 days");

  await expect(page.locator(".team-card")).toHaveCount(4);
  const aa = card(page, "Alpha Men's");
  await expect(aa).toContainText("v Hilltop");
  await expect(aa.locator(".stats li")).toHaveText(["3 home", "2 away", "1 played"]);
  await expect(card(page, "Delta Combi")).toContainText("v Oakfield");
  await expect(card(page, "Delta Combi").locator(".stats li")).toHaveText(["1 home", "2 away", "1 played"]);
  expect(errors).toEqual([]);
});

test("overview: a team card opens Fixtures for just that team", async ({ page }) => {
  await open(page);
  await card(page, "Bravo Mixed").getByRole("button", { name: "Fixtures", exact: true }).click();
  await expect(page).toHaveURL(/\?teams=bb-mixed&view=list$/);
  await expect(page.locator("#sel-h")).toHaveText("Bravo Mixed");
  await expect(page.locator("#sel-h")).toBeFocused();
  await expect(matches(page)).toHaveCount(3);
  await expect(teamChip(page, "BB Mixed")).toHaveAttribute("aria-pressed", "true");
});

// ── Fixtures: filters ─────────────────────────────────────────────────
test("team toggles combine, sync the URL and 'All teams' resets", async ({ page }) => {
  await open(page, "view=list");
  await expect(matches(page)).toHaveCount(14);
  await expect(teamChip(page, "All teams")).toHaveAttribute("aria-pressed", "true");

  await teamChip(page, "AA Mens").click();
  await expect(matches(page)).toHaveCount(5);
  await expect(page).toHaveURL(/\?teams=aa-mens&view=list$/);
  await expect(page.locator("#sel-h")).toHaveText("Alpha Men's");
  await expect(page.locator(".timeline .badge"), "one team: no redundant badge").toHaveCount(0);

  await teamChip(page, "BB Mixed").click();
  await expect(matches(page)).toHaveCount(8);
  await expect(page).toHaveURL(/teams=aa-mens,bb-mixed/);
  await expect(page.locator("#sel-h")).toHaveText("2 teams: AA Mens, BB Mixed");
  await expect(page.locator(".timeline .badge")).toHaveCount(8);

  await teamChip(page, "All teams").click();
  await expect(matches(page)).toHaveCount(14);
  await expect(page).not.toHaveURL(/teams=/);
  await expect(page.locator("#sel-h")).toHaveText("All teams");
});

test("home/away filter", async ({ page }) => {
  await open(page, "view=list");
  await seg(page, "ha", "Away").click();
  await expect(matches(page)).toHaveCount(7);
  await expect(page.locator(".timeline .ha")).toHaveText(Array(7).fill("Away"));
  await expect(page).toHaveURL(/ha=A/);
  await seg(page, "ha", "Home").click();
  await expect(page.locator(".timeline .ha")).toHaveText(Array(7).fill("Home"));
  await seg(page, "ha", "All").click();
  await expect(matches(page)).toHaveCount(14);
});

test("past matches are styled, the next one highlighted, and past can be hidden", async ({ page }) => {
  await open(page, "view=list");
  await expect(page.locator(".timeline .match.is-past")).toHaveCount(4);
  const next = page.locator(".timeline .match.is-next");
  await expect(next).toHaveCount(1);
  await expect(next).toContainText("Next up");
  await expect(next).toContainText("Hilltop");

  const hide = page.getByRole("button", { name: "Hide past matches" });
  await hide.click();
  await expect(hide).toHaveAttribute("aria-pressed", "true");
  await expect(matches(page)).toHaveCount(10);
  await expect(page.locator(".timeline .is-past")).toHaveCount(0);
  await expect(page).toHaveURL(/past=hide/);
});

test("selection card shows the next match and 'Jump to it' focuses it", async ({ page }) => {
  await open(page, "teams=cc-ladies&view=list");
  await expect(page.locator(".sel-next")).toContainText("Next:");
  await expect(page.locator(".sel-next")).toContainText("Fri 20 Nov");
  await expect(page.locator(".sel-next")).toContainText("v Riverside A");
  await expect(page.locator(".sel-next")).toContainText("In 5 days");

  await page.getByRole("button", { name: /Jump to it/ }).click();
  const target = page.locator("#m-2026-11-20-cc-ladies-riverside-a");
  await expect(target).toBeFocused();
  await expect(target).toHaveClass(/flash/);
});

test("match details: venues, map links, TBC and notes", async ({ page }) => {
  await open(page, "view=list");
  const home = page.locator("#m-2026-10-08-aa-mens-riverside-a");
  await expect(home).toContainText("Testtown Sports Hall, 1 Example Road, Testtown TT1 1AA");
  await expect(home.getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", /google\.com\/maps\/search\/.*Testtown%20Sports%20Hall/);

  await expect(page.locator("#m-2026-11-17-aa-mens-hilltop")).toContainText("Hilltop School, 3 Hill Street");
  await expect(page.locator("#m-2026-11-30-aa-mens-oakfield")).toContainText("Venue TBC");
  await expect(page.locator("#m-2026-11-30-aa-mens-oakfield").getByRole("link")).toHaveCount(0);
  await expect(page.locator("#m-2027-01-15-dd-combi-meadow")).toContainText("Time TBC");
  await expect(page.locator("#m-2026-12-11-cc-ladies-hilltop .note")).toHaveText("Rearranged from 27 Nov");
});

// ── Calendar ──────────────────────────────────────────────────────────
test("calendar: opens on the current month, navigation stops at the season ends", async ({ page }) => {
  await open(page, "view=list");
  await seg(page, "view", "Calendar").click();
  await expect(page.locator("#cal-h")).toHaveText("November 2026");
  await expect(page).toHaveURL(/view=calendar&month=2026-11$/);
  await expect(matches(page, ".agenda")).toHaveCount(6);

  const prev = page.getByRole("button", { name: "Previous month" });
  const next = page.getByRole("button", { name: "Next month" });
  await prev.click();
  await expect(page.locator("#cal-h")).toHaveText("October 2026");
  await expect(prev).toBeDisabled();
  await expect(next).toBeFocused(); // focus moves off the disabled button

  for (let i = 0; i < 3; i++) await next.click();
  await expect(page.locator("#cal-h")).toHaveText("January 2027");
  await expect(next).toBeDisabled();

  await seg(page, "view", "List").click();
  await expect(page).not.toHaveURL(/month=/);
});

test("calendar: selecting a day shows its matches and is kept in the URL", async ({ page }) => {
  await open(page, "view=calendar");
  const day = page.getByRole("button", { name: "Friday 20 November, 2 matches" });
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#agenda-h")).toHaveText("Friday 20 November");
  await expect(matches(page, ".agenda")).toHaveCount(2);
  await expect(page).toHaveURL(/month=2026-11&day=2026-11-20$/);

  await page.getByRole("button", { name: "Show whole month" }).click();
  await expect(page.locator("#agenda-h")).toHaveText("All of November 2026");
  await expect(page.locator("#agenda-h")).toBeFocused();
  await expect(matches(page, ".agenda")).toHaveCount(6);
  await expect(page).not.toHaveURL(/day=/);
});

// ── URL and history ───────────────────────────────────────────────────
test("shared links reproduce the same view", async ({ page }) => {
  await open(page, "teams=aa-mens&ha=H&view=calendar&month=2026-12");
  await expect(teamChip(page, "AA Mens")).toHaveAttribute("aria-pressed", "true");
  await expect(seg(page, "ha", "Home")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#cal-h")).toHaveText("December 2026");
  await expect(matches(page, ".agenda")).toHaveCount(1);
  await expect(matches(page, ".agenda")).toContainText("Meadow");

  await open(page, "view=calendar&month=2026-11&day=2026-11-20");
  await expect(page.locator("#agenda-h")).toHaveText("Friday 20 November");
  await open(page, "view=calendar&month=2031-01");
  await expect(page.locator("#cal-h"), "month is clamped to the season").toHaveText("January 2027");
});

test("Back and Forward move between Overview and Fixtures", async ({ page }) => {
  await open(page);
  await page.locator(".modebar").getByRole("button", { name: "Fixtures" }).click();
  await expect(page).toHaveURL(/\?view=list$/);
  await teamChip(page, "AA Mens").click();
  await expect(page).toHaveURL(/\?teams=aa-mens&view=list$/);

  await page.goBack();
  await expect(page.locator("#ov-h")).toBeFocused();
  expect(new URL(page.url()).search).toBe("");

  await page.goForward();
  await expect(page).toHaveURL(/\?teams=aa-mens&view=list$/);
  await expect(page.locator("#sel-h")).toBeFocused();
  await expect(matches(page)).toHaveCount(5);
});

// ── Add to calendar ───────────────────────────────────────────────────
test("add-to-calendar panel: one row per selected team with working links", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "teams=aa-mens,bb-mixed&view=list");
  await page.getByRole("button", { name: "Add to my calendar" }).click();
  const panel = page.getByRole("dialog", { name: "Add to my calendar" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(panel.locator(".sheet-sub")).toHaveText("AA Mens, BB Mixed");

  const rows = panel.locator(".cal-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("AA Mens");
  await expect(rows.nth(0)).toContainText("Alpha Men's");
  const host = new URL(baseURL!).host;
  await expect(rows.nth(0).getByRole("link", { name: /^Subscribe/ })).toHaveAttribute("href", `webcal://${host}/calendar/aa-mens.ics`);
  await expect(rows.nth(1).getByRole("link", { name: /Google Calendar/ }))
    .toHaveAttribute("href", `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${host}/calendar/bb-mixed.ics`)}`);

  const copy = rows.nth(0).getByRole("button", { name: /Copy calendar link/ });
  await copy.click();
  await expect(copy).toContainText("Copied ✓");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://${host}/calendar/aa-mens.ics`);

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("add-to-calendar panel with all teams includes the club feed; feeds are valid", async ({ page }) => {
  await open(page, "view=list");
  await page.getByRole("button", { name: "Add to my calendar" }).click();
  const rows = page.locator("#cal-panel .cal-row");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("All club matches");
  await expect(rows.first().getByRole("link", { name: /^Subscribe/ })).toHaveAttribute("href", /\/calendar\/all\.ics$/);

  const events = { all: 14, "aa-mens": 5, "bb-mixed": 3, "cc-ladies": 3, "dd-combi": 3 };
  for (const [feed, n] of Object.entries(events)) {
    const res = await page.request.get(`calendar/${feed}.ics`);
    expect(res.status(), feed).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body.match(/BEGIN:VEVENT/g), feed).toHaveLength(n);
  }
});

test("overview card 'Add to calendar' opens the panel for that team", async ({ page }) => {
  await open(page);
  await card(page, "Charlie Ladies").getByRole("button", { name: /Add Charlie Ladies fixtures/ }).click();
  const rows = page.locator("#cal-panel .cal-row");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("CC Ladies");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#cal-panel")).toBeHidden();
});

// ── Theme and layout ──────────────────────────────────────────────────
test("theme toggle switches and persists across reloads", async ({ page }) => {
  await open(page);
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /./);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
});

test("no horizontal scrolling in any view (phone)", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("phone"), "phone layouts only");
  for (const q of ["", "view=list", "teams=aa-mens,bb-mixed,cc-ladies,dd-combi&view=list", "view=calendar&day=2026-11-20"]) {
    await open(page, q);
    await expectNoHorizontalOverflow(page);
  }
  await page.getByRole("button", { name: "Add to my calendar" }).click();
  await expectNoHorizontalOverflow(page);
});
