# Pact / design system

## Direction and source

Warm editorial clarity: financial infrastructure meets a shared human record. No gradients,
glow, glass, AI sparkle/robot imagery, oversized rounded cards, or default dashboard sidebar.
Figma: https://www.figma.com/design/Dj8BmtS686mqCGeCCQVDwc
The editable board explores Joining, Shared boundary, and Paired brackets logo routes.
Joining is selected: two upright commitments connected by a common bridge, reproducible at
24/32/64px and as a monochrome mark. The exact vector is implemented in logo.tsx and icon.svg.

## Colors

| Token   | Light   | Dark mapping |
| ------- | ------- | ------------ |
| bg      | #F7F5EF | #14221D      |
| surface | #FFFFFF | #1D302A      |
| ink     | #1D302A | #F7F5EF      |
| brand   | #215C49 | #E3EDE6      |
| muted   | #55665D | #DADFD7      |
| line    | #DADFD7 | #40554A      |
| subtle  | #E3EDE6 | #40554A      |
| accent  | #9B4B2F | #F7F5EF      |
| success | #215C49 | #E3EDE6      |
| warning | #805C16 | #F7F5EF      |
| error   | #AC342D | #F7F5EF      |
| info    | #345C6B | #DADFD7      |

Figma primitives alias semantic variables with CSS code syntax. Starter allows one mode per
collection, so Light and Dark are separate collections. The coded app currently ships the
light theme only; dark mappings are a foundation, not a complete dark-mode implementation.
Status color always accompanies text. Copper is used sparingly and for visible focus rings.

## Typography

Locally packaged fonts remove build-time remote font dependencies.

- Source Serif 4 Variable: display 45–74px / 1.1 / -0.042em; page heading 38–46px / 1.12;
  section heading 29–43px / 1.12 / -0.035em. Regular 400 with occasional italic emphasis.
- Manrope Variable: body 14–16px / 1.7–1.8; interface 11–14px / 1.5–1.7;
  semibold 600–650 for actions, labels, and table titles. Eyebrows 9–11px / 1.8 / 0.12em.
- IBM Plex Mono: 9–12px metadata, 19–24px amounts; weight 400, no fake financial precision.

Font families match Figma's source family names; CSS fontsource names add “Variable”.

## Geometry

4px baseline; spacing 4, 8, 12, 16, 24, 32, 48, 64. Desktop max-width 1280px,
48px side gutters; tablet 20–32px; mobile 20px. Major section gaps 56–92px.
Controls radius 6px, badge 4px, document panels square, avatars circular. Borders 1px.
Shadows only on the small hero document: 0 4px 12px with ~2% ink opacity.
Icons use Lucide, 16–24px, restrained stroke. No decorative motion.

## Components and states

- Buttons: forest/white primary, neutral outlined secondary, inline text link, explicit disabled
  unavailable workflows. 42–48px primary targets; visible focus; hover darkens forest.
- Inputs: visible labels, native semantics, 6px radius, neutral border, help/error text.
  Required fields, browser validation, then strict domain validation. No placeholder-only labels.
- Cards: use only for a coherent document, next action, or contextual record. Prefer whitespace
  and dividers for lists. Do not put every paragraph in a card.
- Tables: desktop agreement columns; semantic article rows with labeled values, transformed
  into readable stacked rows on mobile. Entire purpose is choosing the next action.
- Status indicators: text + color + marker; review, in progress, needs resolution, completed.
- Navigation: top-level workspace tabs and contextual Pact sections. Current item is explicit.
- Timeline: chronological markers, event, actor/context and timestamp. Samples are labeled.
- Evidence: type icon, occurrence date, title, linked commitment and why it matters.
- Resolution: balanced buyer/seller positions, clear authorization boundary, disabled financial CTA.
- Assessment: explicit empty state; later confidence, citations, contradictory/missing evidence.
- Empty state: plain reason, helpful next step; search can clear filters.
- Loading: textual status, no fabricated progress. Error: safe explanation and retry button.
- Dialogs: none in Phase 1. Future dialogs need focus trap, initial focus, Escape, and focus return.

## Responsive and accessibility

Landing stacks at 800px, workspace changes table rows into stacked agreement summaries.
Detail timeline moves below content; form guidance moves above fields; mobile navigation stays compact.
Semantic landmarks, one h1, skip link, labels, keyboard actions, 3px focus, screen-reader status,
WCAG AA automated checks, and reduced-motion support are baseline. Review at 390, 768, 1440px.

Figma has editable desktop/mobile landing layouts, desktop workspace, Pact detail, create-Pact layout, and bound shared controls,
semantic colors and shared type styles. Implementation follows this visual system while adding
responsive content density and accessible browser behavior. Browser screenshots and test
results are the implementation QA evidence, not proof of a full production release.

## Updated logo

The user-supplied green ribbon P replaces the joining mark. The original supplied raster is preserved as pact-ribbon.png; compact placements use a CSS viewport around the mark alongside the Pact wordmark. The favicon uses the same artwork. This user-approved asset supersedes the older Figma logo exploration.
