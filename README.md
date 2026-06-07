# Real Cards Sandbox

Real Cards is a rule-light digital card table sandbox.

Use one shared screen as the public table and each phone as a private hand. The app does not try to judge poker hands, turns, winners, or legal moves. It preserves the physical table loop: players draw, play, return, steal, undo, clear, reshuffle, and negotiate the rules themselves.

## Product Loop

1. Open the app on a tablet, laptop, or large screen.
2. Create a Host table.
3. Players scan the QR code or enter the room code from their phones.
4. The Host manages the public table, seats, deck, discard pile, and reset.
5. Clients manage private hands and send card movement requests to the Host.

The Host is the authority for durable card state. Clients may feel immediate, but the Host owns the deck order, private hands, public play stack, discard pile, seat assignments, event log, and move ledger.

## Current Features

- Host room creation with QR join URL.
- Phone Client join flow with player names.
- Host-authoritative deck and private hand state.
- Public Phaser table with zero-gravity card dragging.
- Seat assignment from the Host table: select a player, tap a table-edge seat, and occupied seats swap automatically.
- Client hand draw, play, return to deck top, return to deck bottom, request a hidden-hand draw from another player, give selected cards to another player, and undo.
- Client hand sorting by suit, rank, and draw order.
- Client manual hand ordering through selected-card left/right controls.
- Public play stack, discard pile, event feed, and move ledger.
- Ledger-driven undo requests with confirmation:
  - Undo that touches public containers requires Host/table confirmation.
- Drawing from another player's hidden hand and giving selected cards to another player both require that player's confirmation.
  - Undo of a hand-to-hand move requires the counterparty's confirmation.
- Preview mode for testing the Client UI without a Host.
- Chinese, Japanese, and English UI strings.
- Vite PWA setup for deployment-agnostic builds.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the state boundary and bridge model.

Core ideas:

- `useHost` owns authoritative card state and PeerJS connections.
- `useClient` owns the local phone connection and private hand rendering.
- `cardFlows` contains container-transfer helpers for deck, hand, play stack, and discard movement.
- `tableBridge` is the only event channel between React Host state and the Phaser table.
- Phaser can make cards feel physical, but durable card movement still resolves through Host state.

## Confirmation Model

All durable card movement is represented as a move ledger entry. Undo is no longer a separate per-player private stack; it is resolved from the ledger and then applied as a reverse move.

Current policy:

- Moves involving public containers (`deck`, `deckTop`, `deckBottom`, `playStack`, `discardPile`) require Host confirmation when undone.
- Moves involving another player's private hand use counterparty confirmation.
- A pending counterparty action is sent to the affected Client before the Host mutates card state.
- Rejected or unavailable confirmations do not move cards.

The current UI supports counterparty confirmation for drawing from another hidden hand and giving selected cards to another player.

## Product Roadmap

See [BLUEPRINT.md](./BLUEPRINT.md) for the product plan, MVP stages, implemented items, and near-term issue queue.

## Development

Install dependencies with legacy peer dependency handling:

```bash
npm install --legacy-peer-deps
```

Start the development server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Preview the production build:

```bash
npm run preview
```

## Manual Smoke Test

Use this loop before merging gameplay changes:

1. Start `npm run dev`.
2. Open `/` and confirm the launcher renders.
3. Create a Host table.
4. Open a Client preview from the launcher.
5. In preview, draw a card, select cards, sort the hand, move selected cards left/right, play cards, return cards to deck top/bottom, and open the event log.
6. In a real two-tab session, join the Host with a player name and confirm the Host player panel shows the player, seat, online state, hand count, and recent events.

## Deployment Notes

- Vite `base` should remain deployment-agnostic for GitHub Pages.
- Join URLs should continue to rely on `window.location.origin`, `window.location.pathname`, and hash routes.
- Keep the root-level service worker cleanup in `index.html` so stale service workers do not intercept deployed Pages routes.
