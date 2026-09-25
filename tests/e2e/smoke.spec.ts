// Smoke tests on the REAL fixtures (data/). No screenshots here: fixture edits must not break tests.
import { test, expect } from "@playwright/test";

test("real site renders every fixture and team without errors", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  const data = await (await request.get("fixtures.json")).json();
  await page.goto("./");
  await expect(page.locator("#list .match")).toHaveCount(data.fixtures.length);
  await expect(page.locator("#team-chips .chip")).toHaveCount(data.teams.length + 1);

  await page.locator("#view-toggle").getByRole("button", { name: "Calendar" }).click();
  await expect(page.locator("#cal-title")).not.toBeEmpty();
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
