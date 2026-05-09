# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — `tsc -b && vite build` (type-check then build)
- `npm run lint` — ESLint across all TS/TSX files
- `npm run preview` — Vite preview of production build
- `npm ci --legacy-peer-deps` — install deps (always use `--legacy-peer-deps`)

## Architecture

**Stack:** React 19 + TypeScript (strict), Vite 8, Tailwind CSS v4, Phaser 3 + Matter.js, PeerJS, PWA via vite-plugin-pwa.

**P2P Host-Client model:** The Host (tablet/desktop) runs Phaser as a canvas background and acts as the single source of truth for game state. Clients (phones) connect via PeerJS and render private card hands. The join flow: Host creates a PeerJS room → clients scan QR / enter room code → connect via DataConnection.

**Canvas + React overlay:** Phaser renders as a full-screen canvas (`PhaserTable.tsx`). React UI overlays use `pointer-events-none` on container divs and `pointer-events-auto` on interactive elements so clicks pass through to Phaser.

**Communication pattern:** React ↔ Phaser communication uses `window.dispatchEvent` / `window.addEventListener` with `CustomEvent` (see `useHost.ts` for event names like `host-deal-card`, `host-pop-card`, `host-draw-to-table`, etc.). This avoids coupling React state to Phaser's game loop.

**Server state pattern in `useHost`:** The host hook keeps a `serverStateRef` (a ref containing the true deck array and per-player hands) alongside React state. Mutable operations on the ref are followed by `updateStateAndBroadcast()` which updates React state and sends `STATE_UPDATE` to all clients. Clients never see the full server state — only the public `GameState`.

**Client actions flow:** Client sends `ClientAction` via DataConnection → Host processes in `handleClientAction` → Host mutates `serverStateRef`, updates React state, broadcasts new `GameState` + sends `RECEIVE_CARDS`/`REMOVE_CARDS` to affected clients.

**Deployment:** GitHub Actions on push to main (`deploy.yml`). Vite `base: './'` for relative paths. PWA registers via `vite-plugin-pwa` with `autoUpdate`.

## Project Structure

- `src/types.ts` — shared types (`Card`, `GameState`, `ClientAction`, `HostMessage`)
- `src/config/tableConfig.ts` — container layout config (`GamePackConfig`), data-driven UI
- `src/hooks/useHost.ts` — host PeerJS logic, server state ref, action handlers
- `src/hooks/useClient.ts` — client PeerJS connection, optimistic UI updates
- `src/pages/Host.tsx` — host UI with Phaser canvas + React overlay panels
- `src/pages/Client.tsx` — client hand UI with gesture controls, preview mode
- `src/pages/PhaserTable.tsx` — Phaser 3 + Matter.js canvas: deck, drag-to-deal, player zones
- `src/utils/deck.ts` — deck creation and Fisher-Yates shuffle
- `src/utils/audio/` — sound effect triggers (draw, playCard, returnCard, shuffle)
- `src/App.tsx` — HashRouter with routes: `/` (Home), `/host`, `/client/:hostId`, `/phaser`

## Key Patterns

- **Strict TypeScript:** `verbatimModuleSyntax` requires `import type` for type-only imports. No unused locals/params.
- **Audio:** Each utility module in `src/utils/audio/` is a self-contained function that creates and plays an `AudioContext` on interaction.
- **Client preview mode:** Add `?preview=true` to `/client/:hostId` to test the hand UI without a real host connection (uses mock data).
- **Host Phaser interactions:** The deck is in the center of the canvas. Drag from the deck to a player zone (perimeter) to deal. Drag from the play stack display (React overlay) to move cards.
- **Client gestures:** Touch gestures on the hand area and gesture dock: swipe down = draw, swipe up = play selected cards. Cards are selected by tapping.
