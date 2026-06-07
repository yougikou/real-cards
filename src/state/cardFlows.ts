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


export function resetServerCards(server: ServerCardState, deck: Card[]): Record<string, string[]> {
  server.deck = deck;
  const removedCardIdsByPlayer: Record<string, string[]> = {};

  for (const [playerId, hand] of Object.entries(server.playerHands)) {
    removedCardIdsByPlayer[playerId] = hand.map(card => card.id);
    server.playerHands[playerId] = [];
  }

  return removedCardIdsByPlayer;
}

export function createPlayerHand(server: ServerCardState, playerId: string): void {
  server.playerHands[playerId] = server.playerHands[playerId] ?? [];
}

export function transferPlayerHand(server: ServerCardState, fromPlayerId: string, toPlayerId: string): Card[] {
  const hand = server.playerHands[fromPlayerId] ?? [];
  server.playerHands[toPlayerId] = hand;
  delete server.playerHands[fromPlayerId];
  return hand;
}

export function getPlayerHand(server: ServerCardState, playerId: string): Card[] {
  return server.playerHands[playerId] ?? [];
}

export function getPlayerHandCount(server: ServerCardState, playerId: string): number {
  return getPlayerHand(server, playerId).length;
}

export function replacePublicPlayersHandCounts(state: GameState, server: ServerCardState): GameState {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([playerId, player]) => [
      playerId,
      {
        ...player,
        handCount: getPlayerHandCount(server, playerId),
      },
    ]),
  );

  return {
    ...state,
    players,
  };
}

export function resetPublicCardState(state: GameState, server: ServerCardState): GameState {
  return replacePublicPlayersHandCounts(
    {
      ...state,
      deckCount: server.deck.length,
      playStack: [],
      discardPile: [],
    },
    server,
  );
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


export function drawCardsToHand(server: ServerCardState, playerId: string, count: number): Card[] {
  const cards = drawFromDeck(server, count);
  if (cards.length === 0) return [];
  if (!addCardsToHand(server, playerId, cards)) {
    returnCardsToDeck(server, cards, true);
    return [];
  }
  return cards;
}

export function moveCardsFromHandToDeck(
  server: ServerCardState,
  playerId: string,
  cards: Card[],
  toTop: boolean,
): Card[] {
  const movedCards = takeCardsFromHand(server, playerId, cards);
  returnCardsToDeck(server, movedCards, toTop);
  return movedCards;
}

export function moveCardBetweenHands(
  server: ServerCardState,
  fromPlayerId: string,
  toPlayerId: string,
  cardId?: string,
): Card | null {
  const sourceHand = server.playerHands[fromPlayerId];
  const targetHand = server.playerHands[toPlayerId];
  if (!sourceHand || !targetHand || sourceHand.length === 0) return null;

  const cardIndex = cardId
    ? sourceHand.findIndex(card => card.id === cardId)
    : Math.floor(Math.random() * sourceHand.length);
  if (cardIndex < 0) return null;

  const [card] = sourceHand.splice(cardIndex, 1);
  targetHand.push(card);
  return card;
}

export function removeCardsFromPlayStack(state: GameState, cards: Card[]): GameState {
  const cardIds = new Set(cards.map(card => card.id));
  return {
    ...state,
    playStack: state.playStack
      .map(batch => batch.filter(card => !cardIds.has(card.id)))
      .filter(batch => batch.length > 0),
  };
}

export function popPlayStackBatch(state: GameState): { nextState: GameState; cards: Card[] } {
  if (state.playStack.length === 0) return { nextState: state, cards: [] };
  const playStack = [...state.playStack];
  const cards = playStack.pop() ?? [];
  return {
    nextState: {
      ...state,
      playStack,
    },
    cards,
  };
}

export function appendPlayStackBatch(state: GameState, cards: Card[]): GameState {
  if (cards.length === 0) return state;
  return {
    ...state,
    playStack: [...state.playStack, cards],
  };
}


export function moveCardsFromHandToPlayStack(
  server: ServerCardState,
  state: GameState,
  playerId: string,
  cards: Card[],
): { nextState: GameState; cards: Card[] } {
  const movedCards = takeCardsFromHand(server, playerId, cards);
  return {
    nextState: appendPlayStackBatch(state, movedCards),
    cards: movedCards,
  };
}

export function movePlayStackTopCardsToHand(
  server: ServerCardState,
  state: GameState,
  playerId: string,
  cards: Card[],
): { nextState: GameState; cards: Card[] } {
  if (cards.length === 0 || state.playStack.length === 0) {
    return { nextState: state, cards: [] };
  }

  const requestedIds = new Set(cards.map(card => card.id));
  const playStack = [...state.playStack];
  const lastBatch = playStack.pop() ?? [];
  const movedCards = cards.filter(card => lastBatch.some(stackCard => stackCard.id === card.id));

  if (movedCards.length === 0) {
    if (lastBatch.length > 0) playStack.push(lastBatch);
    return { nextState: { ...state, playStack }, cards: [] };
  }

  addCardsToHand(server, playerId, movedCards);
  const remainingBatch = lastBatch.filter(card => !requestedIds.has(card.id));
  if (remainingBatch.length > 0) playStack.push(remainingBatch);

  return {
    nextState: {
      ...state,
      playStack,
    },
    cards: movedCards,
  };
}

export function clearPlayStackToDiscard(state: GameState): { nextState: GameState; cards: Card[] } {
  const cards = state.playStack.flat();
  if (cards.length === 0) return { nextState: state, cards: [] };
  return {
    nextState: {
      ...state,
      playStack: [],
      discardPile: [...state.discardPile, ...cards],
    },
    cards,
  };
}

export function discardCards(state: GameState, cards: Card[]): GameState {
  if (cards.length === 0) return state;
  return {
    ...state,
    discardPile: [...state.discardPile, ...cards],
  };
}

export function withPlayerHandCounts(state: GameState, server: ServerCardState, playerIds: string[]): GameState {
  return playerIds.reduce(
    (nextState, playerId) => withPlayerHandCount(nextState, server, playerId),
    state,
  );
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
