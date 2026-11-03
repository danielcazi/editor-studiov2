# Ínsula Build: crie sites e landing pages com IA

## Overview

**Product:** Ínsula Build: crie sites e landing pages com IA
**URL:** https://insulabuild.com/
**Surface type:** e-commerce
**Audience:** Consumers and shoppers
**Brand character:** Product-focused shopping experience with a rich, diverse color palette and 3 typefaces.

### Design Principles

- Trust signals first — credibility reduces friction more than clever copy.
- Clear path to action — one primary CTA per view, never stacked.
- Speed over polish — perceived performance is part of the design system.

## Colors

| Token | Value | Role |
|-------|-------|------|
| color-12 | `#F8F7F6` | Background |
| color-13 | `#FFFFFF` | Background |
| color-11 | `#ECEBFA` | Surface |
| color-1 | `#1F1E1D` | Text Primary |
| color-2 | `#55534D` | Text Primary |
| color-4 | `#7C7A73` | Text Secondary |
| color-3 | `#5857B0` | Accent |
| color-5 | `#F07163` | Accent |
| color-6 | `#25D366` | Accent |
| color-8 | `#F2C94C` | Accent |
| color-9 | `#D6D5F2` | Border |
| color-10 | `#E6E3DA` | Border |
| color-7 | `#6FCF97` | Background Dark |

## Typography

**Font stack:** Inter, system-ui, Times

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 12px | Captions, metadata |
| text-sm | 14px | Labels, secondary text |
| text-base | 16px | Body text (default) |
| text-lg | 20px | Subheadings, emphasis |
| text-xl | 26px | Section headings |
| text-2xl | 30px | Section headings |
| text-3xl | 42px | Section headings |
| text-4xl | 56px | Section headings |

**Weight scale:** 400 · 500 · 600 · 700 · 800
**Line heights:** 61.6px · 50.4px · 31.2px · 21px · 32px · 24px · 19.5px · 18px · 25.6px · 16.8px · 22.5px · 25.5px · 45px

## Spacing

**Base unit:** 4px

`space-1: 6px` · `space-2: 118px` · `space-3: 750px` · `space-4: 1350px`

## Shapes

**Border radius:** `radius-sm: 2px` · `radius-md: 8px` · `radius-lg: 12px` · `radius-xl: 22px` · `radius-full: 50%` · `radius-6: 999px`

## Elevation

- **shadow-sm:** `rgba(0, 0, 0, 0.14) 0px 0px 0px 1px`
- **shadow-md:** `rgba(88, 87, 176, 0.35) 0px 10px 28px 0px`
- **shadow-lg:** `rgba(37, 211, 102, 0.45) 0px 10px 28px 0px, rgba(0, 0, 0, 0.18) 0px 4px 12px 0px`
- **shadow-xl:** `rgba(31, 30, 29, 0.25) 0px 30px 70px -40px`
- **shadow-5:** `rgba(31, 30, 29, 0.28) 0px 40px 80px -30px, rgba(31, 30, 29, 0.06) 0px 8px 24px 0px`

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-fast:** `transform 0.15s`

## Components

- **Buttons:** 11 detected
- **Links:** 26 detected
- **Navigation:** 2 elements
- **Lists:** 1 detected
- **Images:** 68 detected

## Do's and Don'ts

### Do

- Reference tokens by name, not raw values — agents and developers should use `color.text.primary`, not `#171717`.
- Define all interactive states: default, hover, focus-visible, active, disabled.
- Use the spacing scale for all padding, margin, and gap values.
- Write content in sentence case. Reserve ALL CAPS for acronyms only.
- Test every component at the smallest and largest breakpoint before shipping.

### Don't

- Do not introduce colors outside the extracted palette.
- Do not use arbitrary spacing values — stick to the scale.
- Do not mix border-radius values. Pin to the detected set (2px, 8px, 12px, 22px, 50%, 999px).
- Do not stack more than one primary CTA per viewport.
- Do not use red for non-error UI — reserve it for destructive actions and warnings.
- Do not ship components without defining hover, focus-visible, and disabled states.

## Writing Tone

Persuasive, benefit-driven, trustworthy. Active voice, urgency without pressure.

## Authoring Workflow

When creating or updating a component guideline for this system, follow this sequence:

1. **State the intent** — one sentence on what the component does and why it exists.
2. **Map tokens** — list every color, spacing, typography, and radius token the component uses. No raw values.
3. **Define anatomy** — break the component into named parts (container, label, icon, etc.) with their token assignments.
4. **Specify states** — document every state: default, hover, focus-visible, active, disabled, loading, error, empty.
5. **Describe interactions** — keyboard, pointer, and touch behavior, including edge cases (long content, overflow, truncation).
6. **Add accessibility criteria** — write testable pass/fail checks (e.g. "focus ring must be visible at 3:1 contrast").
7. **List anti-patterns** — concrete examples of misuse with a brief explanation of why each is wrong.
8. **Close with a QA checklist** — a mechanical list of verifiable items (see Definition of Done below).

## Required Output Structure

Every component guideline produced from this system must contain these sections, in order:

1. Overview — purpose, when to use, when not to use.
2. Tokens and foundations — all referenced tokens from the tables above.
3. Anatomy and variants — named parts, variant matrix, responsive behavior.
4. States and interactions — full state table, keyboard/pointer/touch behavior.
5. Accessibility — ARIA attributes, contrast requirements, focus management, screen reader behavior.
6. Content guidelines — copy length, tone, capitalisation, placeholder text rules.
7. Anti-patterns — explicit examples of what not to build, with reasoning.

## Component Requirements

Every component built against this system must:

- Reference only tokens defined in the tables above — no hardcoded hex, px, or font values.
- Define all interactive states: default, hover, focus-visible, active, disabled, loading, error.
- Specify responsive behavior at the smallest and largest supported breakpoint.
- Handle edge cases: empty state, overflow / truncation, maximum content length.
- Include keyboard navigation (Tab, Enter, Escape, Arrow keys where applicable).
- Document ARIA roles, labels, and live-region behavior where relevant.
- Include known page component density: - **Buttons:** 11 detected
- **Links:** 26 detected
- **Navigation:** 2 elements
- **Lists:** 1 detected
- **Images:** 68 detected

## Definition of Done

A component is not complete until every item below is checked:

- Renders correctly in its default state (smoke test).
- All states documented and visually verified (hover, focus, disabled, loading, error, empty).
- All visual values use design tokens — zero hardcoded values.
- Keyboard navigation works without a pointer.
- No critical accessibility violations (contrast, ARIA, focus order).
- Tested at smallest and largest breakpoint.
- Anti-patterns section lists at least one concrete misuse example.
- Documentation covers purpose, usage, props/API, and limitations.
