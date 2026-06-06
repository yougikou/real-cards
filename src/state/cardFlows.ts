import type { Card, GameEvent, GameState } from '../types';

export interface ServerCardState {
  deck: Card[];
  playerHands: Record<string, Card[]>;
}

const MAX_EVENT_LOG = 200;

export function appendEvent(state: GameState, event: GameEvent): GameState {
  const eventLog = [...state.eventLog, event];
  return {
    ...state,
    eventLog: eventLog.length > MAX_EVENT_LOG ? eventLog.slice(-MAX_EVENT_LOG) : eventLog,
  };
}

export function drawFromDeck(server: ServerCardState, count: number): Card[] {
  if (count <= 0 || server.deck.length === 0) return [];
  return server.deck.splice(0, count);
}

export function addCardsToHand(server: ServerCardState, playerId: string, cards: Card[]): boolean {
  const hand = server.playerHands[playerId];
  if (!hand) return false;
  hand.push(...cards);
  return true;
}

export function takeCardsFromHand(server: ServerCardState, playerId: string, cards: Card[]): Card[] {
  const hand = server.playerHands[playerId];
  if (!hand || cards.length === 0) return [];

  const requestedIds = new Set(cards.map(card => card.id));
  const takenById = new Map<string, Card>();

  server.playerHands[playerId] = hand.filter(card => {
    if (!requestedIds.has(card.id)) return true;
    takenById.set(card.id, card);
    return false;
  });

  return cards.map(card => takenById.get(card.id)).filter((card): card is Card => Boolean(card));
}

export function removeCardsFromHand(server: ServerCardState, playerId: string, cardIds: string[]): Card[] {
  const hand = server.playerHands[playerId];
  if (!hand || cardIds.length === 0) return [];

  const idSet = new Set(cardIds);
  const removed: Card[] = [];
  server.playerHands[playerId] = hand.filter(card => {
    if (!idSet.has(card.id)) return true;
    removed.push(card);
    return false;
  });
  return removed;
}

export function returnCardsToDeck(server: ServerCardState, cards: Card[], toTop: boolean): void {
  if (cards.length === 0) return;
  if (toTop) {
    server.deck.unshift(...cards);
  } else {
    server.deck.push(...cards);
  }
}

export function removeCardsFromDeck(server: ServerCardState, cardIds: string[]): void {
  if (cardIds.length === 0) return;
  const idSet = new Set(cardIds);
  server.deck = server.deck.filter(card => !idSet.has(card.id));
}

export function withPlayerHandCount(state: GameState, server: ServerCardState, playerId: string): GameState {
  const player = state.players[playerId];
  if (!player) return state;

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        handCount: server.playerHands[playerId]?.length ?? 0,
      },
    },
  };
}

export function withDeckCount(state: GameState, server: ServerCardState): GameState {
  return {
    ...state,
    deckCount: server.deck.length,
  };
}
