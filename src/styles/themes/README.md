# Themes

All palette colors are complete HSL colors. Use `var(--accent)` for an opaque color and `hsl(from var(--accent) h s l / 0.12)` for a tint. There are no duplicate RGB channel variables. Relative HSL also lets a derived shade follow its source hue, saturation, or lightness without splitting every color into three variables.

## Add a theme

1. Add `<id>.css` here. Apply its variables to both `html[data-theme="<id>"]` and `.theme-picker__swatch[data-theme="<id>"]`.
2. Import it in `index.css`, after `tokens.css`.
3. Add its ID, label, icon, and motion to `registry.ts`. Keep paired light/dark themes in matching positions.

The app imports this directory once. Settings needs no theme-specific changes. Reuse a motion from the registry, or add a named motion to `ThemePicker.css` if the icon needs something new.

## Palette and defaults

`tokens.css` registers the colors that animate and defines shared derivations. Registrations contain no palette values. `dark.css` is a normal palette and also applies before a theme has been selected.

Author these base colors and treatments:

- `--page-canvas` and `--page-background` for the browser chrome and page backdrop.
- `--text-strong`, `--text-dim`, `--text-muted`, and `--line` for readable text and dividers.
- `--accent`, `--warning`, `--danger`, and `--danger-bright` for interactive and status colors.
- `--surface`, `--backdrop`, `--class-surface`, `--class-surface-cancelled`, and `--shadow` for panels, overlays, classes, and elevation.

The remaining colors have defaults. Override only where the palette needs it:

| Token                                  | Default                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `--highlight`                          | Strong text color                                                            |
| `--line-strong`                        | Line color at twice its opacity                                              |
| `--class-border`                       | Accent at 20% opacity                                                        |
| `--class-border-raised`                | Class border at twice its opacity                                            |
| `--backdrop-strong`                    | Backdrop with 6 percentage points more opacity                               |
| `--overlay-surface`                    | Surface with 2 percentage points more HSL lightness, at 97% opacity          |
| `--class-surface-raised`               | Class surface with 4.3 percentage points more lightness, at 98% opacity      |
| `--frame-veil`                         | 82% opacity                                                                  |
| `--chrome-*`                           | Corresponding content colors; chrome surface uses the surface at 92% opacity |
| `--swatch-background`, `--swatch-icon` | Page canvas and accent                                                       |

These defaults suit a cohesive dark palette. Light palettes and themes with contrasting chrome override the relevant colors. Preserve deliberate differences between page, panels, and cards instead of forcing every shade into one hue family. When only opacity differs, reference the original color rather than writing a second HSL literal.

Swatches apply their own palette and recompute the shared defaults locally, so they remain independent of the active theme. Swatch overrides belong in the palette file. The swatch outline intentionally inherits the active theme from its surrounding tile.

Keep palette-specific layout treatments in the palette file, such as the Osiris header banner. Picker layout, interaction, and keyframes belong in `ThemePicker.css`. Persistence, system preference detection, and theme transitions are applied by `src/lib/theme.ts`.

## Verify

Run `bun run build`, `bun run lint`, and `bunx playwright test --project=chromium -g 'theme|status rows|chrome palette'`. The browser tests check text contrast across all themes, picker independence, palette switching, and status colors. Check the relevant theme tests in Firefox and WebKit when changing shared color expressions or registrations.

Review the grid, mobile agenda, settings picker, and overlays. Keep changed/cancelled states distinguishable and check both the floating and docked mobile toolbar for palettes with contrasting chrome.
