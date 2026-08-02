# Kasira Design System

## Direction

**Register:** Product UI  
**Platform:** Responsive web  
**Mood:** ruang kerja kasir yang terang dan tenang di pagi hari—putih bersih, abu-abu lembut, biru sistem yang jernih, dan detail yang terasa presisi tanpa terlihat dingin.

Kasira memakai strategi **restrained light product UI** yang terinspirasi prinsip Apple: konten dan task menjadi pusat perhatian, chrome visual menghilang ke latar, border sangat tipis, dan shadow hanya dipakai untuk memisahkan layer. Visual harus terasa profesional, tenang, responsif, dan dapat dipercaya saat outlet ramai—bukan dekoratif atau seperti dashboard enterprise lama.

## Color

Gunakan OKLCH untuk semua token warna. Putih dan neutral cool-gray menjadi arsitektur utama; biru sistem dipakai untuk aksi utama, focus, dan selection. Warna semantic tetap jelas tetapi tidak memenuhi permukaan.

```css
:root {
  /* Architecture */
  --ks-bg: oklch(0.985 0.002 260);
  --ks-surface-1: oklch(1 0 0);
  --ks-surface-2: oklch(0.965 0.004 260);
  --ks-surface-3: oklch(0.935 0.006 260);
  --ks-border: oklch(0.895 0.008 260);
  --ks-border-strong: oklch(0.80 0.012 260);

  /* Brand */
  --ks-primary: oklch(0.57 0.19 255);
  --ks-primary-hover: oklch(0.51 0.20 255);
  --ks-primary-active: oklch(0.45 0.18 255);
  --ks-primary-soft: oklch(0.94 0.035 255);
  --ks-accent: oklch(0.68 0.16 78);
  --ks-accent-soft: oklch(0.95 0.045 78);

  /* Type */
  --ks-ink: oklch(0.22 0.012 260);
  --ks-ink-subtle: oklch(0.38 0.012 260);
  --ks-muted: oklch(0.52 0.012 260);
  --ks-faint: oklch(0.64 0.012 260);

  /* Semantic */
  --ks-success: oklch(0.72 0.14 155);
  --ks-success-soft: oklch(0.22 0.065 155);
  --ks-warning: oklch(0.80 0.145 82);
  --ks-warning-soft: oklch(0.25 0.075 82);
  --ks-danger: oklch(0.68 0.17 25);
  --ks-danger-soft: oklch(0.25 0.08 25);
  --ks-info: oklch(0.70 0.11 235);
  --ks-info-soft: oklch(0.23 0.06 235);

  /* Focus and overlays */
  --ks-focus: oklch(0.78 0.145 78);
  --ks-scrim: oklch(0.04 0 0 / 0.72);

  /* Shape */
  --ks-radius-sm: 6px;
  --ks-radius-md: 10px;
  --ks-radius-lg: 14px;
  --ks-radius-pill: 999px;

  /* Spacing: 4px base */
  --ks-space-1: 4px;
  --ks-space-2: 8px;
  --ks-space-3: 12px;
  --ks-space-4: 16px;
  --ks-space-5: 20px;
  --ks-space-6: 24px;
  --ks-space-8: 32px;
  --ks-space-10: 40px;
  --ks-space-12: 48px;

  /* Layer scale */
  --ks-z-dropdown: 100;
  --ks-z-sticky: 200;
  --ks-z-backdrop: 300;
  --ks-z-modal: 400;
  --ks-z-toast: 500;
  --ks-z-tooltip: 600;
}
```

### Usage rules

- `--ks-primary` is reserved for primary actions, active navigation, focus context, and selected controls—not decoration.
- `--ks-accent` is a deliberate attention signal for pending/needs-action states. Do not use it as a second generic CTA.
- Semantic colors must be paired with a text/icon label; never communicate status through color alone.
- Body text uses `--ks-ink` or `--ks-ink-subtle`. `--ks-muted` is for supporting text only and must be checked against the surface it sits on.
- Filled saturated controls use near-white text. Dark text is reserved for pale or neutral fills.
- Cards are not the default layout primitive. Use grouped panels when they clarify a task; avoid nested card stacks.

## Typography

Use one humanist sans family throughout the product. Recommended stack:

```css
font-family: "Atkinson Hyperlegible", "Inter", ui-sans-serif, system-ui, sans-serif;
```

Atkinson Hyperlegible is preferred where available because counters and letterforms remain clear in dense operational UI. Fallbacks must remain familiar sans-serif fonts.

```css
--ks-text-xs: 0.75rem;    /* 12px: metadata, timestamps */
--ks-text-sm: 0.875rem;   /* 14px: labels, secondary controls */
--ks-text-md: 1rem;       /* 16px: body and primary controls */
--ks-text-lg: 1.125rem;   /* 18px: section headings */
--ks-text-xl: 1.375rem;   /* 22px: page headings */
--ks-text-2xl: 1.75rem;   /* 28px: key workspace heading */
```

- Body line-height: 1.45–1.6.
- Labels and controls: 1.2–1.35.
- Use `font-variant-numeric: tabular-nums` for totals, timers, quantities, and reports.
- Headings use `text-wrap: balance`; prose uses `text-wrap: pretty`.
- Avoid all-caps labels as a default. Use sentence case and strong weight for scanability.

## Layout

### Shared shell

- Desktop: compact left navigation plus top context bar; workspace content uses a 12-column grid.
- Tablet: collapsible navigation, persistent top bar, touch-first controls.
- Mobile customer portal: no staff navigation; use a single-column flow with a sticky cart/order summary.
- Staff surfaces prioritize an always-visible context: outlet, shift, current time, connection state, and active role.

### Workspace patterns

- **Cashier:** order queue + detail workspace. Queue may be dense; detail panel must preserve table, payment, and next action hierarchy.
- **KDS:** station-first full-screen queue. Each ticket shows table, age, items, modifiers, and one clear next action.
- **Manager:** report views use tables and restrained visualizations; avoid dashboard tiles that hide the actual data.
- **Customer:** menu browsing is spacious and reassuring. Checkout should keep total, table, payment choice, and order status visible.

Use sticky positioning for context and primary action only when it prevents loss of place. Never put essential dropdowns inside clipped scrolling containers.

## Components

Every interactive component needs default, hover, focus-visible, active, disabled, loading, success, and error states where applicable.

### Buttons

- Primary: mineral teal fill, near-white text, 10px radius.
- Secondary: transparent or surface-2 fill with strong border.
- Tertiary: text action, reserved for low-risk contextual actions.
- Destructive: danger semantic fill or text with confirmation for irreversible actions.
- Minimum touch target: 44px; staff tablet critical actions: 48px.

### Status

Use a status dot/icon + text label + optional timestamp. Examples: `Menunggu pembayaran`, `Menunggu konfirmasi`, `Sedang disiapkan`, `Siap diantar`, `Selesai`, `Ditolak`.

### Order ticket

Tickets are task surfaces, not decorative cards. Show table first, then order age, payment state, items, and next action. Use semantic background tint sparingly for urgent/pending state. Avoid a colored side stripe.

### Tables and lists

Use clear row separation and stable column alignment. Allow density changes for staff. Empty states explain the next step, e.g. “Belum ada order baru. Pesanan dari QR meja akan muncul di sini.”

### Forms and dialogs

Prefer inline progressive disclosure. Use dialogs only for confirmation, payment exception, refund, or a focused destructive action. Always provide a clear escape/cancel path and preserve entered data after validation errors.

### Realtime feedback

- New order: subtle row/ticket highlight plus accessible live-region announcement.
- Status transition: brief background transition and updated label; no bounce or celebratory animation.
- Connection issue: persistent compact indicator with plain-language explanation and manual refresh.
- Loading: skeletons for content regions; inline progress for actions that are actively submitting.

## Motion

Motion is minimal and state-driven. Standard transitions: 150–220ms, ease-out. Use opacity and transform rather than layout animation. New order emphasis must settle quickly and never block interaction. Respect `prefers-reduced-motion: reduce` by removing transforms and reducing transitions to instant or crossfade.

## Accessibility

- Target WCAG formal compliance.
- Test contrast on every surface pair, including muted text, disabled controls, semantic fills, and focus rings.
- Never encode meaning using color alone; pair with text, icon, shape, or position.
- Keyboard order follows visual task order. Focus must remain visible against dark surfaces.
- Use semantic headings, landmarks, labels, live regions for realtime updates, and meaningful button names.
- Customer portal must remain usable at 200% zoom and on narrow mobile viewports.

## Anti-patterns

- No gradient text, decorative glass panels, saturated background everywhere, or neon cyberpunk styling.
- No identical metric-card grids as the default dashboard.
- No tiny uppercase eyebrow above every section.
- No modal-first flows for routine tasks.
- No hidden critical status, payment, or table context.
