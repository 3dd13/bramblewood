import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Python used to build the sites under test (local venv if present, else system python on CI).
const PY = process.env.PYTHON ?? (existsSync(".venv/bin/python") ? ".venv/bin/python" : "python3");
// Fixed build timestamp so "Last updated" is identical in every screenshot.
const EPOCH = "1790000000";

const TEST_PORT = 4173; // site built from tests/data (fictional, stable)
const REAL_PORT = 4174; // site built from data/ (real fixtures, smoke tests only)

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } };
const phone = { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"], ["list"]] : [["html", { open: "never" }], ["list"]],

  // Baselines: tests/__screenshots__/<project>/<name>-<platform>.png.
  // Only the Linux (CI) baselines are committed; macOS ones are local-only (.gitignore).
  snapshotPathTemplate: "tests/__screenshots__/{projectName}/{arg}-{platform}{ext}",
  // CI never writes baselines implicitly: a missing or changed baseline fails the run.
  updateSnapshots: process.env.CI ? "none" : "missing",
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.002 },
  },

  use: {
    baseURL: `http://localhost:${TEST_PORT}/`,
    locale: "en-GB",
    timezoneId: "Europe/London",
    // Attach a screenshot of every test to the HTML report: a gallery of the UI for PR review.
    screenshot: "on",
    trace: "retain-on-failure",
  },

  projects: [
    { name: "desktop-light", use: { ...desktop, colorScheme: "light" }, testMatch: /(behaviour|visual)\.spec\.ts/ },
    { name: "desktop-dark", use: { ...desktop, colorScheme: "dark" }, testMatch: /visual\.spec\.ts/ },
    { name: "phone-light", use: { ...phone, colorScheme: "light" }, testMatch: /(behaviour|visual)\.spec\.ts/ },
    { name: "phone-dark", use: { ...phone, colorScheme: "dark" }, testMatch: /visual\.spec\.ts/ },
    { name: "smoke", use: { ...desktop, baseURL: `http://localhost:${REAL_PORT}/` }, testMatch: /smoke\.spec\.ts/ },
  ],

  webServer: [
    {
      command: `SOURCE_DATE_EPOCH=${EPOCH} ${PY} scripts/build.py --data tests/data --out _site-test && python3 -m http.server ${TEST_PORT} -d _site-test 2>/dev/null`,
      url: `http://localhost:${TEST_PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `${PY} scripts/build.py --out _site-smoke && python3 -m http.server ${REAL_PORT} -d _site-smoke 2>/dev/null`,
      url: `http://localhost:${REAL_PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
