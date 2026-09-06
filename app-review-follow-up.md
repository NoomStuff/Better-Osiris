# App review follow-up, 6 September 2026

The approved changes keep the existing cache-first experience. Saved weeks appear immediately, the toolbar shows background loading, and refresh failures use the existing warning. The broader visual refinement remains deferred. The class-status markers you approved with GLM are preserved, and missing classes use the combined cancelled state.

## Startup, reset, and navigation

Startup and reset share one rule, independent of agenda/grid mode, hidden days, grid hours, or developer previews:

1. Show this calendar week if it contains an ongoing or upcoming active class.
2. Otherwise show next calendar week if it contains an ongoing or upcoming active class.
3. Otherwise show the earliest week OSIRIS provides, including an empty week. Do not search beyond next week for classes and skip over vacations.

A class remains eligible until its end time. Cancelled classes do not count. A remaining weekend class counts even when weekends are hidden in the view.

Grey marks this shared default destination. Weeks before it are orange; weeks after it are blue. Text labels retain their calendar meaning. On Sunday 6 September, a default of 7 through 13 September is therefore grey and labelled Next week. Clicking the week heading, R, 0, and the Space shortcut all use the same reset destination. Space still activates a focused button normally.

Background refreshes do not move the selected week. Manual navigation during startup takes precedence. The default destination can change as time passes or fresh data arrives, but selection changes only on startup or an explicit reset.

Previous-week caching is still present. Saved earlier weeks remain browsable when OSIRIS no longer returns them. Navigation skips an omitted week with no saved data, so a cached previous week remains reachable across a missing current week. An omitted response never manufactures an empty timetable or cancels every class in a saved week. Refreshing a saved but omitted week keeps its content and shows the existing warning.

## What the live response established

On Sunday 6 September, the configured weekly endpoint returned weeks 37 through 41, starting Monday 7 September. The base `per_week?limit=5` request and explicit offsets zero and minus one returned the same dates. The live Better Osiris tab showed Week 37 with the label This week. Its class dates were correct; its label treated the first source week as calendar current week.

The refactor initially assumed those two meanings were identical and rejected a valid response. Request offsets and calendar offsets are now separate. Returned dates determine where weeks are stored, labelled, and displayed. This observation does not establish that every historical timetable was wrong or that OSIRIS has no other route for retrieving earlier dates.

## Other approved changes

| Area                     | Result                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account boundaries       | Settings and roster responses carry an opaque credential context. Account changes invalidate requests, cached data, and change history across tabs. Validation belongs to the current session revision.                       |
| Change detection         | Stable IDs reconcile across received batches and cached weeks. Missing rows and explicit cancellations share the cancelled presentation. Similar-looking replacement IDs are separate classes.                                |
| Agenda correctness       | Breaks use occupied time across overlapping active classes. Cancelled classes remain visible but do not count as occupied time.                                                                                               |
| Status accessibility     | Added, changed, and cancelled classes have accessible status labels and the approved markers.                                                                                                                                 |
| Recovery                 | Configuration can retry and recover on connectivity changes. Failed token saves keep the draft. Successful token saves and subsequent roster failures have separate states.                                                   |
| Calendar and storage     | Raw weeks and change history use absolute Monday dates, credential context, and time zone. Downloaded future weeks survive reloads. Sunday changes stay attached to that week after Monday.                                   |
| Validation               | Boundaries reject duplicate IDs, out-of-week classes, broken week sequences, inconsistent ISO metadata, and changed classes without previous snapshots. The server validates normalized output too.                           |
| Notifications            | Copy says while the app is open. Delivery can fall back to a service worker. A shared delivery ledger and browser locks suppress duplicate alerts across tabs.                                                                |
| Maintainability          | A session store owns credentials, a week repository owns asynchronous data work, and pure functions own reconciliation and timeline calculations. React subscribes to repository snapshots.                                   |
| Performance and controls | Calendar state ticks at minute boundaries. The agenda progress indicator owns its second ticks. Keyboard and swipe listeners attach before paint. Referenced SVG icons replace the icon fonts.                                |
| Operations               | Credential rate limits are separate from the shared-IP ceiling. Retries respect Retry-After. Both server entry paths attach request IDs and log sanitized failure metadata. Production smoke tests and Windows CI were added. |

The other agent's review was useful. Its request-ordering and notification findings produced concrete regression tests. An overlapping failed request can no longer put a warning on data refreshed successfully by another request. Error entries stay within the supported navigation range when the source mapping changes in flight. A known omitted week no longer makes the app refetch the other, still-fresh weeks in its batch on navigation.

Freshness checks also retain per-class observation times after a class moves or disappears. This prevents a delayed source response from resurrecting a class that a newer destination response already removed, including after cache reload. Cancellation alerts wait for concurrent batches to settle, so a class moving between batches does not trigger a false cancellation alert.

## Details worth knowing before merging

The cache format changed during the original review work. Old caches without an account namespace are discarded, so the first load after upgrading from the live version needs a fresh roster fetch. Saved token cookies and preferences remain. This also means a previous-week copy held only in the old format will not survive that first upgrade. Subsequent previous-week caching works with the new account-scoped format. Deleted browser storage cannot be reconstructed.

Storage is bounded to 32 weeks, prioritizing current and previous weeks and then recently checked weeks. Browser quota limits and eviction can prevent persistence. Changing credentials closes class details and starts the new account at its own default week. Change highlights remain scoped to the browser tab's session and dated week.

Freshness records distinguish the upstream fetch time, the last successful client check, and the last content change. Identical refreshes do not manufacture content changes. A server cache hit retains the original upstream fetch time. These values stay under the hood.

Visible pages refresh current and selected batches every five minutes and check again on connectivity or visibility changes. The service worker delivers notifications and opens or focuses the app. It does not fetch timetables, retain credentials, or monitor after the page closes. Notification permission and delivery still need physical-phone verification.

Notification deduplication retains hashes of 200 delivered changes for up to seven days. Without browser locks or shared storage, deduplication is best effort. Browser acceptance does not prove the operating system displayed an alert.

Rate limits are deployment defaults, not measured capacity. Roster use allows 120 requests per credential per minute with a 6,000-per-minute IP ceiling. Token mutations allow 20 per existing credential per 15 minutes with a 1,000-per-15-minute IP ceiling. A shared fallback token still shares its allowance. Counters and upstream caches remain process-local.

Failure logs contain a generated request ID, fixed route label, method, status, and duration. They exclude credentials, cookie headers, query strings, timetable payloads, and exception messages. The README distinguishes the token's initial paste field from the encrypted HttpOnly cookie used afterward.

Ship frontend and API changes together. Credential context and fetch time are now required response fields. Rotating the cookie secret, changing the upstream URL or time zone, or replacing the token changes the cache context.

Cross-week reconciliation assumes an OSIRIS ID identifies a class occurrence. Synthetic tests cover moves; unusual recurring-ID behavior still needs institution-specific confirmation. Duplicate IDs in a response are rejected rather than silently merged.

## Build size and verification

| Emitted asset                | Review baseline | Updated build |
| ---------------------------- | --------------: | ------------: |
| JavaScript                   |       305.22 kB |     316.35 kB |
| JavaScript, gzip             |        94.94 kB |      98.74 kB |
| CSS                          |       157.96 kB |     141.51 kB |
| CSS, gzip                    |        36.06 kB |      30.16 kB |
| Solid and regular icon fonts |       138.63 kB |       Removed |

SVG data is included in CSS. These are emitted asset sizes, not physical-device performance measurements. The icon subset is generated from names in source; unknown names fail the build. No runtime icon or state-management framework was added.

Verification passed 133 unit tests, both TypeScript configurations, the production build and smoke test, lint, a frozen Bun install, and formatting. The full browser suite passed 201 tests across Chromium, Firefox, and WebKit, with six deliberate skips.

An earlier WebKit reload run reported an intermittent fetch access-control error even though the saved timetable and warning displayed correctly. Five isolated repeats and a later full run passed. This does not establish that the browser error can never recur.

The real localhost session was reloaded and showed 7 through 13 September with the neutral default-week marker, the calendar-relative Next week label, and Previous disabled because the earlier week was not saved. Browser tests separately verify cached previous-week navigation across that gap. Live browser click automation timed out, so the navigation checks relied on the automated test browsers.

The production smoke suite starts Express with an isolated synthetic upstream and credential. It checks built assets, cache and security headers, malformed JSON, encrypted cookies, context continuity, fetch timestamps, and sanitized error correlation. It never calls real OSIRIS. Browser regressions cover account changes, recovery, cache reuse, Sunday-to-Monday reloads, current/next-week selection, vacations, reset controls, hidden weekend classes, and overlapping requests. Screenshot baselines and computed colour checks run in Chromium; Firefox uses one worker for held-key focus reliability.

No production deployment, physical-phone session, or spoken screen-reader session was tested. The Windows CI workflow is included, but its first hosted run has not happened here.

## Future UI refinement, deliberately deferred

- Revisit desktop card hierarchy, especially room and start time in short classes, and redundant title/subject text.
- Choose a mobile grid inspection model, such as a day drill-down or minimum column widths with explicit scrolling.
- Reduce the mobile toolbar's permanent footprint and distinguish navigation from secondary controls.
- Make a separate Today action explicit and bring the current or next class into view; consider a date picker for distant weeks.
- Revisit the current-time line's colour and scope without confusing it with cancellation status.
- Clarify that Smart days/hours are one-time fit actions, or design a persistent automatic mode separately.
- Improve written token onboarding and submission copy. Investigate an institution-supported authorization route if expansion is justified.
- Consider Remove token wording, authentication recovery placement, and a separate system-appearance preference.

An offline app shell and dependable alerts while closed remain separate product decisions. Cached timetable data does not guarantee that an uncached app shell can start offline. No visible freshness timestamp or notification test button was added.
