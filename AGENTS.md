# Better Osiris

We are working on an unofficial timetable client wrapping OSIRIS Student. The official one annoys me. This one exists so opening your week is instant, optimised, clean and boring in the good way.

## What we optimize for

1. **Speed.** Navigation should feel immediate. Data that is already on the device gets shown, not re-fetched behind a spinner. Prefer the simple, dependency-free implementation.
2. **Polish.** The app is allowed to be pleasant. Animations are important for feedback and looks, styling is clean and UX is one of the most important design pillars.
3. **Correctness.** Since this is a timetable, the data must be correct. If we cannot display correct information that is the biggest failure we can have.

## Scope

Right now every feature serves one job: viewing the roster in the best, fastest, least annoying way possible. There is room to grow beyond that, but growth is a decision, not drift. If a change does not directly improve that goal, it needs an argument or it's out of scope.

## The two views

Agenda and grid render the same day groups and answer the same question at different distances. Agenda is the reading list: what happens next, today emphasized, days collapsible, breaks labeled. It is the default on a phone.
Grid is the week as a shape: weekdays as columns, time as rows, lessons placed by their overlap. It is the default on a desktop, and zoom changes row density, not information.

Logic is shared, presentation is not. Grouping, positioning, diff detection, and the current-time indicator live outside the views; what lives inside a view is only how it draws. When you add something, first decide whether it changes roster data (both views get it for free) or belongs to exactly one view. It is also important that it is clear what scope the user wants you to work in.

## Glossary

- **Roster**: the end result of everything the app does. This is what the user sees. The word survives in code only where it means the whole product: the OSIRIS upstream modules, the `/api/roster/weeks` route, and storage key values.
- **Week**: one week of schedule data as the app stores it, a week plus its classes.
- **Day**: one day of the week. An ISO date key, the date, and that day's sorted classes.
- **Class**: one class. Title, subject, start and end, teacher, room, location, description, and a status.
- **Batch**: the unit of fetching. Five consecutive weeks per request; -1, then 0-4, 5-9, and so on. Fetching, prefetching, and refetching happen per batch.
- **Status**: scheduled, changed, or cancelled. A changed lesson carries a `previous` snapshot so the drawer can show each field as old value to new value.
- **Agenda view**: the vertical reading list of collapsible day groups.
- **Grid view**: the weekly timetable. Weekdays as columns, time as rows.
- **(Bearer) Token**: the user's OSIRIS bearer credential used to fetch the roster from the official API.
- **Theme**: a color scheme for the whole app. One CSS file in `src/styles/themes` overriding the theme variables, plus one entry in the theme registry (`src/lib/theme.ts`). Colors come in two layers: content (the surfaces inside the app frame) and chrome (the page backdrop and the header on it). Cohesive themes only set content and let the `--chrome-*` aliases follow; split themes override the chrome layer. Night (id `dark`) is the default and lives in the variable initial-values.
