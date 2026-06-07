import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Card, GameState, ClientAction, HostMessage } from '../types';
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
        const msg: HostMessage = { type: 'REMOVE_CARDS', payload: cardIds };
        connectionsRef.current[clientId]?.send(msg);
      }
    }

    updateStateAndBroadcast(prev => appendEvent(
      resetPublicCardState(prev, serverStateRef.current),
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
      return appendEvent(nextState, { timestamp: Date.now(), type: 'HOST_CLEAR_TABLE' as const, cards });
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
            connectionsRef.current[clientId]?.send({ type: 'ERROR', payload: `Name "${playerName}" is already taken.` });
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
            delete newPlayers[existingPeerId];
            newPlayers[clientId] = { id: clientId, name: playerName, handCount: existingHand.length };
            return appendEvent({
              ...prev,
              players: newPlayers,
            }, { timestamp: Date.now(), type: 'JOIN' as const, playerName });
          });

          // Send existing cards back to reconnecting client
          if (existingHand.length > 0) {
            connectionsRef.current[clientId]?.send({ type: 'RECEIVE_CARDS', payload: existingHand });
          }
          break;
        }

        // Duplicate name check for genuinely new connections
        const isNameTaken = Object.values(gameStateRef.current.players).some(p => p.name === playerName);
        if (isNameTaken) {
          connectionsRef.current[clientId]?.send({ type: 'ERROR', payload: `Name "${playerName}" is already taken.` });
          break;
        }

        nameToPeerIdRef.current[playerName] = clientId;
        createPlayerHand(serverStateRef.current, clientId);
        updateStateAndBroadcast(prev => appendEvent({
          ...prev,
          players: {
            ...prev.players,
            [clientId]: { id: clientId, name: playerName, handCount: getPlayerHandCount(serverStateRef.current, clientId) }
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
        connectionsRef.current[clientId]?.send(msg);

        updateStateAndBroadcast(prev => appendEvent(
          withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, clientId),
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

        updateStateAndBroadcast(prev => appendEvent(
          {
            ...withPlayerHandCount(prev, serverStateRef.current, clientId),
            playStack: nextState.playStack,
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

        updateStateAndBroadcast(prev => appendEvent(
          withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, clientId),
          { timestamp: Date.now(), type: 'RETURN' as const, playerName: prev.players[clientId]?.name, cards: returnedCards },
        ));
        break;
      }
      case 'DRAW_FROM_OTHER': {
        const { targetPlayerId, cardId } = action.payload;
        const stolenCard = moveCardBetweenHands(serverStateRef.current, targetPlayerId, clientId, cardId || undefined);
        if (!stolenCard) break;

        history[clientId].push({ type: 'DRAW_FROM_OTHER', payload: { stolenCard, targetPlayerId } });

        const removeMsg: HostMessage = { type: 'REMOVE_CARDS', payload: [stolenCard.id] };
        connectionsRef.current[targetPlayerId]?.send(removeMsg);

        const receiveMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: [stolenCard] };
        connectionsRef.current[clientId]?.send(receiveMsg);

        updateStateAndBroadcast(prev => appendEvent(
          withPlayerHandCounts(prev, serverStateRef.current, [clientId, targetPlayerId]),
          { timestamp: Date.now(), type: 'DRAW_FROM_OTHER' as const, playerName: prev.players[clientId]?.name, targetPlayerName: prev.players[targetPlayerId]?.name, count: 1 },
        ));
        break;
      }
      case 'CLEAR_TABLE': {
        clearTableToDiscard();
        break;
      }
      case 'UNDO_LAST_ACTION': {
        const clientHistory = history[clientId] || [];
        const lastAction = clientHistory.pop();
        if (!lastAction) break;

        switch (lastAction.type) {
          case 'DRAW': {
            const { drawnCards } = lastAction.payload;
            const drawnIds = drawnCards.map((c: Card) => c.id);
            removeCardsFromHand(serverStateRef.current, clientId, drawnIds);
            returnCardsToDeck(serverStateRef.current, drawnCards, true);
            // Notify client to remove
            const removeMsg: HostMessage = { type: 'REMOVE_CARDS', payload: drawnIds };
            connectionsRef.current[clientId]?.send(removeMsg);

            updateStateAndBroadcast(prev => appendEvent(
              withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, clientId),
              { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name },
            ));
            break;
          }
          case 'PLAY': {
            const playCards: Card[] = lastAction.payload.cards;
            const { nextState, cards: validCards } = movePlayStackTopCardsToHand(
              serverStateRef.current,
              gameStateRef.current,
              clientId,
              playCards,
            );

            if (validCards.length > 0) {
              const receiveMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: validCards };
              connectionsRef.current[clientId]?.send(receiveMsg);
            }

            updateStateAndBroadcast(prev => appendEvent(
              {
                ...withPlayerHandCount(prev, serverStateRef.current, clientId),
                playStack: nextState.playStack,
              },
              { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name },
            ));
            break;
          }
          case 'DRAW_FROM_OTHER': {
            const { stolenCard, targetPlayerId: targetId } = lastAction.payload;
            removeCardsFromHand(serverStateRef.current, clientId, [stolenCard.id]);
            addCardsToHand(serverStateRef.current, targetId, [stolenCard]);
            // Notify current player to remove
            const removeCardMsg: HostMessage = { type: 'REMOVE_CARDS', payload: [stolenCard.id] };
            connectionsRef.current[clientId]?.send(removeCardMsg);
            // Notify target to receive
            const receiveCardMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: [stolenCard] };
            connectionsRef.current[targetId]?.send(receiveCardMsg);

            updateStateAndBroadcast(prev => appendEvent(
              withPlayerHandCounts(prev, serverStateRef.current, [clientId, targetId]),
              { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name },
            ));
            break;
          }
          case 'RETURN': {
            const returnedCards: Card[] = lastAction.payload.cards;
            const returnedIds = returnedCards.map(c => c.id);
            removeCardsFromDeck(serverStateRef.current, returnedIds);
            addCardsToHand(serverStateRef.current, clientId, returnedCards);
            // Send cards back to client
            const receiveCardsMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: returnedCards };
            connectionsRef.current[clientId]?.send(receiveCardsMsg);

            updateStateAndBroadcast(prev => appendEvent(
              withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, clientId),
              { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name },
            ));
            break;
          }
        }
        break;
      }
    }
  };

  // Keep track of our established ID so we can recover the exact same room if we need a full recreation
  const targetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const cleanupTableEvents = [
      onHostCommand('dealCardToPlayer', ({ playerId, cardData }) => {
        const cards = cardData ? [cardData] : drawFromDeck(serverStateRef.current, 1);
        if (cards.length === 0 || !addCardsToHand(serverStateRef.current, playerId, cards)) return;

        const msg: HostMessage = { type: 'RECEIVE_CARDS', payload: cards };
        connectionsRef.current[playerId]?.send(msg);

        updateStateAndBroadcast(prev => appendEvent(
          withPlayerHandCount(withDeckCount(prev, serverStateRef.current), serverStateRef.current, playerId),
          { timestamp: Date.now(), type: 'HOST_DEAL' as const, playerName: prev.players[playerId]?.name, cards },
        ));
      }),
      onHostCommand('popDeckCardForDrag', ({ callback }) => {
        const [popped] = drawFromDeck(serverStateRef.current, 1);
        if (!popped) {
          callback(null);
          return;
        }

        updateStateAndBroadcast(prev => appendEvent(
          withDeckCount(prev, serverStateRef.current),
          { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [popped] },
        ));
        callback(popped);
      }),
      onHostCommand('returnPoppedDeckCard', ({ cardData }) => {
        returnCardsToDeck(serverStateRef.current, [cardData], true);

        updateStateAndBroadcast(prev => appendEvent(
          withDeckCount(prev, serverStateRef.current),
          { timestamp: Date.now(), type: 'HOST_RETURN_BATCH' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('drawDeckCardToTable', () => {
        const [drawnCard] = drawFromDeck(serverStateRef.current, 1);
        if (!drawnCard) return;

        updateStateAndBroadcast(prev => appendEvent(
          appendPlayStackBatch(withDeckCount(prev, serverStateRef.current), [drawnCard]),
          { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [drawnCard] },
        ));
      }),
      onHostCommand('revealDeckCardToTable', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendEvent(
          appendPlayStackBatch(prev, [cardData]),
          { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('returnTableBatchToDeck', ({ toTop }) => {
        updateStateAndBroadcast(prev => {
          const { nextState, cards } = popPlayStackBatch(prev);
          if (cards.length === 0) return prev;

          returnCardsToDeck(serverStateRef.current, cards, toTop);
          return appendEvent(
            withDeckCount(nextState, serverStateRef.current),
            { timestamp: Date.now(), type: 'HOST_RETURN_BATCH' as const, cards },
          );
        });
      }),
      onHostCommand('clearTableToDiscard', clearTableToDiscard),
      onHostCommand('takePublicCardForDrag', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendEvent(
          removeCardsFromPlayStack(prev, [cardData]),
          { timestamp: Date.now(), type: 'HOST_TAKE_FROM_TABLE' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('returnPublicCardToTable', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendEvent(
          appendPlayStackBatch(prev, [cardData]),
          { timestamp: Date.now(), type: 'HOST_RETURN_TO_TABLE' as const, cards: [cardData] },
        ));
      }),
      onHostCommand('discardPublicCard', ({ cardData }) => {
        updateStateAndBroadcast(prev => appendEvent(
          discardCards(prev, [cardData]),
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

  return { status, error, retry, peerId, gameState, updateStateAndBroadcast, serverStateRef, resetGame, clearTableToDiscard };
}
