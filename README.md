# Better Osiris

A faster, cleaner, actually useful timetable for schools using OSIRIS Student.

Made because I got so absolutely sick of the official one. Like do you have to lose my session every 5 minutes? Or log me out randomly? Or take ages to load because I need to be redirected through a million different pages?

Anyway, this is heavily vibe coded, but I vibe code with class, so every detail is meticulously refined. I don't think anyone except me and some friends will find a use for this, but hey, it's here now.

> Note: This is an unofficial client and is not affiliated with OSIRIS. Make sure your use complies with your institution's policies.

---

## Features

- Agenda and Grid views that look good on any device
- Clean and speedy week navigation with minimal load times, well designed keyboard shortcuts and swipe gestures
- Lesson details, detailed cancellation & change information, and the ability to be notified when a change happens
- Lots of pretty themes to choose from and a good amount of preference settings to display the roster how you desire
- Skim quickly with current time/class progress displays, readability aiding icon use, break indicators
- Many neat touches that just make it _feel right_

---

## How it works

You grab your own bearer token from the official OSIRIS Student site and slap it into the app. [Here's how to do that](https://youtu.be/MbcI61KIQbI)

The paste field and submission handle your token in frontend JavaScript. The server then stores it in an encrypted HttpOnly cookie, so frontend JavaScript cannot read the saved credential back. Requests to OSIRIS happen server-side.

---

## Running locally

You need [Bun](https://bun.sh/) and access to an OSIRIS Student environment.

1. Clone the repository and install its dependencies:

   ```sh
   git clone https://github.com/NoomStuff/Better-Osiris.git
   cd Better-Osiris
   bun install
   ```

2. Copy `.env.example` to `.env` and update the values for your school. The development command automatically replaces the public `COOKIE_SECRET` placeholder with a secure local value.

3. Start the app:

   ```sh
   bun run dev
   ```

The frontend runs at `http://localhost:5173` and proxies API requests to the local server on port `8787`.

To self-host instead, set the environment variables, run `bun run build`, then `bun run start`.

Production builds save the public app files for offline launch after the first successful visit. Downloaded weeks remain available through the existing account cache. A warning shows the saved timetable's fetch time when updates fail or the browser goes offline. Normal browsing has no freshness label.

Host over HTTPS, except for local development. App updates wait until the previous version's tabs close. The service worker never caches API responses. Removing a token clears that account's saved timetable.

Keep `COOKIE_SECRET` stable across restarts and identical across instances serving the same site. Rotating it makes existing token cookies unreadable, so users must enter their tokens again. Store the secret in your hosting provider's environment settings. The cookie lasts up to one year, but OSIRIS can reject the token earlier.

The upstream cache and rate limits belong to each server process. Separate serverless instances do not share request deduplication or rate-limit counters. Multiple instances need a shared rate limiter if the deployment requires one global limit. Keep authenticated API responses out of reverse-proxy and CDN caches. Set `TRUST_PROXY` only when a trusted proxy supplies the forwarded address.

---

## Configuration

| Variable                    | Description                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `COOKIE_SECRET`*            | Long random value used to encrypt bearer tokens in browser cookies.                                                                      |
| `OSIRIS_ROSTER_URL`*        | Full weekly roster endpoint, such as `https://mborijnland.osiris-student.nl/student/osiris/student/rooster/per_week`.                    |
| `BEARER_TOKEN`              | Shared fallback token. Leave this unset on a public deployment so every user supplies their own token.                                   |
| `ALLOW_SHARED_BEARER_TOKEN` | Must be `true` to acknowledge use of `BEARER_TOKEN` in production.                                                                       |
| `ROSTER_TIME_ZONE`          | IANA time zone for roster dates and times. Defaults to `Europe/Amsterdam`.                                                               |
| `SCHOOL_NAME`               | Optional school name displayed above the app title. Set this before building.                                                            |
| `TRUST_PROXY`               | Set to `true` only behind a trusted reverse proxy. Uses the last forwarded address for rate limiting. Vercel enables this automatically. |

---

## Commands

| Command                   | Description                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `bun run dev`             | Start the frontend and API in watch mode                                              |
| `bun run build`           | Type-check and build the production app                                               |
| `bun run start`           | Serve the built app                                                                   |
| `bun run format`          | Format code                                                                           |
| `bun run verify`          | Check formatting, lint, unit and Chromium browser tests, build, then production smoke |
| `bun run test:e2e:compat` | Run Firefox and WebKit browser tests                                                  |
