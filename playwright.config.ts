import { defineConfig, devices } from "@playwright/test";

const port = process.env["PLAYWRIGHT_PORT"] ?? "5173";

export default defineConfig({
   testDir: "./tests/e2e",
   testMatch: /.*\.e2e\.ts/,
   fullyParallel: true,
   workers: 4,
   reporter: "list",
   use: {
      baseURL: `http://127.0.0.1:${port}`,
      trace: "on-first-retry",
   },
   webServer: {
      command: `bunx vite --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: !process.env["CI"],
      stdout: "ignore",
      stderr: "pipe",
      env: {
         ...process.env,
         SCHOOL_NAME: "",
      },
   },
   projects: [
      {
         name: "chromium",
         use: { ...devices["Desktop Chrome"] },
      },
      {
         name: "firefox",
         // Held-key tests depend on window focus. Isolate Firefox contexts from competing windows.
         workers: 1,
         use: { ...devices["Desktop Firefox"] },
      },
      {
         name: "webkit",
         use: { ...devices["Desktop Safari"] },
      },
   ],
});
