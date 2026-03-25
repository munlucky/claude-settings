---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use for React/web UI implementation and redesign work where visual direction matters.
license: Apache 2.0. Adapted from pbakaus/impeccable.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
---

# Frontend Design

Use this skill when implementing or redesigning user-facing web UI.

## Context Protocol

Do not start visual design work without design context.

Check in this order:
1. Loaded instructions for a `## Design Context` section
2. `.impeccable.md` at the project root
3. If neither exists, run `teach-impeccable` first or ask the user for the missing context

Minimum required context:
- target audience
- primary use cases or jobs to be done
- desired tone or brand personality

Do not infer these only from code. Existing code shows implementation history, not design intent.

## When To Apply

Apply for:
- React or web frontend implementation
- landing pages, dashboards, settings pages, flows, posters, or visual artifacts
- redesign requests where polish, distinctiveness, or product feel matters

Do not use this skill as a substitute for repo-specific design systems. If the repository already has tokens, primitives, or brand rules, follow them first and use this skill to improve execution quality.

## Working Principles

Commit to a clear visual direction before editing code:
- define the purpose of the surface
- choose an intentional tone, not a default template
- identify one memorable differentiator

Then implement working code that is:
- production-grade and functional
- visually coherent
- responsive on desktop and mobile
- accessible and maintainable

## Design Rules

### Typography

- Prefer distinctive, intentional type pairings over default stacks.
- Use fluid sizing with `clamp()` when appropriate.
- Build a clear hierarchy with weight, size, spacing, and rhythm.
- Avoid overused defaults such as Inter, Roboto, Arial, and system stacks unless the repo already standardizes on them.

### Color

- Use a deliberate palette with clear hierarchy.
- Prefer CSS variables and modern color functions when the stack allows it.
- Tint neutrals toward the brand hue rather than relying on flat grayscale.
- Avoid the generic AI palette: purple-to-blue gradients, cyan on dark, neon accents, or gray text on colored backgrounds.

### Layout

- Create rhythm with varied spacing, not repeated identical blocks.
- Use asymmetry intentionally where it improves hierarchy.
- Prefer strong sections and spacing systems over wrapping everything in cards.
- Avoid nested cards, templated hero metrics, or repetitive icon-card grids.

### Motion

- Use a small number of meaningful transitions and reveals.
- Prefer transform and opacity animations.
- Respect `prefers-reduced-motion`.
- Avoid bounce or elastic easing unless the product explicitly calls for it.

### Interaction

- Make primary actions obvious within seconds.
- Use progressive disclosure for advanced detail.
- Design empty, loading, error, and success states intentionally.
- Keep keyboard focus visible and touch targets usable.

### Responsive Behavior

- Design for mobile and desktop as different contexts, not just smaller and larger boxes.
- Prefer fluid spacing and container-aware layouts where available.
- Do not hide critical functionality on mobile without a replacement interaction.

### UX Writing

- Make every word earn its place.
- Avoid repeating information users can already see.
- Keep labels direct and specific.

## Anti-Patterns

Treat these as warning signs:
- obvious AI-looking gradients and glow-heavy dark mode
- gray text on colored surfaces
- glassmorphism used decoratively
- nested cards and repeated safe component grids
- decorative charts or metrics with no real meaning
- generic rounded rectangles with default shadows everywhere

## Coordination

- Use this skill before or during implementation when visual direction is part of the task.
- Use `vercel-react-best-practices` later for React/Next.js runtime and performance refinement.
- Use `audit`, `normalize`, and `polish` as focused follow-up skills when needed.
