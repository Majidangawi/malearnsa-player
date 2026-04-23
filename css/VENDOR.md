# Vendored Design System

The CSS files in this folder (`tokens.css`, `primitives.css`, `primitives/*.css`) are **vendored copies** of the Editorial Atelier design system from the dashboard repo.

**Source of truth:** `Majidangawi/ma-learn-dashboard` → `frontend/public/css/tokens.css` + `primitives.css`

**Vendored from:** commit `c409c6d` on branch `feat/editorial-atelier-redesign` (2026-04-23).

## How to update

When the dashboard updates the design system:

```bash
cp ~/code/ma-learn-dashboard/frontend/public/css/tokens.css          ~/code/malearnsa-player/css/tokens.css
cp ~/code/ma-learn-dashboard/frontend/public/css/primitives.css      ~/code/malearnsa-player/css/primitives.css
cp ~/code/ma-learn-dashboard/frontend/public/css/primitives/toggle.css ~/code/malearnsa-player/css/primitives/toggle.css
cp ~/code/ma-learn-dashboard/frontend/public/css/primitives/toast.css  ~/code/malearnsa-player/css/primitives/toast.css
```

Commit in the player repo with the dashboard SHA in the commit message for traceability.

**Never edit these files in this repo.** Edits belong in the dashboard repo; they flow here via the copy above.
