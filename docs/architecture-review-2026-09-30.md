# Better Osiris architecture review

Reviewed on 30 September 2026. The findings below describe the original review baseline. Clear improvements have since been implemented. See the [trimmed remaining list](architecture-review-remaining.md) for current scope and completion notes.

## My assessment

Keep React, the small server, the shared timetable rules, and the separate agenda and grid renderers. The app has a stronger correctness foundation than its scattered file tree initially suggests. Its worst problems are ambiguous ownership and a few incomplete state transitions. Rewriting everything would throw away useful work without automatically fixing either.

The bold move I would make is to rebuild the application controller and repository scheduling around explicit states, absolute week dates, and pure transitions. Keep the domain behavior and UI character while doing that. Treat the existing race tests as a specification, then replace tests that only freeze internal CSS or imaginary generality.

There are 100 numbered opportunities below. They include reproduced defects, issues established by reading the implementation, proposed refactors, and experiments. They are not 100 changes to implement. Several experiments are alternatives to each other.

Priority means urgency if we choose the change. P1 affects timetable reliability or a core interaction. P2 improves ownership, usability, or measured work. P3 is optional cleanup or an experiment. Evidence labels distinguish reproduced behavior, source findings, proposals, and hypotheses. A source finding is not a claim that I observed the failure in a live authenticated OSIRIS session.

## What was checked

The review followed upstream parsing and normalization, server routes and credentials, browser session handling, repository requests and persistence, reconciliation, time zones, both views, next up, reminders, preferences, overlays, controls, CSS, themes, build tooling, and tests.

- Unit tests, 176 passed across 34 files.
- Chromium browser tests, 80 passed, including screenshot baselines and automated accessibility checks.
- Production build and both production TypeScript configurations passed.
- ESLint passed.
- Production smoke passed with a synthetic OSIRIS endpoint. This covers serving assets, response headers, malformed request bodies, encrypted cookies, request IDs, and the API round trip.
- Production assets measured 330.57 KB JavaScript, 103.10 KB gzip, and 154.25 KB CSS, 31.76 KB gzip. The build also emitted three Quicksand font subsets.
- Inspected the desktop grid and mobile agenda baseline images. These use synthetic labels, so they are poor evidence for real title and room readability.
- Temporary probes reproduced the omitted-week request loop, Home treating an omitted next week as unresolved, and equality accepting different previous snapshots. The probe file was removed.
- Firefox and WebKit verification results are recorded in the final verification section.

No personal token was read or used. Live upstream behavior, real device suspension, mobile browser chrome, and performance on a low powered phone remain unverified. The performance proposals below are not fabricated speed measurements.

## Preserve these decisions

- Cached data stays visible during refresh and transient failure.
- Dates identify cached weeks. OSIRIS offsets are request coordinates.
- Batch fetching, upstream request deduplication, cache bounds, and retained upstream fetch times.
- Old responses cannot restore an invalidated session or overwrite fresher class movement history.
- Validation at upstream, API, and browser persistence boundaries.
- Credentials stay in encrypted HttpOnly cookies after submission.
- Timetable times use the roster zone, including when the device is elsewhere.
- Agenda and grid share timetable logic but retain separate markup.
- The class drawer shows concrete old and current values.
- Gestures, shortcuts, focus containment, reduced motion support, and intentional animations.
- Theme palettes remain ordinary CSS with a small registry.

## Correctness and incomplete transitions

Primary code: [week repository](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/weekRepository.ts), [week policy](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/weekPolicy.ts), [week hook](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/hooks/useWeeks.ts), [next up](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/NextUpCard.tsx), [upstream normalizer](C:/Users/NoomS/Coding/Web/Osiris-but-better/api/_lib/osirisRosterNormalizer.ts).

1. **P1, reproduced. Stop the omitted-week refetch loop.** `finishBatch` reloads an active week without data, error, or fetching state, even when `isOmitted` is true. `load` also treats omitted dates as stale. Selecting offset 2 and receiving only offset 0 produced nine requests within 50 ms in the bounded probe. Make known omission a settled state. Test navigation into an unresolved week that subsequently becomes omitted.

2. **P1, reproduced. Make Home distinguish missing from omitted.** With an empty current week and an explicitly omitted next week, `getHomeWeek` returns `pendingOffset: 1`. `ensureWeek` does not exclude omission either. This can feed the loop during startup without deliberate user navigation. A completed short response must allow Home to settle on the available empty week.

3. **P2, source finding. Enable Smart settings after a complete short batch.** `areInitialWeeksLoaded` requires exactly five weeks. A valid response with fewer weeks permanently disables Smart days and Smart hours. Track whether the initial request settled successfully, with complete knowledge of its returned and omitted dates. Do not confuse completeness with response length.

4. **P1, source finding. Never activate next up on pointer cancellation.** `endDrag` invokes `tapAction` when no movement was recorded before checking `commit`. A `pointercancel` can therefore expand the card or open a class. Check cancellation first, clear all drag state, and add cancellation and lost capture coverage. Keep normal pointer taps and keyboard activation working.

5. **P2, reproduced contract gap. Include change history in display equality.** `isSameWeekData` compares current details and status but ignores `previous`. Two changed classes with the same current room and different old rooms compare equal. Reference reuse can preserve an obsolete drawer snapshot if history changes independently. Separate raw equality from display equality, or include the previous snapshot in the display comparison. The probe proves equality is incomplete, not that an ordinary upstream refresh currently rebases history.

6. **P1, source finding. Do not silently alter or drop a class after validation.** `getPositionedClasses` and `collectNextUpEntries` skip invalid times. Upstream time parsing also accepts seconds without checking their range, then normalization drops seconds entirely. Define the actual upstream precision contract. Validated data should render completely or produce a visible integrity failure. Add daylight-saving gap and repeated-hour cases to the time-zone contract rather than relying only on winter and summer examples.

7. **P2, source finding. Preserve missing fields as missing.** Normalization writes `"Unknown"` into absent teacher, room, and location. Next up then treats `Unknown` as a destination, and the drawer treats it as a real value. Store empty values or explicit absence, and let presentation choose `Not set`. This also prevents fallback text from polluting change detection.

8. **P1, source finding. Handle token-settings read failures in the serverless adapter.** Its GET branch calls `enforceRateLimit` outside the handler's try/catch. Exceeding the limit throws instead of producing the structured private JSON error used by the other paths. Move the whole route inside the error boundary and preserve retry headers. Express has an outer error handler; this adapter does not.

9. **P2, source finding. Order configuration responses.** `useRosterTimeZone` uses one `stale` flag per effect, but initial, retry, and online calls within that effect can overlap. An earlier response can win after a newer one. Give the bootstrap request a generation or an abortable single-flight owner. The risk is most relevant when server configuration changes while the page is open.

10.   **P2, source finding. Make manual agenda overrides absolute.** Overrides currently mean invert the automatic answer. If the automatic set changes after a refresh or midnight, a user's explicit collapse can become an expansion. Store `day -> open/closed`, and define when those overrides expire. Preserve reset and preset behavior deliberately.

11.   **P2, source finding. Stop consuming unused Ctrl shortcuts.** The hook registers Ctrl plus every digit 1 through 9, even where the handler does nothing. In grid mode 4 through 9, and agenda mode 3 through 9, can suppress browser commands without an app action. Register only implemented combinations and respect `defaultPrevented` and composition. The deliberate active shortcuts need their own product decision.

12.   **P2, source finding. Reconcile the written Home contract with the code.** The glossary describes OSIRIS's Saturday advance, but `getHomeWeek` also advances when this week's last active class ends. Existing tests intentionally protect the richer behavior. Document actual app Home separately from upstream offset zero, or change it intentionally. Do not let a refactor accidentally pick one interpretation.

## State ownership and module boundaries

Primary code: [App](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/App.tsx), [preferences provider](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/hooks/PreferencesProvider.tsx), [session store](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/sessionStore.ts), [time zone state](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/rosterTimeZone.ts), [class reconciliation](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/classDiffs.ts).

13. **P2, proposal. Give App one application controller.** App currently combines navigation, Home seeking, token validation, selection, preference adaptation, warning actions, animation flags, and view props. Extract a controller with named actions and an explicit screen model. Keep App responsible for composition. Avoid merely moving its 400 lines into an equally tangled hook.

14. **P2, proposal. Replace intersecting loading booleans with explicit states.** `WeekContentState` receives roughly twenty pieces of independent information and infers priority. Define states such as configuring, verifying access, loading week, cached week, fresh week, omitted week, and failure. Cached data and refresh status should coexist intentionally. This makes inaccessible or contradictory combinations harder to construct.

15. **P2, proposal. Make bootstrap own configuration and access.** Startup independently fetches roster configuration and token settings, each with different retry behavior. One bootstrap response and owner can declare the school, roster zone, and access context. Keep public configuration separate if that has a real deployment benefit. Choose that boundary explicitly rather than through historical endpoints.

16. **P2, proposal. Inject time zone and clock into domain work.** `getRosterTimeZone` is mutable module state used throughout date formatting and repository logic. The React hook keeps another representation. Give the timetable context one observable value and pass it into conversion and scheduling. Tests become easier, and a zone update cannot quietly leave a consumer stale.

17. **P2, proposal. Separate source classes from displayed classes.** The shared `Week` contract allows added and changed classes even though upstream normalization only produces scheduled or cancelled classes. Use a source week contract for transport and raw storage, then derive display changes. This reduces conversions that strip status back to scheduled and clarifies which snapshots are authoritative.

18. **P2, proposal. Rewrite repository transitions as pure operations.** Keep the repository as the asynchronous owner, but extract request planning and response application with explicit inputs and outputs. It currently owns raw weeks, stored weeks, change maps, entries, source mapping, retries, notifications, and persistence. Pure transitions should reduce interacting mutable fields, not create a class for every Map.

19. **P2, proposal. Separate batch request state from week content.** One five-week failure is copied into several `WeekEntry` objects with retry and fetch flags. Store request status per batch and dated content per week. Derive visible week status from both. Preserve the protection against an older overlapping failure masking a newer success.

20. **P2, proposal. Use absolute dates for selected weeks too.** Persisted data is date keyed, while App selection is calendar-relative offset keyed. Selecting a Monday date makes rollover and source advances easier to reason about. Compute navigation offsets at the request boundary and relative labels at the display boundary. Define whether an open page follows Home or stays on its selected date.

21. **P2, proposal. Publish selectors with stable data references.** Any repository publish replaces `entries`, which rebuilds `knownWeeks`, `initialWeeks`, and related arrays even for request metadata changes. Expose active content, known content, and request status separately. This should reduce recalculation without spreading `memo` everywhere. Measure the result.

22. **P2, proposal. Move notification delivery out of the repository.** Reconciliation should produce change events. A notification owner decides scope, grouping, deduplication, and delivery. The repository currently imports toasts and browser notifications. Keep cancellation settlement behavior intact, but stop making the data source know how the UI announces its results.

23. **P2, proposal. Put real time outside PreferencesContext.** `useDevPreview` runs a live minute clock even in production. Its result changes the preferences object and wakes every consumer. Preferences should represent saved choices. Put live time in a dedicated owner, and dev overrides in a development owner.

24. **P2, proposal. Give preferences one persistence policy.** Small preference hooks repeat read, parse, effect, and write behavior. Use a modest typed preference helper or store with named codecs. Preserve understandable validators and storage keys. Do not build a settings framework. Add cross-tab synchronization where it is useful rather than implementing it inconsistently.

25. **P2, proposal. Make overlay selection mutually exclusive by construction.** App has settings-open state and selected-class state plus callbacks that clear one when setting the other. Use one overlay union, including nested confirmation where required. This removes synchronization work and gives gestures and shortcuts one reliable open-overlay check.

26. **P2, proposal. Let the overlay owner manage closing.** ClassDrawer and SettingsDialog both implement closing flags, timers, and cleanup. ClassDrawer also mirrors its prop through a microtask. Centralize present/open/closing lifecycle and preserve closing content deliberately. Keep class and settings content separate.

27. **P2, proposal. Share token-entry behavior.** Startup and settings have separate drafts, forms, status messages, and clearing effects. Share a token entry controller and status-to-copy mapping, with compact and settings presentations. Avoid merging the surrounding screens or forcing identical layouts.

28. **P3, proposal. Organize files by real owners.** A schedule directory can contain repository, persistence, selectors, and rules. Preferences, session, overlays, and controls can have similar clear homes. Move shortcut formatting out of a React hook, since `appShortcuts` currently imports the hook module for a pure formatter. Do this after ownership decisions, not as a cosmetic first step.

## Performance and unnecessary work

Primary code: [clock hook](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/hooks/useClock.ts), [agenda](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/AgendaView.tsx), [grid](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/GridView.tsx), [timeline rules](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/dayTimeline.ts), [persistence](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/weekPersistence.ts), [icon build plugin](C:/Users/NoomS/Coding/Web/Osiris-but-better/scripts/iconSubset.ts).

29. **P2, proposal. Parse and index classes once per content revision.** Week positioning, next up, Home, agenda policy, smart hours, and reminder work repeatedly resolve the same strings through time zone formatting. Build a derived class index with instants, day keys, and wall-clock minutes. Keep the raw transport format serializable and invalidate the index when content or zone changes.

30. **P2, proposal. Build day timelines once.** Agenda renders calculate timelines, and the one-second current indicator calculates another timeline. `getDayTimeline` also computes all conflict pairs, although application code does not consume them. Precompute the useful day facts. Either use conflict information in the UI or remove that computation and its unused-output assertion.

31. **P2, proposal. Share a visibility-aware clock.** There are independent minute, five-second, and one-second clocks and visibility listeners. Share a small clock subscription with only the precision each consumer needs. Stop hidden-page visual updates and refresh immediately on resume. Notification scheduling must remain a separate obligation.

32. **P2, proposal. Separate agenda geometry from progress.** The current indicator reads bounding rectangles every second even when the active segment and layout are unchanged. Measure when the target or layout changes, then update only progress. Keep ResizeObserver support for expansion, fonts, and responsive changes. Profile before introducing imperative animation machinery.

33. **P2, proposal. Avoid rebuilding every grid class during height animation.** A ResizeObserver stores exact content height on each change, then all cards recompute metadata and compactness. Consider container queries on class cards or update only at compactness thresholds. Exact rectangle measurements may still be necessary for the zoom model, so compare implementations under an actual animated zoom.

34. **P2, proposal. Make grid lines a CSS background.** The grid renders quarter-hour line elements in every day even when those lines are invisible at the selected zoom. Repeating backgrounds can draw the grid with much less DOM. Keep accessible time labels and independent current-time styling. Verify line alignment across zoom levels and device scales.

35. **P2, proposal. Lazy load settings and the drawer.** Both are imported into the main entry although closed at startup. Split the heavier settings, theme picker behavior, and dev tooling first. Warm the code on idle or an obvious user intention if the first open becomes slower. Count network requests and first-open latency, not just entry chunk size.

36. **P3, proposal. Ship only the font subsets the audience uses.** The entry imports the complete Quicksand package CSS. Latin may be sufficient for current users; keep extended Latin if real names need it. Font declarations do not imply every emitted file is downloaded. Inspect actual transfer and preload only the required face before claiming a saving.

37. **P2, proposal. Fix the icon subset's unnecessary duplication.** The scanner collects icon names without their solid or regular pairing, then emits both available variants. Scan explicit style/name pairs or use a small icon registry. Keep the existing dependency-free rendered masks unless another approach proves smaller and easier. Check licensing attribution if changing the pipeline.

38. **P2, proposal. Persist changed content without blocking each response.** Every successful batch serializes the stored weeks and session diffs synchronously before publishing updated data. Publish first where safe, coalesce redundant writes, and keep the current account and generation attached to deferred work. Consider IndexedDB only if measured payload size or offline scope justifies its added asynchronous complexity.

39. **P2, proposal. Stop unchanged responses from doing full reconciliation work.** Server fetch timestamps and client checks can advance while content stays identical. Detect unchanged raw content and update freshness without rebuilding all diff structures or rewriting identical class data. Preserve notification state and the distinction between checked, fetched, and changed times.

40. **P2, proposal. Make prefetch intentional.** `loadActive` immediately requests the next batch, and active refresh paths can still fetch data not useful to the visible week. Keep the fast adjacent-week path. Delay farther work, consider backward navigation intent, and avoid repeated requests beyond a known horizon. Measure navigation misses before reducing the current useful five-week buffer.

41. **P2, proposal. Add performance evidence for the actual goal.** Measure cached launch, cached week switch, cold week switch, settings opening, zoom, and minute ticks under CPU throttling. Use realistic class counts and overlaps. Set budgets after measurement. A smaller file count and fewer dependencies are not themselves proof that the timetable opens faster.

## Product behavior and usability

Primary code: [week content states](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/WeekContentState.tsx), [settings](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/SettingsDialog.tsx), [navigation](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/WeekNavigator.tsx), [agenda policy](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/agendaPolicy.ts), [notifications settings](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/NotificationSettings.tsx).

42. **P1, proposal. Show the freshness of cached timetable data.** The app retains checked, fetched, and changed timestamps but users mainly see a spinner or failure banner. A calm `Updated 8 minutes ago` or `Offline, saved timetable` state makes cached lessons assessable. Use actual upstream fetch time for freshness, not the time a server cache hit was received.

43. **P2, proposal. Expose manual refresh as an ordinary action.** Refresh exists internally but the toolbar only shows a status spinner. Users can retry after failure, but cannot explicitly check a suspicious successful timetable through a visible control. Add a refresh action or a suitable mobile gesture with a clear outcome. Make it actually request fresh upstream data if that is the promise.

44. **P1, proposal. Make cache identity trust an explicit startup decision.** The repository hydrates before token settings identify the current credential. Cached data can appear while identity is unresolved, which helps offline launch but can show a prior account after an out-of-band cookie change. Define whether trusted local account cache may render immediately. Label unresolved identity, or withhold it where shared-device privacy matters. Preserve useful offline access intentionally.

45. **P2, proposal. Separate hiding data from fitting data.** Smart days is currently a one-time write based on the initial five weeks. Smart hours behaves similarly. Offer a real Auto mode or name the existing action `Fit loaded weeks`. Distinguish global saved choices from a temporary fit for the current week.

46. **P2, proposal. Reveal exceptional classes without rewriting preferences.** Hidden-day and hidden-hour warning actions currently persist an expanded preference. Add `Show this week` as a temporary override, with `Always show` where appropriate. A one-off Saturday exam should not permanently widen every future week.

47. **P2, proposal. Make Single folding useful in browsed weeks.** It opens only the globally next class day, so most other weeks can open entirely collapsed. The tests deliberately encode this. I would use the next relevant day in the selected week, or its first active day, while keeping global next up separate. This is an intentional behavior change, not an accidental regression fix.

48. **P2, proposal. Handle ongoing classes in default agenda selection.** `getNextClassDay` considers future starts, while Home considers classes whose end is still ahead. Opening during a class can therefore pick a later day for Single folding. Decide whether current class wins and align Home, Single, the current indicator, and next up with that policy.

49. **P2, proposal. Show simultaneous obligations clearly.** Next up chooses the first running class, while grid placement shows overlap and agenda conflict pairs are unused. Add a compact conflict indication and a way to inspect simultaneous classes. Do not imply that the app knows which one the student should attend.

50. **P2, proposal. Treat cancellation as explicit evidence.** Removed rows are displayed as cancelled even when upstream did not send cancellation status. That may be the most useful behavior, but a moved or incomplete response can temporarily tell the student a class is cancelled. Consider a `Removed from latest timetable` explanation or pending removal until related requests settle. Do not silently erase removed classes.

51. **P2, proposal. Give change markers a deliberate lifetime.** Session storage means history may survive reloads but disappear in a new tab, while notifications have another deduplication lifetime. Choose changes since last visit, changes until acknowledged, or this session, then name and implement that rule. Add a small change summary only if it improves the next decision.

52. **P2, proposal. Define what happens when an open class disappears.** App resolves selection by ID against current data; disappearance can close the drawer immediately, while ClassDrawer has its own retained copy. Choose between showing a cancellation, explaining removal, or intentionally closing. Resolve this through one owner rather than competing snapshots.

53. **P2, proposal. Make empty and unavailable weeks clearly different.** An empty returned week means no classes. An omitted date means OSIRIS did not supply it. The current architecture has both states but its navigation and placeholder behaviors make them easy to conflate. Give each a stable presentation and make the known end of the timetable understandable.

54. **P2, proposal. Keep cached browsing available after token expiry.** The app already displays cached content with an auth warning in some cases. Make this an explicit offline access policy so replacing access does not unnecessarily block reading already trusted weeks. Decide how it interacts with clearing a token and shared-device privacy before changing invalidation rules.

55. **P2, proposal. Improve token acquisition in the app.** A password field and external video are a brittle first-run dependency. Add short browser-specific steps and useful paste normalization, such as accepting a bare token and adding the prefix if unambiguous. Keep raw credentials out of persistent frontend storage. Any automatic login method needs separate feasibility work.

56. **P2, proposal. Add direct date navigation and restore context.** A date picker or week chooser is more practical than clicking thirty times. Optional URL state can identify the selected week and view, and per-week scroll position can make returning less annoying. Keep shortcuts and fast arrows. Do not put class details or account secrets in URLs.

## UI, controls, motion, and accessibility

Primary code: [overlay panel](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/OverlayPanel.tsx), [App CSS](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/styles/App.css), [viewport metrics](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/hooks/useViewportMetrics.ts), [buttons](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/Button.tsx), [action controls](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/components/ActionGroup.tsx).

57. **P2, source finding. Make disabled timetable underlays inert.** The blank underlay uses blur and `pointer-events: none`. That does not itself remove grid buttons or agenda headers from keyboard navigation. Set `inert` on the visual placeholder when a blocking state owns interaction. Keep the real cached roster interactive when a nonblocking warning is shown.

58. **P2, proposal. Consolidate viewport and height rules.** CSS repeats grid height multipliers alongside App's 52-pixel row calculation, a fixed 127-pixel chrome estimate, and several viewport variables. Some stable viewport declarations are immediately overridden by `100dvh`. Pick one height model, measure actual chrome where needed, and delete the losing branches. Verify mobile keyboard and browser chrome on real devices.

59. **P2, proposal. Contain gestures to their intended regions.** Week swipe listens on the whole window. Overlay swipe tracks vertical distance without horizontal intent or a touch cancel reset. Give week navigation an explicit gesture area, protect inputs and the next-up handle, and track direction and pointer identity. Preserve one-handed navigation.

60. **P2, proposal. Keep animations without remounting the whole view.** The frame key changes for each week and view, so all view effects and observers restart to replay entrance motion. Animate a stable frame with an explicit transition revision where practical. Preserve quick repeat navigation. The code documents a failed View Transition experiment that covered mobile controls, so do not casually reintroduce it.

61. **P2, proposal. Share control behavior without making one universal component.** IconButton, ActionItem, and the week heading repeat tooltip and shortcut wiring. Extract the common behavior and consistent semantic tokens. Keep text buttons, icon buttons, and radio groups distinct. Slider and RangeSlider can share track/header markup while retaining their different interaction rules.

62. **P2, proposal. Break SettingsDialog's dependency on class-panel styling.** Settings imports class drawer presentation classes for its backdrop, card, header, and close control. Move shared panel styling into the overlay layer and retain separate content styles. A future drawer restyle should not accidentally restyle settings.

63. **P2, proposal. Test readability with believable timetable data.** The baseline images use `SOURCE_TITLE_0_1` and similar strings. Add long course names, real-shaped room labels, missing teachers, overlaps, very short lessons, and seven shown days. The mobile grid uses roughly 9-pixel secondary text. Passing viewport bounds is not evidence that someone can read it. Consider a day-focused mobile grid instead of squeezing seven columns.

64. **P3, proposal. Reconsider custom scrollbars and motion constants.** The scrollbar duplicates native dragging, geometry, and visibility behavior, and chooses mobile policy only when attached. Trial styled native scrollbars and compare polish before deleting it. Move shared close durations into one lifecycle contract and keep fallback timers only where animation events can genuinely fail. Do not remove guards simply because they look defensive.

65. **P2, proposal and repeatable test failure. Strengthen accessibility beyond the current axe checks.** Add keyboard coverage for blocking states, dragging alternatives, zoomed text, forced colors, reduced motion, and hybrid touch/keyboard devices. The WebKit reduced-motion theme test repeatedly times out waiting for Thaw to be stable enough to click. Investigate the layout/animation interaction and test assumptions before blaming the palette. Tooltip behavior disables descriptions by device context, even if a keyboard is used there. Ensure selection groups stay focusable if the selected option becomes disabled.

## Server, API, deployment, and operations

Primary code: [server](C:/Users/NoomS/Coding/Web/Osiris-but-better/server.ts), [API routes](C:/Users/NoomS/Coding/Web/Osiris-but-better/api/_lib/apiRoutes.ts), [upstream client](C:/Users/NoomS/Coding/Web/Osiris-but-better/api/_lib/osirisClient.ts), [security](C:/Users/NoomS/Coding/Web/Osiris-but-better/api/_lib/security.ts), [rate limiting](C:/Users/NoomS/Coding/Web/Osiris-but-better/api/_lib/rateLimit.ts).

66. **P2, proposal. Share route policy across deployment adapters.** Express and serverless handlers repeat method validation, rate limits, origin checks, observability, and error serialization. The escaped GET error shows the practical cost. Keep shared services and a thin adapter for each runtime, with one tested route policy. Do not force request body plumbing into an inappropriate universal abstraction.

67. **P2, proposal. Return the verified batch when saving a token.** Saving access already fetches and normalizes five weeks, then the client fetches them again before considering validation complete. Return or otherwise reuse the verified result with its context and upstream timestamp. Adopt it only after the cookie mutation succeeds. This removes a startup round trip and a second phase of checking the same credential.

68. **P2, proposal. Give explicit refresh a server contract.** `force` bypasses client freshness but does not bypass the 60-second upstream cache. A user asking to check now can receive the same older response. Add a bounded refresh mode or make the UI state that distinction. Avoid permitting every request to bypass deduplication and hammer OSIRIS.

69. **P2, proposal. Carry upstream rate-limit timing through the API.** The upstream client marks 429 retryable but does not read its Retry-After header. Preserve a validated retry delay and combine it with bounded client backoff. Add jitter for automatic retries so many students opening after an outage do not retry in sync.

70. **P2, proposal. Treat in-memory server limits as per-process protections.** Cache and limiter Maps work in one process; serverless instances do not share them. Document that guarantee and add shared infrastructure only if deployment scale requires it. A small self-hosted app may be better served by one persistent server than a distributed cache dependency.

71. **P2, proposal. Bound upstream concurrency as well as cache size.** The success cache has a 100-entry bound, but distinct in-flight requests have no application concurrency ceiling. Introduce a small upstream queue or limit with understandable overload handling if exposed publicly. Keep per-credential deduplication and avoid one student's prefetch starving another's visible-week request.

72. **P2, proposal. Make proxy trust consistent.** Rate limiting has an explicit TRUST_PROXY policy, while same-origin calculation reads forwarded protocol independently. Resolve trusted origin and client address from a single deployment policy. Cover direct HTTP development, HTTPS termination, host forwarding, and malformed origins. This is a consistency review, not a demonstrated cross-origin exploit.

73. **P2, proposal. Use named configuration validated once per server instance.** Request paths repeatedly obtain and validate URL, zone, default token, and secret, and credential processing happens in rate limiting as well as route handling. Cache immutable production configuration and resolve request credentials once. Keep development reload and test reset behavior explicit.

74. **P2, proposal. Expand safe diagnostics.** Logs currently record failed request duration, status, route, and request ID. Add non-sensitive upstream failure code, cache hit/miss, and stage timings. Surface the request ID in copyable diagnostics. Keep tokens, cookies, payloads, query data, and class content out of routine logs.

75. **P3, proposal. Define deployment and session lifetime deliberately.** Document self-hosted HTTPS, serverless limitations, rotation of the cookie secret, and invalid-cookie cleanup. Consider a secure host-scoped cookie on production HTTPS deployments and a clearly separate local-development name. Add graceful server shutdown if self-hosting becomes the standard. Do not add a database just to make deployment feel more serious.

## Tests, defensive code, tooling, and maintenance

Primary code: [browser tests](C:/Users/NoomS/Coding/Web/Osiris-but-better/tests/e2e/roster-app.e2e.ts), [repository tests](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/weekRepository.test.ts), [number field rules](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/numberField.ts), [theme behavior](C:/Users/NoomS/Coding/Web/Osiris-but-better/src/lib/theme.ts), [package scripts](C:/Users/NoomS/Coding/Web/Osiris-but-better/package.json).

76. **P1, proposal. Add transition regressions that the passing suite misses.** Cover active-week omission, an empty one-week horizon during Home seeking, Smart availability after truncation, pointer cancellation, and serverless read rate limiting. The omitted-week test currently asserts flags without exercising the reaction to those flags. Assert bounded requests and a settled user-visible outcome.

77. **P2, proposal. Preserve the race tests.** Epoch invalidation, overlapping response freshness, cross-week movement, cancellation settlement, Monday rollover, and shared-school rate limits protect real failures. They are the wrong place to hunt for easy test deletions. Move them with their behavior when refactoring, and simplify fixtures without weakening assertions.

78. **P2, proposal. Replace brittle style assertions with useful visual checks.** Tests freeze easing values, selected palette expressions, and details of animation implementation. Keep a small number where they encode an intentional product rule. Prefer screenshots and interaction outcomes for the rest, so changing implementation does not require pretending the old CSS was the specification.

79. **P2, proposal. Split the browser test file by behavior.** It is over two thousand lines and combines navigation, sessions, preferences, themes, notifications, fixtures, and helpers. Use a shared fixture module plus focused suites. Keep sequential multi-step journeys together. This improves failure diagnosis without increasing the number of tests.

80. **P2, proposal. Put the production smoke into normal verification.** `verify` runs formatting, lint, unit tests, browser tests, and build, but omits the existing production smoke. Run smoke after the build it depends on. Current browser tests use Vite and mocked routes, so they cannot replace production-serving checks.

81. **P2, proposal. Add transport and deployment parity coverage.** The serverless token GET exception and config retry-header inconsistency are not covered by the mocked UI. Exercise rate-limited and malformed requests through both adapters. Test private cache headers and structured errors as observable contracts. Keep the number of cases small and consequential.

82. **P2, proposal. Stop test mocks from shaping production APIs.** `getDeviceThemeMode` casts `matchMedia` optional specifically because tests provide incomplete window stubs. Improve the test environment or inject environment lookup. Remove DOM-less branches only where the actual execution contract proves they are unnecessary. Keep reusable domain modules importable without a DOM.

83. **P3, proposal. Reduce unsupported NumberField generality.** Its only current product use is integer reminder minutes, but the library supports fractional origins, arbitrary steps, snapping modes, comma decimals, and floating-point precision rules. Either name it as an intentional reusable control, or narrow it to the real integer use and trim corresponding tests. Keep editing, cancellation, focus, and bounds coverage.

84. **P2, proposal. Remove unreachable downstream fallbacks after strengthening contracts.** Examples include date parser fallbacks for arbitrary strings, the normalizer's regex date rescue after schema validation, and impossible missing-index branches. Validate external input once, then use a strict internal contract. Keep body limits, JSON failure handling, cookie authentication, cache corruption recovery, and request-generation checks.

85. **P2, proposal. Typecheck tests and tooling deliberately.** Client TypeScript includes client/shared unit tests, server TypeScript excludes server unit tests, and Playwright/config coverage relies on another lint project. Add an explicit check configuration for all tests and build configuration files. Remove redundant strict subflags if they only restate `strict`, but preserve indexed-access and exact optional checking.

86. **P2, proposal. Make verification reproducible in CI.** Add a workflow that installs the locked Bun dependencies and required browser binaries, runs the checks, and uploads traces/screenshots on failure. Test the primary deployment path, with compatibility tests on an appropriate cadence. Avoid silently accepting platform-specific screenshot changes as fixes.

87. **P3, proposal. Simplify build and maintenance scripts where they earn it.** Standardize Bun for the icon generation command, document dependency overrides and their removal condition, and verify newly added icons trigger plugin regeneration during development. Keep README configuration synchronized with ROSTER_TIME_ZONE, SCHOOL_NAME, TRUST_PROXY, smoke tests, and Home semantics. Prefer deleting obsolete plumbing to adding another wrapper.

## Bold options and outlandish experiments

These are hypotheses. Each needs a prototype, a measurement, or an explicit scope decision. They should not displace the reproduced correctness fixes.

88. **P3, experiment. Put absolute date requests in the API.** Ask the server for five weeks starting on a Monday date, with the server mapping that date to OSIRIS offsets. This could remove much source-shift reasoning from the browser. It requires a reliable upstream mapping discovery policy and must preserve cached past dates that OSIRIS no longer exposes.

89. **P3, experiment. Build a truly offline app shell.** The current worker delivers notifications; it does not make the application itself load offline. Cache versioned static assets, provide safe update behavior, and load locally saved weeks. Keep credentialed API responses out of a generic service-worker cache. Measure launch speed and test logout, account switches, and stale-version recovery.

90. **P3, experiment. Offer calendar export.** An ICS download or a private subscription can put classes in the student's existing calendar and let its reminder system do useful work. Accurate cancellation and change updates matter more than export itself. A subscription requires revocable access and server-side responsibility. A static export must clearly state that it is a snapshot.

91. **P3, experiment. Replace best-effort page alerts with real push.** Server scheduling and push could notify while the app is closed. This introduces retained credentials or another authorized fetch mechanism, subscriptions, delivery policy, and operations. It directly helps reliability, but it is a substantial product and security change. The current UI already honestly explains its limitations.

92. **P3, experiment. Move access setup into a companion browser extension.** A supported companion could transfer the student's credential from their own OSIRIS session with fewer manual steps. Prototype against actual institution behavior first. Explicitly constrain origins and permissions. Do not make unsupported assumptions about OSIRIS login flows or refresh credentials.

93. **P3, experiment. Add a focused Today view or compact home-screen widget.** One glance can show current class, next room, time remaining, and today's changes. This serves the app's core goal more directly than many new preferences. Keep agenda and grid available, and avoid another divergent timetable model.

94. **P3, experiment. Use day paging for a mobile grid.** Keep meaningful card widths and swipe between days, with a tiny week overview for context. Compare it to the current fitted weekly grid using real course names. This is a third presentation choice, so it must justify its maintenance cost and preserve easy weekly planning.

95. **P3, experiment. Fit each week automatically.** An Auto grid can fit hours and occupied days per week while preserving a fixed preferred mode. It reduces warnings and dead space. Test continuity when weeks have very different ranges so navigation does not make every lesson jump unpredictably.

96. **P3, experiment. Give cancelled classes a separate grid treatment.** They currently participate in overlap columns and can narrow active lessons. Try a collapsed cancellation rail or ghost annotation with a direct detail action. Keep cancellation visible and accessible. Decide whether the semantic gain beats changing the familiar week shape.

97. **P3, experiment. Add a concise changes review.** A small view can show changed rooms, moved times, and cancellations since the student's chosen baseline, then acknowledge them. This could replace ambiguous persistent badges. It needs the lifetime decision in item 51 first, and should not become an inbox product.

98. **P3, experiment. Replace Notyf with a small React toast owner.** This would unify theme, accessibility, deduplication, and error presentation, and remove HTML-string escaping work. Keep the existing dependency unless a prototype shows a real reduction in code or better behavior. Reimplementing a library can also make the app larger and less reliable.

99. **P3, experiment. Compare a lightweight renderer only after profiling.** Preact, a minimal reactive renderer, or a much smaller imperative timetable could reduce JavaScript. The cost is replacing React assumptions, controls, tests, and lifecycle behavior. Prototype the primary flow and compare cached launch under throttling. My default recommendation is to keep React and fix ownership first.

100. **P3, experiment. Make runtime state inspectable and replayable in development.** A local diagnostics panel can show selected Monday, source mapping, batches, context changes, cache freshness, and emitted domain events using synthetic identities. A deterministic event replay can reproduce midnight and race bugs without a personal account. Keep it development-only, with no credentials or personal timetable logs.

## Components I would merge, split, or keep

| Area                                       | Decision                                                            | Why                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| App and presentation states                | Split composition from application decisions                        | App has too many state owners and parallel flags                       |
| WeekRepository                             | Keep the asynchronous owner, separate planning and pure transitions | The invariants are useful; interacting mutable state is hard to review |
| AgendaView and GridView                    | Keep separate                                                       | Shared data does not imply shared markup or layout                     |
| Day preparation and timeline rules         | Share derived facts                                                 | Repeated parsing and timeline work have no presentation benefit        |
| ClassDrawer and SettingsDialog             | Share panel lifecycle and styles                                    | Closing and common panel treatment are duplicated                      |
| Class and settings content                 | Keep separate                                                       | They answer different questions and need different structure           |
| Startup token form and settings token form | Share behavior, status copy, and input rules                        | Access verification should have one meaning                            |
| Button, IconButton, ActionItem             | Share common behavior, keep specialized components                  | A universal prop-heavy control would make this worse                   |
| Slider and RangeSlider                     | Share simple visual markup if worthwhile                            | Their pointer and keyboard behavior is different                       |
| Preference hooks                           | Consolidate persistence policy                                      | Repetition and synchronization belong to one small owner               |
| Session and roster configuration           | Give bootstrap a coordinated contract                               | They jointly define whether cached/live data is trusted                |
| Notification queue and delivery            | Keep shared                                                         | Cross-tab coordination and expiry are real obligations                 |
| Server adapters                            | Share policy, keep transport adaptation thin                        | Express and serverless plumbing differ, route behavior should not      |
| Themes                                     | Keep CSS palettes and registry                                      | The existing model is understandable and well tested                   |

## Architecture I would aim for

```text
OSIRIS
  -> strict source parser and normalizer
  -> access-aware API service and upstream cache
  -> thin Express or serverless adapter
  -> coordinated bootstrap and session owner
  -> dated week repository
       request planner + pure response transitions
       raw week content + freshness + change history
       bounded persistence
  -> derived schedule index
       days, instants, overlaps, timelines, next up
  -> application controller
       selected date, view, overlays, screen state
  -> agenda / grid / next up / drawer

Domain changes -> notification policy -> delivery queue
Saved preferences -> preference owner
Live clock -> only consumers that need time
```

This should fit in a few clear modules. It does not need a dependency injection framework, generic event bus, global store for every toggle, or a database. The diagram describes responsibilities, not a demand for one file or class per line.

## Order I would actually work in

1. Fix 1, 2, 3, 4, 8, and 11 with narrowly targeted regressions. Resolve the equality contract in 5 and the underlay accessibility in 57.
2. Decide Home semantics, cache identity trust, missing field representation, cancellation evidence, and change lifetime before rebuilding their owners.
3. Coordinate bootstrap and access. Reuse the token validation batch. Replace the screen boolean matrix and mirrored overlay lifecycle.
4. Refactor repository planning and transitions while preserving existing freshness, movement, and epoch guarantees.
5. Introduce derived class/day data and separate preferences from clocks. Profile before and after.
6. Simplify grid DOM, sizing, panel styling, and control behavior. Verify real names, zoom, gestures, and accessibility.
7. Reorganize tests, add deployment parity and CI, and delete generality that no longer has a use.
8. Prototype one bigger product bet. I would try offline launch or calendar export before a renderer rewrite.

## Changes I would reject without stronger evidence

- Combining agenda and grid into one conditional renderer.
- Adding Redux, a database, microservices, or a query library merely because the current repository is complex.
- Deleting validation, session generations, class movement freshness, or notification coordination as defensive clutter.
- Rewriting the renderer before measuring cached launch and interaction cost.
- Moving everything into custom hooks while keeping the same tangled state model.
- Treating 100% test coverage as the objective.
- Removing animations, themes, or shortcuts solely to reduce lines.
- Expanding into grades, attendance, homework, or school chat without a separate scope argument.

## Final verification

The full Firefox and WebKit run finished with 150 passed, 6 skipped, and 4 failed in 4.7 minutes. The skipped cases deliberately restrict theme contrast and screenshot baselines to Chromium.

The failures were Firefox reminder delivery, and WebKit theme swatch interaction, desktop viewport sizing, and cross-tab credential replacement. Firefox reminder delivery passed an isolated rerun. That makes the first failure intermittent; it does not establish whether the cause is fixture ordering, notification-worker fallback timing, or application scheduling. The test mixes a constructor mock with a real service worker path and expects delivery within five seconds, while worker activation can wait ten seconds. Make that boundary deterministic and test the two delivery mechanisms separately, as part of items 76 and 79.

An isolated single-worker WebKit run passed desktop viewport sizing and cross-tab credential replacement, but the theme swatch test failed again at the same Thaw click while waiting for element stability. This is a repeatable compatibility-test failure. Its root cause is not established, and a passing rerun does not prove the other three failures harmless. Record and diagnose the intermittent cases instead of merely increasing timeouts.

The completed report was formatted with Prettier. Only this review document was added to the tracked source tree. Browser engine tests cannot replace a real iPhone, Android device, background suspension test, or an authenticated upstream contract check.
