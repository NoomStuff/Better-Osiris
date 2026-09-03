# Better Osiris

A faster, cleaner, actually useful timetable for schools using OSIRIS Student.

Made because I got so absolutely sick of the official one. Like do you have to lose my session every 5 minutes? Or log me out randomly? Or take ages to load because I need to be redirected through a million different pages?

Anyway, this is heavily vibe coded, but I vibe code with class, so every detail is meticulously refined. I don't think anyone except me and some friends will find a use for this, but hey, it's here now.

> Note: This is an unofficial client and is not affiliated with OSIRIS. Make sure your use complies with your institution's policies.

---

## Features

- Agenda and Grid views that look good on any device
- Clean and speedy week navigation with keyboard shortcuts and swipe gestures
- Lesson details, detailed cancellation and change information
- Many neat touches, like time indicators, breaktimes, animations and icons

---

## How it works

You grab your own bearer token from the official OSIRIS Student site and slap it into the app. [Here's how to do that](https://youtu.be/MbcI61KIQbI)

The token is stored encrypted in a cookie and OSIRIS requests happen server-side, so it never touches frontend JavaScript.

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

---

## Configuration

| Variable                    | Description                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `COOKIE_SECRET`*            | Long random value used to encrypt bearer tokens in browser cookies.                                                   |
| `OSIRIS_ROSTER_URL`*        | Full weekly roster endpoint, such as `https://mborijnland.osiris-student.nl/student/osiris/student/rooster/per_week`. |
| `BEARER_TOKEN`              | Shared fallback token. Leave this unset on a public deployment so every user supplies their own token.                |
| `ALLOW_SHARED_BEARER_TOKEN` | Must be `true` to acknowledge use of `BEARER_TOKEN` in production.                                                    |

---

## Commands

| Command          | Description                              |
| ---------------- | ---------------------------------------- |
| `bun run dev`    | Start the frontend and API in watch mode |
| `bun run build`  | Type-check and build the production app  |
| `bun run start`  | Serve the built app                      |
| `bun run format` | Format code                              |
| `bun run verify` | Run all tests & checks                   |
