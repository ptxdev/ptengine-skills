# Designing a Custom App's UI

Product and interaction principles for any screen in a Custom App. **Read this before you
generate or change UI.** It decides *what* to build; the visual system (tokens, components,
variants) lives in `@ptengine/design-components`' `llms.txt` and is not repeated here — when
the two seem to overlap, `llms.txt` wins on visual values, this file wins on behaviour.

## 0. Before writing any UI

1. **Read this file** — the philosophy (§1) decides the shape of the screen.
2. **Find the component.** What you need almost certainly exists in
   `@ptengine/design-components` (list in its `llms.txt`). Found it → use its existing
   variants and props. Do not hand-build a look-alike from `div`s, and do not restyle a
   component's internals through `className` to fake a private variant (`className` is for
   layout only).
3. **No variant fits** → say so ("`Badge` has no variant for X"), pick the closest existing
   one, and keep going. Never invent a one-off component inside the app.
4. **Look up the token.** Colours, type sizes, radii and spacing come from `llms.txt` /
   the Tailwind preset's semantic classes — never from memory or taste.

### When the request conflicts with these principles

A request (or a reference screenshot) may ask for something this file rules out — a
gradient button, five equal primary actions, a full-screen spinner.

1. **Say so plainly**, naming the principle ("a gradient button breaks §6.1").
2. **Offer the compliant alternative** and why it still achieves what they want.
3. **The user decides.** If they insist, do it their way and record the exception so it is
   not argued again (in the online builder: under `## 约束与禁忌` in `NOTES.md`).

Never silently comply, and never invent a "compromise" pattern that is neither what was asked
nor what this file describes. Where this file is silent, say "not covered; I chose X because Y".

## 1. Philosophy

Custom Apps live inside Ptengine, used by **marketers and analysts** (mainly Japan and
China). The character is **professional, calm, information-dense, low visual noise**. People
come to get work done — read data, run experiments, decide. It is a workbench, not a landing
page.

1. **Value over feature** — help the user finish a task; don't just display capability.
2. **Clarity over complexity** — lower the cost of understanding complex data; don't hide it.
3. **Decision over information** — the value is faster understanding and action, not more numbers.
4. **Consistency over freedom** — when an existing pattern solves it, reuse it.

**Tie-break order: clarity > efficiency > consistency > aesthetics.** Prettier but harder
to read loses to clarity; breaking consistency for local efficiency needs a reason why the
consistent solution fails. Aesthetics is last because it means *craft that respects the
user's time and attention*, not decoration.

**Self-check after every block of UI:** "If I removed this element, would the message get
worse?" If not, remove it.

## 2. Users and cognition

1. **Clear hierarchy** — every screen has primary, secondary and supporting information.
2. **Progressive disclosure** — reveal complexity layer by layer, but every layer keeps a
   visible path to the next. Disclosure is not hiding.
3. **State, reason, next step** — at any moment the user can answer "what is the state,
   why, and what can I do next?"
4. **One dominant action** — a screen has one clearly primary action; never more than
   three actions of equal weight.
5. **Compact by default** — users want as much useful information per screen as possible.
   Use the compact spacing steps; build hierarchy with the type scale and the text-opacity
   tiers from `llms.txt`, not with coloured blocks, dividers or shadows.
6. **Exploring must be safe** — users learn by clicking around. Changes are previewable,
   undoable, or resettable to defaults. Anything where one wrong click causes an
   unrecoverable result is a defect.

## 3. Interaction

1. **Affordance matches function** — interactive elements give clear feedback; non-interactive
   ones never look clickable.
2. **Action priority**: primary / secondary / tertiary / destructive — use the matching
   `Button` variants from `llms.txt`.
3. **Primary action at the end of the reading path** — in a horizontal group (dialog footer,
   panel bottom, toolbar) the most important action is rightmost; the rest go right-to-left
   by priority. Exceptions: in wizards "Back" is left and "Next" right; a destructive action
   never sits next to the primary one — put it at the far left or separate it.
4. **Destructive actions**
   - Irreversible (delete): confirm through `PtApp.ui.confirm` (never native `confirm()`),
     naming the object: "Delete report *Weekly KPI*?" — not "Are you sure?".
   - Reversible (remove from list, archive): no dialog; act, then show a toast with undo.
     Reversible things don't interrupt; irreversible ones add friction.

## 4. Data experience

1. **Overview → Filter → Drill down → Detail.** The first layer is overview only; filters
   narrow; each layer has a clear entry into the next.
2. **Key metrics are easier to find than supporting ones.**
3. **Explain non-obvious metrics**: definition, calculation, source, time range, last update
   (a tooltip or info icon is enough).
4. **Chart colour encodes data, nothing else.** Prefer the library's `Chart` component and its
   defaults; when you must pick colours, take them from tokens and keep one hue per series
   across the whole app — never decorative or random palettes.

## 5. Containers

- **Dialog** — short flows needing a decision now: confirmations, simple forms (≤ 6 fields),
  single-step settings. Dialogs interrupt everything; reserve them for "decide now".
- **Drawer / Sheet** — view or edit one object while keeping the list behind it in sight.
- **Separate view** (a hash route) — multi-step flows, creating complex objects, anything
  needing full attention.

## 6. Visual guard rails

AI-generated UI has a default "demo" aesthetic that is the opposite of this product. All of
these are **forbidden**:

1. **Any gradient except the brand gradient.** There is exactly one legal gradient — the
   Ptengine brand green, used **verbatim** (it is not in the component library's tokens, so
   define it once, e.g. `theme.extend.backgroundImage['brand-gradient']` in
   `web/tailwind.config.js`, and reuse it):

   ```css
   linear-gradient(90deg, #c8f050 0%, #25ac00 35%, #185613 50%, #25ac00 65%, #c8f050 100%)
   ```

   **Allowed**, at most once per screen: a single accent in a brand moment (onboarding,
   first-run), a celebration of a major completion, a progress fill (gradient direction =
   progress direction), and AI feature entry points (§8).
   **Still forbidden**: as the background or border of regular components (buttons, cards,
   inputs, tags), large areas (> 15% of the viewport), gradient text (`background-clip: text`),
   and any variant — changing stops, angle or colours. Every other gradient is a violation.
2. **Purple / blue-violet** as a dominant colour. Colour is scarce and functional (see
   `llms.txt`): brand, status semantics, chart data — nothing decorative. (The AI fuchsia
   token is only an AI-feature marker, never a theme colour.)
3. **Emoji as icons.** Use `lucide-react` (the component library already depends on it); don't
   mix icon libraries.
4. **Hero typography** — no 48px centred headlines; page titles use the type scale.
5. **Glassmorphism** — no `backdrop-blur`, no frosted panels.
6. **Decorative animation** — motion only for state feedback (loading, expand, transition),
   ≤ 300ms, no entrance shows.
7. **Big "cute" radii** — no `rounded-2xl`/`rounded-3xl`; use the radius tokens.
8. **Decorative illustrations** filling empty space (empty states: §7).
9. **Invented colours and magic numbers** — every colour from tokens; spacing on the 4px grid
   (no 5px / 7px / 15px).
10. **Shadows on flat cards** — cards have a 1px border, no shadow; shadows belong to overlays only.

## 7. System states

Cover **Loading / Empty / Error / Success** (and **No permission** when the app has scopes
the user may lack). Acceptance test for each: §2.3 — the user knows the state, why, and what
to do next.

- **Loading** — button loading state (blocks double submit) or a `Skeleton` for the region.
  No full-screen spinner overlay unless the whole view is genuinely locked.
- **Success** — a light toast (`PtApp.ui.toast`), gone in 2–3 s. Success is normal; don't
  interrupt.
- **Error** — say **what happened and what the user can do** (retry, check a setting,
  contact the admin). Never just "Something went wrong". Map known codes to plain words —
  e.g. `PT_CONSENT_REQUIRED` → "Waiting for your workspace admin to approve access".
- **Empty** — never just "No data". Say **why** it is empty (nothing created yet? filters
  exclude everything? data still being collected? — three different messages) and give
  **one next action** (create / clear filters / see setup). Use the library's `Empty`: a simple
  icon + one line + one button; no illustrations.
- **No permission** — tell the user which access is missing and who can grant it; don't
  render a broken or blank screen.

## 8. AI features inside an app

- **Preserve user control** — AI output can be reviewed, edited and rejected.
- **Expose uncertainty** — show uncertain conclusions as uncertain.
- **Reduce interaction cost** — AI removes steps; it doesn't add an interface to babysit.
- **No visual privilege** — AI features follow every rule above. The only exception: an AI
  feature's entry point (e.g. an "Ask AI" button) may use the brand gradient (§6.1). Beyond
  that, "it's AI" earns no glows or special colours (the AI semantic colour in `llms.txt` is
  the only other marker).

## 9. Copy and language

- **Follow `context.locale`** when the app serves more than one language; never mix
  languages on one screen, and pass translated labels to components with built-in text
  (see `llms.txt`, "组件内建文案的本地化").
- **Tone**: professional, direct, no cuteness ("Oops! Something broke~" is out).
- **Buttons are verbs** ("Create report"), not "OK" / "Confirm" — except in a pure
  confirmation dialog.
- **Write the outcome, not the implementation.** Describe what the user gets and whether
  anything else is needed; avoid implementation words ("built-in", "invoke", "bind",
  "execute", "configure", "deploy code"). Before writing, answer "what does the user get?
  do they need to do anything?" — those answers are the copy.
  ❌ "Tracking code is built in; no manual deployment required" →
  ✅ "Data collection ships with the page. Once it's live, data flows back to this Ptengine
  project automatically — nothing else to add."
  Exception: screens for technical audiences (API keys, developer settings), where
  implementation words are the domain words.
