import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Card, ConfirmationMode, GameState, ClientAction, HostMessage, MoveLedgerEntry, PendingAction } from '../types';
import { createDeck } from '../utils/deck';
import { emitTableSnapshot, onHostCommand } from '../bridge/tableBridge';
import {
  addCardsToHand,
  appendEvent,
  appendPlayStackBatch,
  clearPlayStackToDiscard,
  discardCards,
  drawCardsToHand,
  drawFromDeck,
  createPlayerHand,
  getPlayerHand,
  getPlayerHandCount,
  moveCardBetweenHands,
  moveCardsFromHandToDeck,
  moveCardsFromHandToPlayStack,
  movePlayStackTopCardsToHand,
  popPlayStackBatch,
  removeCardsFromDeck,
  removeCardsFromHand,
  removeCardsFromPlayStack,
  resetPublicCardState,
  resetServerCards,
  returnCardsToDeck,
  withDeckCount,
  withPlayerHandCount,
  transferPlayerHand,
  withPlayerHandCounts,
} from '../state/cardFlows';

type ClientActionHistoryEntry =
  | { type: 'DRAW'; payload: { drawnCards: Card[] } }
  | { type: 'PLAY'; payload: { cards: Card[] } }
  | { type: 'DRAW_FROM_OTHER'; payload: { stolenCard: Card; targetPlayerId: string } }
  | { type: 'RETURN'; payload: { cards: Card[]; toTop: boolean } };

const SEAT_IDS = [
  'player_top_1',
  'player_top_2',
  'player_top_3',
  'player_right_1',
  'player_right_2',
  'player_bottom_3',
  'player_bottom_2',
  'player_bottom_1',
  'player_left_2',
  'player_left_1',
];

const MAX_MOVE_LEDGER = 200;
const PUBLIC_CONTAINERS = new Set(['deck', 'deckTop', 'deckBottom', 'playStack', 'discardPile']);

function findNextOpenSeat(state: GameState): string | undefined {
  const occupiedSeats = new Set(Object.values(state.players).map(player => player.seatId).filter(Boolean));
  return SEAT_IDS.find(seatId => !occupiedSeats.has(seatId));
}

function appendMove(
  state: GameState,
  move: Omit<MoveLedgerEntry, 'id' | 'timestamp'> & { timestamp?: number },
): GameState {
  const timestamp = move.timestamp ?? Date.now();
  const entry: MoveLedgerEntry = {
    ...move,
    id: `${timestamp}-${state.moveLedger.length}-${move.action}`,
    timestamp,
    reversible: move.reversible ?? true,
  };
  const moveLedger = [...state.moveLedger, entry];
  return {
    ...state,
    moveLedger: moveLedger.length > MAX_MOVE_LEDGER ? moveLedger.slice(-MAX_MOVE_LEDGER) : moveLedger,
  };
}

function markMoveUndone(state: GameState, moveId: string): GameState {
  return {
    ...state,
    moveLedger: state.moveLedger.map(move => (
      move.id === moveId ? { ...move, undone: true } : move
    )),
  };
}

function getUndoConfirmation(move: MoveLedgerEntry): ConfirmationMode {
  if (move.undoConfirmationMode) return move.undoConfirmationMode;
  if (move.counterpartyPlayerId) return 'counterparty';
  if (PUBLIC_CONTAINERS.has(move.from) || PUBLIC_CONTAINERS.has(move.to)) return 'host';
  return 'none';
}

function findUndoableMove(state: GameState, playerId: string): MoveLedgerEntry | null {
  for (let i = state.moveLedger.length - 1; i >= 0; i--) {
    const move = state.moveLedger[i];
    if (move.undone || move.undoOf || move.reversible === false) continue;
    if (move.actorPlayerId !== playerId) continue;
    if (getUndoConfirmation(move) === 'locked') continue;
    return move;
  }
  return null;
}

function addPendingAction(state: GameState, pendingAction: PendingAction): GameState {
  return {
    ...state,
    pendingActions: {
      ...state.pendingActions,
      [pendingAction.id]: pendingAction,
    },
  };
}

function removePendingAction(state: GameState, pendingActionId: string): GameState {
  const pendingActions = { ...state.pendingActions };
  delete pendingActions[pendingActionId];
  return {
    ...state,
    pendingActions,
  };
}

function appendMoveAndEvent(
  state: GameState,
  move: Omit<MoveLedgerEntry, 'id' | 'timestamp'>,
  event: Parameters<typeof appendEvent>[1],
): GameState {
  return appendEvent(appendMove(state, { ...move, timestamp: event.timestamp }), event);
}

export function useHost() {
  const [status, setStatus] = useState<'starting' | 'ready' | 'failed' | 'reconnecting'>('starting');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  const [peerId, setPeerId] = useState<string>('');

  const [gameState, setGameState] = useState<GameState>({
    deckCount: 54,
    discardPile: [],
    playStack: [],
    players: {},
    eventLog: [],
    moveLedger: [],
    pendingActions: {},
  });
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const retry = () => {
    setStatus('starting');
    setError(null);
    setRetryCount(prev => prev + 1);
    targetIdRef.current = null; // Force fresh peer ID — stale IDs get stuck in 'starting'
  };

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Record<string, DataConnection>>({});

  const resetGame = () => {
    const removedCardIdsByPlayer = resetServerCards(serverStateRef.current, createDeck());

    for (const [clientId, cardIds] of Object.entries(removedCardIdsByPlayer)) {
      if (cardIds.length > 0) {
        sendToPlayer(clientId, { type: 'REMOVE_CARDS', payload: cardIds });
      }
    }

    updateStateAndBroadcast(prev => appendEvent(
      { ...resetPublicCardState(prev, serverStateRef.current), moveLedger: [], pendingActions: {} },
      { timestamp: Date.now(), type: 'HOST_CLEAR_TABLE' as const },
    ));

    emitTableSnapshot('reset');
  };

  // Keep true deck and hands server-side
  const serverStateRef = useRef({
    deck: createDeck(),
    playerHands: {} as Record<string, Card[]>,
  });

  // Per-client action history for undo
  const clientActionHistoryRef = useRef<Record<string, ClientActionHistoryEntry[]>>({});

  // Track player name → peer ID mapping so reconnecting clients keep their identity
  const nameToPeerIdRef = useRef<Record<string, string>>({});

  const broadcastState = (newState: GameState) => {
    const message: HostMessage = { type: 'STATE_UPDATE', payload: newState };
    Object.values(connectionsRef.current).forEach(conn => {
      conn.send(message);
    });
  };

  const sendToPlayer = (playerId: string, message: HostMessage) => {
    connectionsRef.current[playerId]?.send(message);
  };

  const MAX_EVENT_LOG = 200;

  const updateStateAndBroadcast = (updater: (prev: GameState) => GameState) => {
    setGameState(prev => {
      const next = updater(prev);
      if (next.eventLog.length > MAX_EVENT_LOG) {
        next.eventLog = next.eventLog.slice(-MAX_EVENT_LOG);
      }
      broadcastState(next);
      return next;
    });
  };

  const clearTableToDiscard = () => {
    updateStateAndBroadcast(prev => {
      const { nextState, cards } = clearPlayStackToDiscard(prev);
      if (cards.length === 0) return prev;
      return appendMoveAndEvent(
        nextState,
        {
          action: 'HOST_CLEAR_TABLE',
          from: 'playStack',
          to: 'discardPile',
          cards,
        },
        { timestamp: Date.now(), type: 'HOST_CLEAR_TABLE' as const, cards },
      );
    });
  };

  const dealCardsToPlayer = (playerId: string, count = 1) => {
    const cards = drawFromDeck(serverStateRef.current, count);
    if (cards.length === 0 || !addCardsToHand(serverStateRef.current, playerId, cards)) return;

    sendToPlayer(playerId, { type: 'RECEIVE_CARDS', payload: cards });

    updateStateAndBroadcast(prev => appendMoveAndEvent(
      withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, playerId),
      {
        action: 'HOST_DEAL',
        targetPlayerId: playerId,
        targetName: prev.players[playerId]?.name,
        from: 'deck',
        to: 'hand',
        cards,
      },
      { timestamp: Date.now(), type: 'HOST_DEAL' as const, playerName: prev.players[playerId]?.name, cards },
    ));
  };

  const assignSeat = (playerId: string, seatId?: string) => {
    updateStateAndBroadcast(prev => {
      const player = prev.players[playerId];
      if (!player) return prev;
      const previousSeat = player.seatId;
      const players = { ...prev.players };
      const occupant = seatId
        ? Object.values(players).find(existingPlayer => existingPlayer.id !== playerId && existingPlayer.seatId === seatId)
        : undefined;

      if (occupant) {
        players[occupant.id] = {
          ...occupant,
          seatId: previousSeat,
        };
      }
      players[playerId] = {
        ...player,
        seatId,
      };

      return appendEvent(
        {
          ...prev,
          players,
        },
        { timestamp: Date.now(), type: 'SEAT_ASSIGNED' as const, playerName: player.name, seatId },
      );
    });
  };

  const requestPendingAction = (pendingAction: PendingAction) => {
    updateStateAndBroadcast(prev => addPendingAction(prev, pendingAction));
    if (pendingAction.confirmationMode === 'counterparty' && pendingAction.counterpartyPlayerId) {
      sendToPlayer(pendingAction.counterpartyPlayerId, {
        type: 'CONFIRMATION_REQUEST',
        payload: pendingAction,
      });
    }
  };

  const rejectPendingAction = (pendingActionId: string) => {
    updateStateAndBroadcast(prev => removePendingAction(prev, pendingActionId));
  };

  const executeUndoMove = (move: MoveLedgerEntry, pendingActionId?: string) => {
    const actorPlayerId = move.actorPlayerId ?? move.toPlayerId ?? move.targetPlayerId;
    if (!actorPlayerId) return;

    const actorName = gameStateRef.current.players[actorPlayerId]?.name ?? move.actorName;
    let nextPlayStack = gameStateRef.current.playStack;
    let nextDiscardPile = gameStateRef.current.discardPile;
    let movedCards: Card[] = [];
    let from = move.to;
    let to = move.from;
    const affectedPlayerIds = new Set<string>();

    if (move.from === 'deck' && move.to === 'hand') {
      const handOwner = move.toPlayerId ?? actorPlayerId;
      movedCards = removeCardsFromHand(serverStateRef.current, handOwner, move.cards.map(card => card.id));
      returnCardsToDeck(serverStateRef.current, movedCards, true);
      if (movedCards.length > 0) {
        sendToPlayer(handOwner, { type: 'REMOVE_CARDS', payload: movedCards.map(card => card.id) });
        affectedPlayerIds.add(handOwner);
      }
      from = 'hand';
      to = 'deckTop';
    } else if (move.from === 'hand' && move.to === 'playStack') {
      const { nextState, cards } = movePlayStackTopCardsToHand(
        serverStateRef.current,
        gameStateRef.current,
        actorPlayerId,
        move.cards,
      );
      movedCards = cards;
      nextPlayStack = nextState.playStack;
      if (movedCards.length > 0) {
        sendToPlayer(actorPlayerId, { type: 'RECEIVE_CARDS', payload: movedCards });
        affectedPlayerIds.add(actorPlayerId);
      }
    } else if (move.from === 'hand' && (move.to === 'deckTop' || move.to === 'deckBottom')) {
      removeCardsFromDeck(serverStateRef.current, move.cards.map(card => card.id));
      addCardsToHand(serverStateRef.current, actorPlayerId, move.cards);
      movedCards = move.cards;
      sendToPlayer(actorPlayerId, { type: 'RECEIVE_CARDS', payload: movedCards });
      affectedPlayerIds.add(actorPlayerId);
    } else if (move.from === 'hand' && move.to === 'hand' && move.fromPlayerId && move.toPlayerId) {
      movedCards = removeCardsFromHand(serverStateRef.current, move.toPlayerId, move.cards.map(card => card.id));
      if (movedCards.length > 0) {
        addCardsToHand(serverStateRef.current, move.fromPlayerId, movedCards);
        sendToPlayer(move.toPlayerId, { type: 'REMOVE_CARDS', payload: movedCards.map(card => card.id) });
        sendToPlayer(move.fromPlayerId, { type: 'RECEIVE_CARDS', payload: movedCards });
        affectedPlayerIds.add(move.toPlayerId);
        affectedPlayerIds.add(move.fromPlayerId);
      }
    } else if (move.from === 'playStack' && move.to === 'discardPile') {
      const movedIds = new Set(move.cards.map(card => card.id));
      const nextDiscard = [...gameStateRef.current.discardPile];
      const restoredCards: Card[] = [];
      for (let i = nextDiscard.length - 1; i >= 0; i--) {
        if (!movedIds.has(nextDiscard[i].id)) continue;
        restoredCards.unshift(nextDiscard[i]);
        nextDiscard.splice(i, 1);
        if (restoredCards.length === move.cards.length) break;
      }
      movedCards = restoredCards;
      nextDiscardPile = nextDiscard;
      nextPlayStack = movedCards.length > 0
        ? [...gameStateRef.current.playStack, movedCards]
        : gameStateRef.current.playStack;
      from = 'discardPile';
      to = 'playStack';
    }

    if (movedCards.length === 0) {
      rejectPendingAction(pendingActionId ?? '');
      return;
    }

    updateStateAndBroadcast(prev => {
      const playerIds = [...affectedPlayerIds];
      const countedState = playerIds.length > 0
        ? withPlayerHandCounts(prev, serverStateRef.current, playerIds)
        : prev;
      const stateWithContainers = withDeckCount({
        ...countedState,
        playStack: nextPlayStack,
        discardPile: nextDiscardPile,
      }, serverStateRef.current);
      const withoutPending = pendingActionId ? removePendingAction(stateWithContainers, pendingActionId) : stateWithContainers;
      const marked = markMoveUndone(withoutPending, move.id);
      return appendMoveAndEvent(
        marked,
        {
          action: 'UNDO',
          actorPlayerId,
          actorName,
          from,
          to,
          cards: movedCards,
          undoOf: move.id,
          reversible: false,
        },
        { timestamp: Date.now(), type: 'UNDO' as const, playerName: actorName },
      );
    });
  };

  const executePendingMove = (pendingAction: PendingAction) => {
    if (pendingAction.type !== 'MOVE') return;
    const requesterId = pendingAction.requestedByPlayerId;
    const counterpartyId = pendingAction.counterpartyPlayerId;
    if (!requesterId || !counterpartyId || !pendingAction.move) return;

    if (pendingAction.move.action === 'DRAW_FROM_OTHER') {
      const stolenCard = moveCardBetweenHands(serverStateRef.current, counterpartyId, requesterId, pendingAction.cardId);
      if (!stolenCard) {
        rejectPendingAction(pendingAction.id);
        return;
      }

      sendToPlayer(counterpartyId, { type: 'REMOVE_CARDS', payload: [stolenCard.id] });
      sendToPlayer(requesterId, { type: 'RECEIVE_CARDS', payload: [stolenCard] });

      updateStateAndBroadcast(prev => {
        const requester = prev.players[requesterId];
        const target = prev.players[counterpartyId];
        return appendMoveAndEvent(
          removePendingAction(withPlayerHandCounts(prev, serverStateRef.current, [requesterId, counterpartyId]), pendingAction.id),
          {
            action: 'DRAW_FROM_OTHER',
            actorPlayerId: requesterId,
            actorName: requester?.name,
            fromPlayerId: counterpartyId,
            fromPlayerName: target?.name,
            toPlayerId: requesterId,
            toPlayerName: requester?.name,
            targetPlayerId: counterpartyId,
            targetName: target?.name,
            counterpartyPlayerId: counterpartyId,
            from: 'hand',
            to: 'hand',
            cards: [stolenCard],
          },
          { timestamp: Date.now(), type: 'DRAW_FROM_OTHER' as const, playerName: requester?.name, targetPlayerName: target?.name, count: 1 },
        );
      });
      return;
    }

    if (pendingAction.move.action === 'GIVE_CARD') {
      const cardsToGive = pendingAction.move.cards;
      const movedCards = removeCardsFromHand(serverStateRef.current, requesterId, cardsToGive.map(card => card.id));
      if (movedCards.length === 0 || !addCardsToHand(serverStateRef.current, counterpartyId, movedCards)) {
        if (movedCards.length > 0) addCardsToHand(serverStateRef.current, requesterId, movedCards);
        rejectPendingAction(pendingAction.id);
        return;
      }

      sendToPlayer(requesterId, { type: 'REMOVE_CARDS', payload: movedCards.map(card => card.id) });
      sendToPlayer(counterpartyId, { type: 'RECEIVE_CARDS', payload: movedCards });

      updateStateAndBroadcast(prev => {
        const requester = prev.players[requesterId];
        const target = prev.players[counterpartyId];
        return appendMoveAndEvent(
          removePendingAction(withPlayerHandCounts(prev, serverStateRef.current, [requesterId, counterpartyId]), pendingAction.id),
          {
            action: 'GIVE_CARD',
            actorPlayerId: requesterId,
            actorName: requester?.name,
            fromPlayerId: requesterId,
            fromPlayerName: requester?.name,
            toPlayerId: counterpartyId,
            toPlayerName: target?.name,
            targetPlayerId: counterpartyId,
            targetName: target?.name,
            counterpartyPlayerId: counterpartyId,
            from: 'hand',
            to: 'hand',
            cards: movedCards,
          },
          { timestamp: Date.now(), type: 'GIVE_CARD' as const, playerName: requester?.name, targetPlayerName: target?.name, cards: movedCards, count: movedCards.length },
        );
      });
    }
  };

  const approvePendingAction = (pendingActionId: string) => {
    const pendingAction = gameStateRef.current.pendingActions[pendingActionId];
    if (!pendingAction) return;
    if (pendingAction.type === 'UNDO' && pendingAction.undoMoveId) {
      const move = gameStateRef.current.moveLedger.find(entry => entry.id === pendingAction.undoMoveId);
      if (move) executeUndoMove(move, pendingAction.id);
      return;
    }
    executePendingMove(pendingAction);
  };

  const requestUndoForPlayer = (playerId: string) => {
    const move = findUndoableMove(gameStateRef.current, playerId);
    if (!move) return;

    const confirmationMode = getUndoConfirmation(move);
    if (confirmationMode === 'none') {
      executeUndoMove(move);
      return;
    }
    if (confirmationMode === 'locked') return;

    const requester = gameStateRef.current.players[playerId];
    const counterparty = move.counterpartyPlayerId ? gameStateRef.current.players[move.counterpartyPlayerId] : undefined;
    requestPendingAction({
      id: `${Date.now()}-undo-${move.id}`,
      type: 'UNDO',
      requestedByPlayerId: playerId,
      requestedByName: requester?.name,
      counterpartyPlayerId: move.counterpartyPlayerId,
      counterpartyName: counterparty?.name,
      confirmationMode,
      undoMoveId: move.id,
      status: 'pending',
      createdAt: Date.now(),
    });
  };

  const handleClientAction = (clientId: string, action: ClientAction) => {
    const history = clientActionHistoryRef.current;
    if (!history[clientId]) history[clientId] = [];

    switch (action.type) {
      case 'JOIN': {
        const playerName = action.payload.name;
        const existingPeerId = nameToPeerIdRef.current[playerName];

        if (existingPeerId && existingPeerId !== clientId) {
          if (connectionsRef.current[existingPeerId]) {
            // Original player still connected → duplicate name, reject
            sendToPlayer(clientId, { type: 'ERROR', payload: `Name "${playerName}" is already taken.` });
            break;
          }
          // Reconnection: transfer server state from old peer ID to new
          transferPlayerHand(serverStateRef.current, existingPeerId, clientId);
          if (clientActionHistoryRef.current[existingPeerId]) {
            clientActionHistoryRef.current[clientId] = clientActionHistoryRef.current[existingPeerId];
            delete clientActionHistoryRef.current[existingPeerId];
          }
          nameToPeerIdRef.current[playerName] = clientId;

          const existingHand = getPlayerHand(serverStateRef.current, clientId);
          updateStateAndBroadcast(prev => {
            const newPlayers = { ...prev.players };
            const previousPlayer = newPlayers[existingPeerId];
            delete newPlayers[existingPeerId];
            newPlayers[clientId] = {
              id: clientId,
              name: playerName,
              handCount: existingHand.length,
              seatId: previousPlayer?.seatId ?? findNextOpenSeat(prev),
              online: true,
            };
            return appendEvent({
              ...prev,
              players: newPlayers,
            }, { timestamp: Date.now(), type: 'JOIN' as const, playerName });
          });

          // Send existing cards back to reconnecting client
          if (existingHand.length > 0) {
            sendToPlayer(clientId, { type: 'RECEIVE_CARDS', payload: existingHand });
          }
          break;
        }

        // Duplicate name check for genuinely new connections
        const isNameTaken = Object.values(gameStateRef.current.players).some(p => p.name === playerName);
        if (isNameTaken) {
          sendToPlayer(clientId, { type: 'ERROR', payload: `Name "${playerName}" is already taken.` });
          break;
        }

        nameToPeerIdRef.current[playerName] = clientId;
        createPlayerHand(serverStateRef.current, clientId);
        updateStateAndBroadcast(prev => appendEvent({
          ...prev,
          players: {
            ...prev.players,
            [clientId]: {
              id: clientId,
              name: playerName,
              handCount: getPlayerHandCount(serverStateRef.current, clientId),
              seatId: findNextOpenSeat(prev),
              online: true,
            }
          },
        }, { timestamp: Date.now(), type: 'JOIN' as const, playerName }));
        break;
      }
      case 'DRAW': {
        const { count } = action.payload;
        const drawnCards = drawCardsToHand(serverStateRef.current, clientId, count);
        if (drawnCards.length === 0) break;

        history[clientId].push({ type: 'DRAW', payload: { drawnCards } });

        const msg: HostMessage = { type: 'RECEIVE_CARDS', payload: drawnCards };
        sendToPlayer(clientId, msg);

        updateStateAndBroadcast(prev => appendMoveAndEvent(
          withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, clientId),
          {
            action: 'DRAW',
            actorPlayerId: clientId,
            actorName: prev.players[clientId]?.name,
            from: 'deck',
            to: 'hand',
            cards: drawnCards,
          },
          { timestamp: Date.now(), type: 'DRAW' as const, playerName: prev.players[clientId]?.name, count: drawnCards.length },
        ));
        break;
      }
      case 'PLAY': {
        const { cards } = action.payload;

        const { nextState, cards: playedCards } = moveCardsFromHandToPlayStack(
          serverStateRef.current,
          gameStateRef.current,
          clientId,
          cards,
        );
        if (playedCards.length === 0) break;

        history[clientId].push({ type: 'PLAY', payload: { cards: playedCards } });

        updateStateAndBroadcast(prev => appendMoveAndEvent(
          {
            ...withPlayerHandCount(prev, serverStateRef.current, clientId),
            playStack: nextState.playStack,
          },
          {
            action: 'PLAY',
            actorPlayerId: clientId,
            actorName: prev.players[clientId]?.name,
            from: 'hand',
            to: 'playStack',
            cards: playedCards,
          },
          { timestamp: Date.now(), type: 'PLAY' as const, playerName: prev.players[clientId]?.name, cards: playedCards },
        ));
        break;
      }
      case 'RETURN': {
        const { cards, toTop } = action.payload;

        const returnedCards = moveCardsFromHandToDeck(serverStateRef.current, clientId, cards, toTop);
        if (returnedCards.length === 0) break;

        history[clientId].push({ type: 'RETURN', payload: { cards: returnedCards, toTop } });

        updateStateAndBroadcast(prev => appendMoveAndEvent(
          withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, clientId),
          {
            action: 'RETURN',
            actorPlayerId: clientId,
            actorName: prev.players[clientId]?.name,
            from: 'hand',
            to: toTop ? 'deckTop' : 'deckBottom',
            cards: returnedCards,
          },
          { timestamp: Date.now(), type: 'RETURN' as const, playerName: prev.players[clientId]?.name, cards: returnedCards },
        ));
        break;
      }
      case 'DRAW_FROM_OTHER': {
        const { targetPlayerId, cardId } = action.payload;
        const requester = gameStateRef.current.players[clientId];
        const target = gameStateRef.current.players[targetPlayerId];
        if (!requester || !target) break;

        requestPendingAction({
          id: `${Date.now()}-take-${clientId}-${targetPlayerId}`,
          type: 'MOVE',
          requestedByPlayerId: clientId,
          requestedByName: requester.name,
          counterpartyPlayerId: targetPlayerId,
          counterpartyName: target.name,
          confirmationMode: 'counterparty',
          cardId: cardId || undefined,
          status: 'pending',
          createdAt: Date.now(),
          move: {
            action: 'DRAW_FROM_OTHER',
            actorPlayerId: clientId,
            actorName: requester.name,
            fromPlayerId: targetPlayerId,
            fromPlayerName: target.name,
            toPlayerId: clientId,
            toPlayerName: requester.name,
            targetPlayerId,
            targetName: target.name,
            counterpartyPlayerId: targetPlayerId,
            from: 'hand',
            to: 'hand',
            cards: [],
          },
        });
        break;
      }
      case 'GIVE_CARD': {
        const { targetPlayerId, cards } = action.payload;
        const requester = gameStateRef.current.players[clientId];
        const target = gameStateRef.current.players[targetPlayerId];
        if (!requester || !target || cards.length === 0) break;

        requestPendingAction({
          id: `${Date.now()}-give-${clientId}-${targetPlayerId}`,
          type: 'MOVE',
          requestedByPlayerId: clientId,
          requestedByName: requester.name,
          counterpartyPlayerId: targetPlayerId,
          counterpartyName: target.name,
          confirmationMode: 'counterparty',
          status: 'pending',
          createdAt: Date.now(),
          move: {
            action: 'GIVE_CARD',
            actorPlayerId: clientId,
            actorName: requester.name,
            fromPlayerId: clientId,
            fromPlayerName: requester.name,
            toPlayerId: targetPlayerId,
            toPlayerName: target.name,
            targetPlayerId,
            targetName: target.name,
            counterpartyPlayerId: targetPlayerId,
            from: 'hand',
            to: 'hand',
            cards,
          },
        });
        break;
      }
      case 'CLEAR_TABLE': {
        clearTableToDiscard();
        break;
      }
      case 'ASSIGN_SEAT': {
        const { playerId, seatId } = action.payload;
        assignSeat(playerId, seatId);
        break;
      }
      case 'RESPOND_PENDING_ACTION': {
        const { pendingActionId, approved } = action.payload;
        const pendingAction = gameStateRef.current.pendingActions[pendingActionId];
        if (!pendingAction) break;
        if (pendingAction.confirmationMode === 'counterparty' && pendingAction.counterpartyPlayerId !== clientId) break;
        if (approved) {
          approvePendingAction(pendingActionId);
        } else {
          rejectPendingAction(pendingActionId);
        }
        break;
      }
      case 'UNDO_LAST_ACTION': {
        requestUndoForPlayer(clientId);
        break;
      }
    }
  };

  // Keep track of our established ID so we can recover the exact same room if we need a full recreation
  const targetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const cleanupTableEvents = [
      onHostCommand('assignPlayerToSeat', ({ playerId, seatId }) => {
        assignSeat(playerId, seatId);
      }),
      onHostCommand('dealCardToPlayer', ({ playerId, cardData }) => {
        const cards = cardData ? [cardData] : drawFromDeck(serverStateRef.current, 1);
        if (cards.length === 0 || !addCardsToHand(serverStateRef.current, playerId, cards)) return;

        const msg: HostMessage = { type: 'RECEIVE_CARDS', payload: cards };
        sendToPlayer(playerId, msg);

        updateStateAndBroadcast(prev => appendMoveAndEvent(
          withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, playerId),
          {
            action: 'HOST_DEAL',
            targetPlayerId: playerId,
            targetName: prev.players[playerId]?.name,
            from: cardData ? 'playStack' : 'deck',
            to: 'hand',
            cards,
          },
          { timestamp: Date.now(), type: 'HOST_DEAL' as const, playerName: prev.players[playerId]?.name, cards },
        ));
      }),
      onHostCommand('popDeckCardForDrag', ({ callback }) => {
        const [popped] = drawFromDeck(serverStateRef.current, 1);
        if (!popped) {
          callback(null);
          return;
        }

        updateStateAndBroadcast(prev => appendMoveAndEvent(
          withDeckCount(prev, serverStateRef.current),
          {
            action: 'HOST_DRAW_TO_TABLE',
            from: 'deck',
            to: 'playStack',
            cards: [popped],
          },
          { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [popped] },
        ));
        callback(popped);
      }),
      onHostCommand('returnPoppedDeckCard', ({ cardData }) => {
        returnCardsToDeck(serverStateRef.current, [cardData], true);

        updateStateAndBroadcast(prev => appendMoveAndEvent(
          withDeckCount(prev, serverStateRef.current),
          {
            action: 'HOST_RETURN_BATCH',
            from: 'playStack',
            to: 'deckTop',
            cards: [cardData],
          },
          { timestamp: Date.now(), type: 'HOST_RETURN_BATCH' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('drawDeckCardToTable', () => {
        const [drawnCard] = drawFromDeck(serverStateRef.current, 1);
        if (!drawnCard) return;

        updateStateAndBroadcast(prev => appendMoveAndEvent(
          appendPlayStackBatch(withDeckCount(prev, serverStateRef.current), [drawnCard]),
          {
            action: 'HOST_DRAW_TO_TABLE',
            from: 'deck',
            to: 'playStack',
            cards: [drawnCard],
          },
          { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [drawnCard] },
        ));
      }),
      onHostCommand('revealDeckCardToTable', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendMoveAndEvent(
          appendPlayStackBatch(prev, [cardData]),
          {
            action: 'HOST_DRAW_TO_TABLE',
            from: 'deck',
            to: 'playStack',
            cards: [cardData],
          },
          { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('returnTableBatchToDeck', ({ toTop }) => {
        updateStateAndBroadcast(prev => {
          const { nextState, cards } = popPlayStackBatch(prev);
          if (cards.length === 0) return prev;

          returnCardsToDeck(serverStateRef.current, cards, toTop);
          return appendMoveAndEvent(
            withDeckCount(nextState, serverStateRef.current),
            {
              action: 'HOST_RETURN_BATCH',
              from: 'playStack',
              to: toTop ? 'deckTop' : 'deckBottom',
              cards,
            },
            { timestamp: Date.now(), type: 'HOST_RETURN_BATCH' as const, cards },
          );
        });
      }),
      onHostCommand('clearTableToDiscard', clearTableToDiscard),
      onHostCommand('takePublicCardForDrag', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendMoveAndEvent(
          removeCardsFromPlayStack(prev, [cardData]),
          {
            action: 'HOST_TAKE_FROM_TABLE',
            from: 'playStack',
            to: 'playStack',
            cards: [cardData],
          },
          { timestamp: Date.now(), type: 'HOST_TAKE_FROM_TABLE' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('returnPublicCardToTable', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendMoveAndEvent(
          appendPlayStackBatch(prev, [cardData]),
          {
            action: 'HOST_RETURN_TO_TABLE',
            from: 'playStack',
            to: 'playStack',
            cards: [cardData],
          },
          { timestamp: Date.now(), type: 'HOST_RETURN_TO_TABLE' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('discardPublicCard', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendMoveAndEvent(
          discardCards(prev, [cardData]),
          {
            action: 'HOST_DISCARD',
            from: 'playStack',
            to: 'discardPile',
            cards: [cardData],
          },
          { timestamp: Date.now(), type: 'HOST_DISCARD' as const, cards: [cardData] },
        ));
      }),
    ];

    return () => {
      for (const cleanup of cleanupTableEvents) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isCleaningUp = false;
    // If we're retrying after a full failure, attempt to reclaim the same ID
    const peer = targetIdRef.current ? new Peer(targetIdRef.current) : new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      if (isCleaningUp) return;
      targetIdRef.current = id;
      setPeerId(id);
      setStatus('ready');
    });

    peer.on('connection', (conn) => {
      if (isCleaningUp) return;
      // Clean up stale connection
      if (connectionsRef.current[conn.peer]) {
        connectionsRef.current[conn.peer].close();
      }
      connectionsRef.current[conn.peer] = conn;

      conn.on('data', (data: unknown) => {
        handleClientAction(conn.peer, data as ClientAction);
      });

      conn.on('close', () => {
        // Keep player state for potential reconnection on refresh
        delete connectionsRef.current[conn.peer];
        updateStateAndBroadcast(prev => {
          const player = prev.players[conn.peer];
          if (!player) return prev;
          return {
            ...prev,
            players: {
              ...prev.players,
              [conn.peer]: {
                ...player,
                online: false,
              },
            },
          };
        });
      });
    });

    peer.on('error', (err) => {
      if (isCleaningUp) return;
      const type = err.type as string;
      if (type === 'network' || type === 'server-error' || type === 'webrtc') {
        console.warn(`Non-fatal host error: ${type} - ${err.message}`);
        return;
      }
      if (type === 'peer-unavailable') {
        const curStatus = statusRef.current;
        if (curStatus === 'starting' && targetIdRef.current !== null) {
          // Retry with stale peer ID — auto-recover with a fresh ID
          console.warn(`Stale peer ID "${targetIdRef.current}" on retry, generating fresh ID`);
          targetIdRef.current = null;
          setRetryCount(prev => prev + 1);
          return;
        }
        if (curStatus === 'reconnecting') {
          console.warn(`Reconnect failed with stale ID, falling back to fresh session`);
          targetIdRef.current = null;
          setStatus('failed');
          setError('Reconnection failed. Retry with fresh ID.');
          return;
        }
        // First-connection peer-unavailable (e.g., ID collision)
        setStatus('failed');
        setError(`Peer ID unavailable: ${err.message}`);
        return;
      }
      setStatus('failed');
      setError(`Host connection error: ${err.message}`);
    });

    peer.on('disconnected', () => {
      if (isCleaningUp) return;
      setStatus('reconnecting');
      // Add a small delay before reconnecting to prevent tight loops on total network loss
      setTimeout(() => {
        if (!peer.destroyed && !isCleaningUp) {
          // Calling peer.reconnect() reinitializes the socket and correctly triggers
          // the 'open' event again upon success, cleanly resolving the reconnect UI state.
          peer.reconnect();
        }
      }, 1000);
    });

    peer.on('close', () => {
      if (isCleaningUp) return;
      setStatus('failed');
      setError('Connection to signaling server closed.');
    });

    return () => {
      isCleaningUp = true;
      peer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  return {
    status,
    error,
    retry,
    peerId,
    gameState,
    updateStateAndBroadcast,
    serverStateRef,
    resetGame,
    clearTableToDiscard,
    dealCardsToPlayer,
    assignSeat,
    approvePendingAction,
    rejectPendingAction,
    seatIds: SEAT_IDS,
  };
}
