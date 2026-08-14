# 🎨 Monero Farm Panel — Visual & UX Direction

This document is the persistent design reference for future contributors and AI coding assistants.

## Canonical visual references

The repository contains two project visuals:

- [`assets/hero.webp`](assets/hero.webp) — overall product / brand direction;
- [`assets/dashboard.webp`](assets/dashboard.webp) — dashboard hierarchy and presentation direction.

They are **presentation visuals based on v1.2.0**, not pixel-perfect runtime screenshots. Numeric values are illustrative. Do not implement UI behavior merely because an element appears in a promotional image; functionality must come from actual product requirements and code.

## Design principles

Future UI work should gradually move toward this visual language while keeping the existing panel fast and practical:

1. **Dark navy foundation** with strong contrast and restrained glow.
2. **Orange remains the mining/action accent**; blue/green/purple can distinguish information categories.
3. **Clear card hierarchy**: farm summary → server/component status → detailed operations.
4. **Compact icons + short labels** instead of decorative clutter.
5. **Dense but readable** layouts suitable for kiosk displays and desktop browsers.
6. **Safety is visible**: dangerous actions must show state, preflight information, confirmations and rollback behavior.
7. **No fake telemetry** in runtime. Marketing art may use illustrative numbers; app must display real data.
8. **Responsive first**: preserve usability on lower-resolution appliance/kiosk screens.

## Internationalization / i18n

A Russian / English runtime language switcher is a priority UX item.

Implementation direction:

- keep one component/page implementation, not duplicated RU and EN pages;
- centralize strings in translation dictionaries/modules;
- use stable translation keys;
- allow future languages without rewriting pages;
- persist selected language;
- default safely when a translation key is missing;
- keep technical terms such as XMRig, P2Pool, monerod, hashrate and API consistent where translation would reduce clarity.

## Relationship to current UI

Do not rewrite the whole frontend just to match artwork. Move incrementally:

- shared typography/spacing tokens;
- sidebar/navigation polish;
- card/status-badge consistency;
- icon consistency;
- dashboard hierarchy;
- then per-page polish.

Every visual refactor must preserve tests, monitoring accuracy and existing safe-operation behavior.


## v1.2.2 implementation

The v1.2.2 design release starts by layering a shared design system over the existing functional UI. The first implementation pass covers:

- dark navy visual tokens and restrained ambient texture;
- compact sidebar / navigation hierarchy;
- unified button, badge, form and focus states;
- login presentation;
- dashboard KPI hierarchy, chart container, miners table and alert state;
- kiosk-friendly density and responsive breakpoints.

The functional DOM contracts, runtime i18n, telemetry, server actions and safety behavior remain unchanged. Per-page polish follows after the shared foundation is visually approved.


### v1.2.2 pass 2

The second design pass improves reference fidelity without replacing the functional architecture:

- brand mark and sidebar identity are closer to the public reference imagery;
- navigation and KPI iconography moves from simple glyphs/emoji to a unified SVG-mask language;
- hover help is restored through an explicit tooltip layer that upgrades existing title / aria-label metadata;
- dashboard KPI sizing now follows the reference hierarchy: income is wider, alerts are narrower, the remaining cards stay visually balanced;
- shared card and panel styling is further tightened for server / proxy surfaces.


### v1.2.2 Patch 2A — tooltips

Tooltip behavior is implemented as a small shared component under `web/components/tooltip/` instead of CSS-generated content. Existing `helpIcon(data-tip)` metadata remains the source of truth. The component uses delegated pointer/focus events, positions one fixed tooltip portal inside the viewport, and reads the current localized text only when the tooltip is opened.
