# Sell My Stuff design guide

This is the durable UI direction for Sell My Stuff. Read it before changing the
homepage, adding a new route, or introducing a reusable component.

## Product posture

Sell My Stuff is a personal delegation tool, not an inventory dashboard and not
a service trying to persuade someone to sign up. The interface should feel like
a capable assistant: calm, precise, available and mostly out of the way.

## Audience and tone — non-negotiable

This is a private, single-user tool for its adult owner. It is not a consumer
product addressing an unknown audience, and it does not need engagement copy,
onboarding language or emotional reassurance.

Assume the user understands the purpose of the application. Write like a mature
professional tool: terse, factual and operational. State what happened, what is
required and what will happen next. Stop there.

Do not use:

- encouragement, praise or congratulations;
- reassurance such as “Ready when you are” or “I’ll take it from here”;
- conversational questions such as “Got something else to sell?”;
- coaching, motivational language or productivity slogans;
- cute, playful or celebratory success messages;
- explanations of obvious controls;
- a friendly assistant persona speaking in the first person unless identifying
  responsibility is genuinely necessary.

Instructional copy is justified only when it prevents an error, explains a
material consequence or asks for information the system cannot obtain itself.
Familiar workflows should become quieter over time, not repeatedly teach the
user how the product works.

The core promise is:

> Show me what matters today, let me add an item quickly, and handle the rest.

Apple is a reference for hierarchy, restraint, direct manipulation and humane
defaults. Do not imitate Apple marketing pages, add decorative glass effects or
copy platform chrome literally.

## Design principles

### 1. Start with the working surface

The first viewport should answer three questions in this order:

1. What is the current state?
2. Is anything waiting for me?
3. What is the system doing for me?

Do not put a marketing hero, feature explanation or oversized illustration
before useful controls and state.

### 2. Treat the user like a capable adult

Use short, factual labels. Prefer “Needs your attention” to “Tiny actions, big
progress”, and “Add photos” to an extended explanation of photography.

Explain only what prevents an error or clarifies a consequence. Avoid praise,
gamification, cheerleading, cute empty-state language and repeated reassurance.
This principle overrides generic UX advice to make software sound warmer or more
conversational.

### 3. Make autonomy legible

Human decisions and autonomous work are different categories:

- **Needs your attention** contains actions only the user can complete.
- **Working for you** contains research, drafting and marketplace operations.
- Completed work appears as an outcome or a quiet status, not a celebration.

Never style background activity as though it requires a click. Never hide a real
blocker behind a generic progress state.

### 4. Use progressive disclosure

The capture surface is compact when empty, expands when photos are selected and
collapses to a concise confirmation after submission. Item rows reveal detail on
selection rather than carrying every fact on the homepage.

Show the minimum information needed for the current decision. Preserve evidence,
confidence and provenance in detail views without forcing them into every row.

### 5. Prefer calm density

Whitespace establishes groups, but the interface should not feel sparse or
ceremonial. A screen may contain several useful sections when each has a clear
role. Use thin separators and alignment before adding more cards.

## Homepage composition

The current Today view is the reference composition:

1. Quiet global navigation.
2. Date and “Today” as the page identity.
3. Three concise outcome metrics.
4. One prominent capture focus.
5. Equal-weight attention and autonomous-work panels.
6. A subdued recent-activity line.

Keep this sequence unless user research demonstrates a better task order. New
homepage content must earn its place by supporting capture, a required decision,
or understanding current work.

## Visual language

### Colour

Use semantic tokens from `app/globals.css`; do not introduce raw component-level
brand colours without extending the token system.

- `background`: neutral near-white or near-black canvas.
- `card`: one lifted surface level.
- `primary`: system-like blue for the main action, focus and active work.
- `accent-strong`: the primary blue at a stronger emphasis level; do not add a
  separate purple brand accent.
- `warning`: amber for an unresolved user dependency.
- `success`: green for verified completion.
- `muted-foreground`: secondary information that must remain comfortably legible.

Colour must reinforce text or icons, never replace them. A status needs a readable
label even when it also has a colour.

### Typography

Inter is the single UI and display family, chosen as a stable cross-platform
counterpart to San Francisco. Use weight, size and spacing—not a second display
face—to create hierarchy.

- Page title: 44–72 px, semibold, tightly tracked.
- Section title: 17–24 px, semibold.
- Primary body: 14–16 px with a relaxed line height.
- Secondary metadata: 12–13 px; do not go below 11 px.
- Status labels: sentence case. Avoid all-caps and wide letter spacing.
- Numeric outcomes: tabular alignment when values change in place.

Use `font-display` only as a semantic hook; it intentionally resolves to Inter.
Apply the font variable at the document root so Tailwind utilities never fall
back to the browser's serif default.

### Spacing and layout

Use a 4 px base rhythm. Common gaps should be 8, 12, 16, 20, 24, 32 or 40 px.
The main content width is 1280 px with 16 px mobile, 28 px tablet and 40 px
desktop gutters.

Cards use 20–28 px radii. Controls that represent a single primary action may
use a full pill radius. Avoid applying pill shapes to every label or status.

Use one-pixel borders for grouping. Shadows should be rare, soft and functional;
prefer surface contrast and borders. The capture focus is a neutral lifted
surface; reserve blue for its primary action rather than tinting the whole card.

### Icons

Use Lucide through `lucide-react`. Keep stroke weight and optical size consistent.
Icons support labels; they do not replace unfamiliar actions. Decorative icons
must be hidden from assistive technology.

## Components and interaction

### Primary actions

There should normally be one visually dominant action per region. On the Today
page that is “Add photos”. Use a blue filled control with a minimum 44 px touch
height. Secondary actions use neutral, outline or text treatments.

Button labels begin with a verb and describe the immediate result: “Add photos”,
“Review proposal”, “Start investigating”. Avoid vague labels such as “Continue”.

### Item and action rows

Rows use an icon, a strong primary line, one secondary line and an optional state
or progress indicator. Keep the entire row target at least 44 px high. Truncation
is acceptable on the homepage when the destination reveals the full content.

### Progress

Use progress bars only for work with a meaningful, explainable measure. Do not
invent percentages to make indefinite research feel active. When progress is not
quantifiable, use a named stage and recent timestamp instead.

### Motion

Motion communicates state change, spatial relationship or completion. Prefer
150–220 ms transitions with standard easing. Avoid ambient animation and pulsing
primary controls. Respect `prefers-reduced-motion` and keep every task usable
without animation.

### External actions

Publishing, purchasing, accepting an offer or any other consequential action
must present the exact proposal before approval. Make the distinction between
prepared, approved, executing and verified states visible and unambiguous.

## Responsive behaviour

Design mobile-first around an iPhone-sized viewport, then expand rather than
rearranging the product into a different mental model.

- Maintain 44 px minimum touch targets.
- Stack the Today heading and metrics when horizontal space is limited.
- Make the capture action full-width on mobile.
- Stack attention above autonomous work.
- Keep primary actions visible without requiring precision tapping.
- Avoid horizontal scrolling for core content.
- Do not hide essential state solely to preserve the desktop composition.

## Accessibility

- Use semantic headings in document order and preserve one descriptive `h1`.
- Give icon-only controls an accessible name.
- Maintain visible keyboard focus on every interactive element.
- Provide a button/input alternative for drag, drop and clipboard interactions.
- Announce errors through an appropriate live or alert region.
- Do not encode status by colour alone.
- Check light and dark contrast, text scaling and reduced-motion behaviour.
- Keep control labels and status language stable for assistive technology.

## Data honesty

The current homepage metrics and queue rows are illustrative. Do not add more
sample dashboard content to make a layout appear full. When live data replaces
the samples, show truthful empty, loading, stale, failed and partially complete
states. Unknown is a valid state and should never be presented as confirmed.

## Writing style

Use British English and direct sentence case. Default to labels and factual
status statements rather than dialogue. If a phrase can be removed without
losing meaning or safety, remove it.

Prefer:

- “Researching recent sales”
- “One label photo needed”
- “Proposal ready to review”
- “Last updated 8 minutes ago”
- “3 photos queued”
- “Identification started”

Avoid:

- “Tiny actions, big progress”
- “Let’s turn your clutter into cash!”
- “Awesome! We’re working our magic.”
- “Ready when you are”
- “I’ll take it from here”
- “Got something else to sell?”
- Explanations that repeat what the control already says

## Review checklist

Before merging UI work, confirm:

- The first viewport exposes useful state and the primary action.
- The user can distinguish required actions from autonomous work instantly.
- Copy is factual, concise and adult.
- New colours use semantic tokens and work in light and dark modes.
- Touch targets, focus states, contrast and reduced motion are accounted for.
- Loading, empty, error and success states remain truthful.
- Existing capture, approval and evidence behaviours are preserved.
- The result works at mobile and desktop widths.
- Tests, typecheck, lint and production build pass.
