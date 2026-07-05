# Better Osiris

A faster, cleaner, more useful timetable for schools using OSIRIS Student.

Made because I got so absolutely sick of the official one. Like do you have to lose my session every 5 minutes? Or log me out randomly? Or take ages to load because I need to be redirected through a million different pages?

Anyway, this is heavily vibe coded, but I vibe code with class so every detail is maticiously refined. I don't think anyone except me and some friends will find a use for this, but hey, it't here now.

> Note: This is an unofficial client and is not affiliated with OSIRIS, no clue if you'll get in trouble for using it.

---

## Features

- Agenda and Grid views that look good on any device
- Clean and speedy week navigation with keyboard shortcuts and swipe gestures
- Lesson details, detailed cancellation and change information
- Many neat touches, like time indicators, breaktimes, animations and icons

---

## How it Works

You grab your own bearer token from the official OSIRIS Student site and slap it into the app. [Here's how to do that](https://youtu.be/MbcI61KIQbI)

The browser sends a bearer token to the app's own API, where it is encrypted with `COOKIE_SECRET` and stored in an HTTP-only cookie. OSIRIS requests happen server-side, so the saved token is not exposed to frontend JavaScript.

If `BEARER_TOKEN` is configured, it becomes the fallback for visitors who do not yet have a token cookie. That is convenient for a private instance but can leak your roster if it's a public deployment.

---

## Running Locally

You need [Bun](https://bun.sh/) and access to an OSIRIS Student environment.

1. Clone the repository and install its dependencies:

   ```sh
   git clone https://github.com/NoomStuff/Better-Osiris.git
   cd Better-Osiris
   bun install
   ```

2. Copy `.env.example` to `.env` and update the values for your school.

3. Start the app:

   ```sh
   bun run dev
   ```

The frontend runs at `http://localhost:5173` and proxies API requests to the local server on port `8787`.

---

## Desktop Build

The experimental desktop build uses [Deno Desktop](https://docs.deno.com/runtime/desktop/) instead of Electron. It currently uses Deno's CEF backend because the Deno 2.9.1 native-WebView backend crashes on the tested Windows environment.

Install Deno 2.9 or newer, then run:

```sh
bun run desktop:build
```

The platform-specific app is written to `desktop-dist`. On Windows, launch `desktop-dist/Better-Osiris/Better-Osiris.bat`. The CEF test build is large (roughly 500 MB) because it includes Chromium.

The desktop app stores its generated cookie-encryption secret in the current user's application-data directory. It uses the MBORijnland roster URL by default; `OSIRIS_ROSTER_URL`, `COOKIE_SECRET`, and `BEARER_TOKEN` environment variables can still override the desktop defaults.

---

## Configuration

| Variable            | Required | Description                                                                                                           |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `COOKIE_SECRET`     | Yes      | Long random value used to encrypt bearer tokens in browser cookies.                                                   |
| `OSIRIS_ROSTER_URL` | Yes      | Full weekly roster endpoint, such as `https://mborijnland.osiris-student.nl/student/osiris/student/rooster/per_week`. |
| `SCHOOL_NAME`       | No       | Optional label shown above “Better Osiris”.                                                                           |
| `BEARER_TOKEN`      | No       | Shared fallback token. Leave this unset on a public deployment so every user supplies their own token.                |

---

## Commands

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `bun run dev`           | Start the frontend and API in watch mode |
| `bun run build`         | Type-check and build the production app  |
| `bun run desktop:build` | Build the native Deno Desktop app        |
| `bun run start`         | Serve the built app                      |
| `bun run test`          | Run all tests                            |
| `bun run test:unit`     | Run unit and API tests                   |
| `bun run test:e2e`      | Run Playwright end-to-end tests          |
| `bun run lint`          | Run ESLint                               |
| `bun run format`        | Format code with Prettier                |
| `bun run format:check`  | Check formatting                         |
| `bun run verify`        | Run all pre commit checks                |

For a production deployment, set the same environment variables in your hosting provider, run `bun run build`, then start the app with `bun run start`. The included `vercel.json` also supports deployment to Vercel.
