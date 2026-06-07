# Real Cards Architecture Notes

## Product stance

Real Cards is a rule-light physical card table sandbox. The host owns the public table and authoritative card state. Clients own private input surfaces and render only the cards they are allowed to see.

## Current state boundary

The authoritative state lives in `useHost`:

- `serverState.deck` stores the real deck order.
- `serverState.playerHands` stores each private hand.
- `GameState` is the public projection sent to clients.

Clients may request moves, but the host must validate every card move against authoritative server state before changing the public projection.

## Card flow target

All future card movement should be expressed as container transfers:

- `deck -> hand`
- `hand -> playStack`
- `hand -> deckTop` / `hand -> deckBottom`
- `playStack -> hand`
- `playStack -> discardPile`
- `hand -> hand`

This keeps undo, event logging, replay, and multiplayer reconciliation predictable.

## Table bridge

React and Phaser communicate through `src/bridge/tableBridge.ts`. The bridge is the only module that should touch DOM event channels.

- `react-host -> phaser-table`: table snapshots (`players`, `deckCount`, `discardPile`, `playStack`, `reset`) project authoritative React state into Phaser.
- `phaser-table -> react-host`: host commands (`dealCardToPlayer`, `popDeckCardForDrag`, `revealDeckCardToTable`, etc.) request state changes from the Host hook.

Phaser may make cards feel physical, but every durable card movement still resolves through `useHost` and `cardFlows`.

## Near-term product loop

Before adding game rules or custom packs, prioritize a stable multiplayer loop:

1. Host creates a table and exposes a QR join URL.
2. Multiple clients join with stable names.
3. Players draw, play, return, steal, undo, and clear public cards.
4. Disconnects and retries preserve understandable state.
5. Host table interactions feel physical but never bypass authoritative state.
