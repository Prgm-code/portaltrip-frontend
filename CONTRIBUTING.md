# Contributing to PortalTrip frontend

Thanks for helping. This repo is the browser app for PortalTrip. The Java API lives in
[`portaltrip`](https://github.com/Prgm-code/portaltrip). Keep frontend changes here unless
a patch needs both repos.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## How we work together

1. Search [issues](https://github.com/Prgm-code/portaltrip-frontend/issues) before opening a new one.
2. Open an issue for bugs, design questions, and anything larger than a small fix.
3. Fork the repo and branch from `main`.
4. Keep the pull request focused. One problem, one patch.
5. Fill in the PR description with what changed, why, and how you checked it.

Issues are the planning surface. Pull requests are the review surface. If a change
rewrites navigation, persistence, or the API client, talk about it in an issue first.

## Local setup

You need Node.js 24 and [pnpm](https://pnpm.io/) 10.

```bash
git clone git@github.com:Prgm-code/portaltrip-frontend.git
cd portaltrip-frontend
pnpm install
pnpm dev
```

The app starts at `http://localhost:4321`. Catalog data comes from
[rickandmortyapi.com](https://rickandmortyapi.com/) during development.

## What good changes look like

- Types stay strict. Domain values use the enums in `src/models/`. Incoming errors stay `unknown` until they are narrowed.
- Astro components own the first HTML. Browser behavior lives in `src/scripts/`, `src/ui/`, and `src/stores/`. Do not pull in React or another UI runtime.
- DOM reads go through typed elements and null checks. Forms call `preventDefault()` before they read `FormData`.
- Visible UI uses `textContent` (or equivalent) for untrusted strings. Do not assign `innerHTML` from API payloads.
- Reservation writes go through `travelStore`. The persisted key remains `localStorage["reservas"]`, a JSON array.
- Quote and booking rules in `src/utils/travelRules.ts` should stay aligned with
  [`portaltrip`](https://github.com/Prgm-code/portaltrip) unless the PR explains a deliberate split.

## Checks

Run these before you open a PR:

```bash
pnpm check
pnpm build
```

`pnpm check` runs `astro check` and Biome. `pnpm build` repeats that check and then
emits `dist/`. Format with `pnpm format` if Biome complains about whitespace.

Manual pass for planner work:

1. Load `/`, wait for the catalog, book a trip.
2. Start the trip and confirm `/viaje` renders the log.
3. Reload `/` and confirm `localStorage["reservas"]` still lists the booking.
4. If you touched the API client, open `/?apiError=404`, `/?apiError=429`, and `/?apiError=500`.

## Pull request review

Maintainers review for correctness, typing, accessibility of new controls, and whether
the architecture above still holds. Expect questions when a change adds a dependency,
changes persistence shape, or talks to a new backend.

We may ask you to split a large PR. That is cheaper than reviewing a mixed patch.

## License of contributions

This project is released under the [MIT License](LICENSE). By submitting a pull
request you license your contribution under MIT and confirm you have the right to
do so.
