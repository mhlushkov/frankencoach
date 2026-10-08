# FrankenCoach design (Claude Design, board v4)

Source: Claude Design project `3fa62b5f-3860-4722-a69b-c3d2072b7e0c`, file `FrankenCoach Board v4.dc.html`.
Night-lab theme on the Industry system: square blueprint frames with "+" corner marks, Barlow Condensed over Barlow, IBM Plex Mono for evidence.

- Tokens: `tokens.css` (same file as `web/src/styles/tokens.css`; fonts self-hosted in `web/src/styles/fonts/`).
- Components and states: `components.md`.
- Screens: `screens/README.md` lists every board screen (4a-4i, 1a-1d, 2a-2c) and which UI file implements it.
- Colors carry meaning: green = worked/alive, amber = learning, red = failed/refused, grey = info/human-made.
- v4 audience is everyday members: plain words, no $ or tool internals. The owner pays for learning; a sport learned once works for everyone.
- Source files live in the Claude Design project (`FrankenCoach Screen v4`, `FrankenCoach Pages v4`, `support.js`, `_ds/`); they need that runtime to render.
