# Porter Theme Overhaul Plan

## Problem

Porter's dark and light themes are functional but not resolved.

Current issues:
- too many direct color literals
- uneven contrast between sections
- light mode still inherits dark-mode assumptions in places
- Pulse, Agents, and Projects do not feel like one art-directed system
- emphasis colors are not used consistently

## Goal

Make both themes feel intentional, high-contrast, and product-quality.

The result should:
- feel unmistakably Porter
- preserve readability in long operator sessions
- support the pixel-art identity work
- make status colors clearer without looking like raw admin software

## Design Direction

### Dark Mode

Desired feel:
- warm graphite, not flat black
- strong separation between canvas, surface, and raised layers
- restrained accent use
- better amber/green/red balance for operational UI

### Light Mode

Desired feel:
- warm paper and slate, not generic white-gray
- clearer section framing
- softer borders with stronger text contrast
- no washed-out cards or muddy chips

## Token Strategy

Replace ad hoc literals with clearer token tiers:
- page background
- base surface
- raised surface
- inset surface
- border subtle
- border strong
- text primary
- text secondary
- text tertiary
- accent primary
- success
- warning
- danger
- info

## Priority Screens

Theme QA should focus on:
1. Agents
2. Project detail
3. Pulse
4. Models
5. Settings

These are the screens where weak color decisions are most visible.

## Cleanup Rules

- remove stale one-off color hacks where tokens should be used
- reduce arbitrary `color-mix(...)` usage where it creates inconsistency
- keep semantic color usage consistent across chips, badges, and status dots
- keep both themes visually related, not like two different products

## Implementation Tranche

1. Audit direct color literals by module
2. Normalize token palette for dark and light
3. Refactor Pulse/Agents/Projects to use the same surface hierarchy
4. Tune status chips and badges
5. Run a final visual pass on high-traffic screens
