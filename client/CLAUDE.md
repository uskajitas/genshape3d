# GenShape3D client — UI consistency rules (read before adding any UI)

This app has a deliberate visual language. **Do not drop raw HTML controls into
the page.** A stray `<input type="checkbox">`, `<select>`, or unstyled `<button>`
looks broken next to everything else and the user will reject it.

## The left icon rail is ONE component

`components/AppRail.tsx` is the only left rail. Every workspace page renders
`<AppRail active=… />` — never a hand-rolled copy. The pipeline order and
labels are fixed there: Image (text-to-image) → 3D Model → Texture → Scene →
Rig → Assets → admin group. Duplicated rails are how "Image" once meant
text-to-image on one page and image-to-3D on another.

## Use the existing components / styled primitives

Before adding a control, reuse what's already here:

| Need | Use | Where |
|---|---|---|
| Checkbox / tick | the page's styled checkbox (e.g. `ComboCheck` in benchmark/NewRun.tsx) — a styled `input` with `accent-color: theme.violet`. Never a bare `<input type="checkbox">`. | per-page styled component |
| Dropdown / select | `<Dropdown>` | `components/Dropdown.tsx` |
| Toggle chip / segmented option | `FilterChip` / `Chip` pattern (styled `button` with `$active`) | benchmark pages |
| Modal / dialog | `ConfirmModal`, `AdvancedParamsModal` | `components/` |
| Tooltip | `<Tooltip>` | `components/Tooltip.tsx` |
| Buttons | the local styled `Btn` / gradient primary — match the page | per-page |

## Rules

1. **No raw `<input>`, `<select>`, or unstyled `<button>` in rendered UI.** Wrap
   in a styled-component that reads from `theme.colors`.
2. **Colours come from the theme** (`p => p.theme.colors.*`) — no hardcoded hex
   in JSX `style={{}}` for anything themeable.
3. **Match the nearest sibling.** A new control in a row should reuse that row's
   existing styled primitives (see how the benchmark texture toggle reuses
   `ComboCheck`), not invent its own look.
4. **Disabled/active states** use opacity + `not-allowed` cursor + muted theme
   colour, consistent with existing controls — not a different greyscale.

If a suitable styled primitive doesn't exist, add one (theme-driven) and reuse
it — don't inline a one-off raw control.
