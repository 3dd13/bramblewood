// Smoke tests on the REAL fixtures (data/). No screenshots here: fixture edits must not break tests.
import { test, expect } from "@playwright/test";

test("real site renders every team card and every fixture without errors", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  const data = await (await request.get("fixtures.json")).json();
  await page.goto("./");
  await expect(page.locator(".team-card")).toHaveCount(data.teams.length);

  // Fixtures, all teams: every match is listed.
  await page.locator(".modebar").getByRole("button", { name: "Fixtures" }).click();
  await expect(page.locator(".timeline .match")).toHaveCount(data.fixtures.length);
  await expect(page.locator(".teambar .tteam")).toHaveCount(data.teams.length + 1);

  await page.locator(".seg--view").getByRole("button", { name: "Calendar" }).click();
  await expect(page.locator("#cal-h")).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test("real calendar feeds are served", async ({ request }) => {
  const data = await (await request.get("fixtures.json")).json();
  for (const slug of ["all", ...data.teams.map((t) => t.slug)]) {
    const res = await request.get(`calendar/${slug}.ics`);
    expect(res.status(), slug).toBe(200);
    expect(await res.text()).toContain("BEGIN:VCALENDAR");
  }
});
