# Better Osiris, remaining improvements

Updated 30 September 2026 after the third implementation pass. Numbers in `Original` refer to the [full review](architecture-review-2026-09-30.md). Related entries are combined here. This is a decision list, not a promise to build every experiment.

Completed original entries 1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 37, 57, 80, and 85. Also removed unused conflict calculations, moved shortcut formatting out of its React hook, preserved and validated upstream seconds, standardized the icon command on Bun, documented missing configuration, and added transition regressions. Existing race tests remain intact.

## Do next

1. Define startup trust for cached account data and browsing after token expiry. Decide what can appear before cookie identity is known, especially on shared devices. Original 44, 54.
2. Stop silently dropping classes with invalid converted times. Define daylight-saving gap and repeated-hour behavior. Seconds validation and preservation are complete. Original 6.
3. Cover zoomed text, forced colors, hybrid input, tooltip descriptions, and disabled selection groups. The WebKit reduced-motion theme-picker failure is fixed. Blocking timetable underlays are inert. Original 65.
4. Define evidence and lifetime for cancellations and change markers. Distinguish explicit upstream cancellation from disappearance, decide when history clears, and specify what an open drawer does when its class disappears. Original 50, 51, 52.

## Rebuild ownership

5. Give App a controller and an explicit screen state. Replace the loading-boolean matrix with states that deliberately support cached content during refresh or failure. Original 13, 14.
6. Give bootstrap one owner for configuration and access. Configuration response ordering and reuse of the token's verified batch are complete. Original 15, 67.
7. Inject the time-zone conversion context into domain work. Live time now has its own hook outside preferences. Original 16, 23.
8. Separate source classes from displayed change history. Keep transport and raw storage authoritative, with display status derived separately. Original 17.
9. Extract pure repository planning and response transitions. Separate batch request state from dated content while preserving overlapping-response and account-generation protections. Original 18, 19.
10.   Select weeks by Monday date. Define whether an open page follows Home or stays on its selected date across midnight and source rollover. Original 20.
11.   Move notification delivery out of the repository. Reconciliation produces events, and a separate owner handles scope, settlement, grouping, and deduplication. Original 22.
12.   Give preferences a small shared persistence policy. Keep named validators and synchronize useful choices between tabs. Original 24.
13.   Share token-entry behavior between startup and settings. Keep their layouts distinct. Original 27.
14.   Organize files around the resulting owners. Shortcut formatting is already a pure library function. Avoid reorganizing before the ownership decisions. Original 28.

## Make less work happen

15. Parse and index classes once per content revision. Reuse dates, instants, day timelines, and wall-clock minutes across Home, views, next up, and reminders. The unused quadratic conflict calculation is gone. Original 29, 30.
16. Share one visual clock subscription between consumers if profiling warrants it. Visual clocks now stop while hidden and refresh immediately on resume. Keep reminder scheduling independent. Original 31.
17. Reduce grid work during animated zoom. Try container queries or threshold changes for compact cards, and draw grid lines with CSS backgrounds. Original 33, 34.
18. Measure cached launch, week navigation, settings opening, zoom, and clock updates under CPU throttling. Use those results to decide lazy loading and font subsets. Original 35, 36, 41.
19. Publish successful content before expensive persistence where safe. Coalesce writes and skip full reconciliation for unchanged responses without losing freshness or notification state. Original 38, 39.
20. Make prefetch depend on useful navigation intent and known horizon. Preserve instant adjacent navigation before reducing the five-week buffer. Original 40.

## Improve the actual timetable experience

21. Expose ordinary manual refresh and define a bounded server refresh contract. A client refresh currently can return the same 60-second upstream cache. Original 43, 68.
22. Separate saved visibility choices from temporary fitting. Name the current Smart action accurately or offer Auto. Warning actions should allow showing an exceptional class this week without permanently changing preferences. Original 45, 46.
23. Make Single folding useful in the selected week and decide whether an ongoing class wins. Align it with Home and next up deliberately. Original 47, 48.
24. Show simultaneous obligations and make empty versus unavailable weeks understandable. Avoid implying that the app knows which overlapping class to attend. Original 49, 53.
25. Improve token setup with concise in-app steps and useful paste normalization. Original 55.
26. Restore browsing context through selected-week URL state and per-week scroll position. The custom week chooser is implemented but its entry button is hidden pending further UX review. Original 56.

## Simplify presentation and interaction

27. Choose one viewport and height model. Remove competing CSS multipliers and fixed chrome estimates, then verify mobile browser chrome and keyboards. Original 58.
28. Preserve entrance motion without remounting the entire timetable on every navigation. Original 60.
29. Share tooltip and shortcut behavior across controls. Share useful slider markup without forcing all buttons or sliders into one universal component. Original 61.
30. Check readability with long believable course names, missing fields, short classes, overlaps, and seven days. Mobile viewport bounds alone do not prove readability. Original 63.
31. Compare styled native scrollbars with the custom implementation. Panel closing now shares one duration and lifecycle. Remove only fallback timers that have no real job. Original 64.

## Tighten server and verification work

32. Share route policy across Express and serverless adapters. Expand consequential parity checks for malformed requests, rate limits, private headers, and structured errors. The escaped token GET error and configuration retry-header inconsistency are fixed. Original 66, 81.
33. Define deployment guarantees for per-process cache and limits. Bound upstream concurrency if public load warrants it, and make proxy trust consistent across rate limits and origin checks. Original 70, 71, 72.
34. Validate named immutable production configuration once and resolve credentials once per request. Add safe cache and stage diagnostics plus copyable request IDs. Original 73, 74.
35. Add graceful shutdown if self-hosting is the supported default. HTTPS hosting, cookie-secret rotation, cookie lifetime, and per-process serverless limits are documented. Original 75.
36. Replace brittle CSS assertions with useful interaction and visual checks. Split the browser suite by behavior and add remaining visible transition cases, especially a one-week empty horizon and configuration response replacement. Preserve the existing race coverage. Original 76, 77, 78, 79.
37. Fix incomplete environment mocks, remove unreachable downstream fallbacks, and narrow NumberField only if reusable fractional behavior has no intended role. Keep corruption recovery and external input guards. Original 82, 83, 84.
38. Add reproducible CI with locked Bun dependencies, browser installation, traces, and a compatibility cadence. Document dependency overrides and verify icon regeneration after development edits. Full source, test, and tooling typechecking and production smoke are now part of verification. Original 86, 87.

## Bigger bets

39. Request weeks by absolute date at the API boundary. This could move source-offset mapping out of the browser. Prove upstream mapping and cached-past-week behavior first. Original 88.
40. Export calendars, starting with an honest ICS snapshot. Live subscriptions require revocable access and correct cancellation updates. Original 90.
41. Add real push reminders or a credential-transfer companion extension. Both need explicit access and operational design. They are separate experiments. Original 91, 92.
42. Prototype a focused Today view or compact widget, mobile day paging, and automatic week fitting. Each must earn its place against the existing agenda and grid. Original 93, 94, 95.
43. Try a cancellation rail and concise changes review. Keep removed obligations visible and settle change-history lifetime first. Original 96, 97.
44. Compare a small React toast owner with Notyf. Replace it only if the result reduces code or improves accessibility and behavior. Original 98.
45. Compare a lighter renderer only after profiling the main flow. Keeping React is my current recommendation. Original 99.
46. Add development-only state inspection and deterministic event replay for source shifts, account changes, midnight, and races. Use synthetic data and keep credentials out. Original 100.

The second pass implemented warning-only freshness, absolute agenda choices, verified-batch reuse, clocks outside preferences, visibility-aware ticking, mutually exclusive overlays, shared panel closing and styling, direct date navigation, and offline app launch. Healthy browsing has no new status label. Offline launch uses versioned public files and leaves API responses out of service-worker caching.

The third pass replaces the native date field with a custom month calendar that selects whole weeks immediately. It includes five visible weeks, snapped vertical scrolling, direct month selection, keyboard week navigation, and focused selection on opening. Its entry button is hidden for now. The picker remains in the code for further revision, and the month label updates after scrolling settles. It also separates agenda measurement from progress ticks, keeps content subscriptions stable during refresh, contains swipes to the timetable, respects reduced motion in the theme picker, and preserves upstream retry timing with bounded extra delay.

Cache trust and daylight-saving correctness are the next decisions I would settle. Larger application and repository rewrites still need measured reasons and explicit behavioral rules.

## Verification after implementation

The third pass passes 183 unit tests and 87 Chromium browser tests. Verification includes formatting, lint, full-project typechecking, production build, and production smoke. Targeted Firefox and WebKit checks cover the custom picker, agenda geometry, swipe containment, reduced-motion themes, token replacement, and both notification delivery paths. The constructor notification test now makes worker failure explicit and removes an unrelated screenshot-only step.

Production smoke launches the app with the server stopped, checks that no API response enters the worker cache, and confirms removed account data stays cleared after offline reload. Static icon and manifest changes now also change the offline cache version. The full compatibility suite was not rerun. Its earlier failures remain recorded in the original review, although the repeatable theme-picker failure and the reminder fixture described there have been addressed.

Production CSS is about 145.5 KB, or 29.9 KB gzip. Production JavaScript is 337.43 KB, or 105.16 KB gzip. The custom picker adds about 1 KB of compressed JavaScript over the second pass. Browser checks prove that agenda progress no longer measures unchanged class geometry, and repository checks prove stable content references during refresh. No launch-speed improvement is claimed without a runtime benchmark.
