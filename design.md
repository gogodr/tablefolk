# Design: Tablefolk

The shared visual system for Tablefolk. `apps/web/src/app/tokens.css` is the source of truth.

## System

- Genre: playful, composed for adult board game groups
- Shape: image-led home page with a tangible tabletop scene; practical collection and group screens
- Theme: Hum, adapted to Tablefolk
- Identity: three meeples around a table, paper and wood textures, cream ground, navy ink, pear yellow actions, coral and mint accents

## Tokens

The palette, type scale, spacing, motion, elevation, and radius values live in `apps/web/src/app/tokens.css`. The principal roles are:

```css
:root {
  --color-paper: oklch(97% 0.012 95);
  --color-ink: oklch(20% 0.014 255);
  --color-accent: oklch(87% 0.175 96);
  --color-accent-2: oklch(50% 0.17 250);
  --color-focus: oklch(50% 0.17 250);
  --font-display: "Chillax", ui-rounded, ui-sans-serif, sans-serif;
  --font-body: var(--font-display);
  --radius-card: 24px;
  --radius-pill: 999px;
}
```

## Controls

- Primary action: pear fill, navy text, rounded pill, at least 48px high.
- Secondary action: cream fill, navy outline, same size and shape.
- Keyboard focus: visible blue outline on every interactive control.

## Imagery

Use the generated raster meeple mark and tabletop photograph in `apps/web/public`. Do not introduce vector illustrations. Keep game covers supplied by BoardGameGeek.

## Motion

Calm and brief hover feedback. Respect reduced motion settings.

## Exports

`apps/web/src/app/tokens.css` and `apps/web/src/app/base.css` are the portable system files.
