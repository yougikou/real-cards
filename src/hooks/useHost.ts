import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Card, GameState, ClientAction, HostMessage } from '../types';
import { createDeck } from '../utils/deck';

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
    serverStateRef.current.deck = createDeck();

    Object.keys(serverStateRef.current.playerHands).forEach(clientId => {
      const hand = serverStateRef.current.playerHands[clientId];
      if (hand.length > 0) {
        const cardIds = hand.map(c => c.id);
        const msg: HostMessage = { type: 'REMOVE_CARDS', payload: cardIds };
        connectionsRef.current[clientId]?.send(msg);
      }
      serverStateRef.current.playerHands[clientId] = [];
    });

    updateStateAndBroadcast(prev => {
      const newPlayers = { ...prev.players };
      Object.keys(newPlayers).forEach(clientId => {
        newPlayers[clientId] = {
          ...newPlayers[clientId],
          handCount: 0
        };
      });

      return {
        ...prev,
        deckCount: serverStateRef.current.deck.length,
        playStack: [],
        discardPile: [],
        players: newPlayers,
        eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_CLEAR_TABLE' as const }]
      };
    });

    window.dispatchEvent(new Event('table-reset'));
  };

  // Keep true deck and hands server-side
  const serverStateRef = useRef({
    deck: createDeck(),
    playerHands: {} as Record<string, Card[]>,
  });

  // Per-client action history for undo
  const clientActionHistoryRef = useRef<Record<string, { type: string; payload: any }[]>>({});

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
          if (serverStateRef.current.playerHands[existingPeerId]) {
            serverStateRef.current.playerHands[clientId] = serverStateRef.current.playerHands[existingPeerId];
            delete serverStateRef.current.playerHands[existingPeerId];
          }
          if (clientActionHistoryRef.current[existingPeerId]) {
            clientActionHistoryRef.current[clientId] = clientActionHistoryRef.current[existingPeerId];
            delete clientActionHistoryRef.current[existingPeerId];
          }
          nameToPeerIdRef.current[playerName] = clientId;

          const existingHand = serverStateRef.current.playerHands[clientId] || [];
          updateStateAndBroadcast(prev => {
            const newPlayers = { ...prev.players };
            delete newPlayers[existingPeerId];
            newPlayers[clientId] = { id: clientId, name: playerName, handCount: existingHand.length };
            return {
              ...prev,
              players: newPlayers,
              eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'JOIN' as const, playerName }]
            };
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
        serverStateRef.current.playerHands[clientId] = [];
        updateStateAndBroadcast(prev => ({
          ...prev,
          players: {
            ...prev.players,
            [clientId]: { id: clientId, name: playerName, handCount: 0 }
          },
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'JOIN' as const, playerName }]
        }));
        break;
      }
      case 'DRAW': {
        const { count } = action.payload;
        const drawnCards = serverStateRef.current.deck.splice(0, count);

        serverStateRef.current.playerHands[clientId].push(...drawnCards);

        history[clientId].push({ type: 'DRAW', payload: { drawnCards } });

        // Send cards to player
        const msg: HostMessage = { type: 'RECEIVE_CARDS', payload: drawnCards };
        connectionsRef.current[clientId]?.send(msg);

        updateStateAndBroadcast(prev => ({
          ...prev,
          deckCount: serverStateRef.current.deck.length,
          players: {
            ...prev.players,
            [clientId]: {
              ...prev.players[clientId],
              handCount: serverStateRef.current.playerHands[clientId].length
            }
          },
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'DRAW' as const, playerName: prev.players[clientId]?.name, count }]
        }));
        break;
      }
      case 'PLAY': {
        const { cards } = action.payload;

        // Remove from server hand
        const cardIds = cards.map(c => c.id);
        serverStateRef.current.playerHands[clientId] = serverStateRef.current.playerHands[clientId].filter(
          c => !cardIds.includes(c.id)
        );

        history[clientId].push({ type: 'PLAY', payload: { cards } });

        updateStateAndBroadcast(prev => ({
          ...prev,
          playStack: [...prev.playStack, cards],
          players: {
            ...prev.players,
            [clientId]: {
              ...prev.players[clientId],
              handCount: serverStateRef.current.playerHands[clientId].length
            }
          },
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'PLAY' as const, playerName: prev.players[clientId]?.name, cards }]
        }));
        break;
      }
      case 'RETURN': {
        const { cards, toTop } = action.payload;

        // Remove from server hand
        const returnCardIds = cards.map(c => c.id);
        serverStateRef.current.playerHands[clientId] = serverStateRef.current.playerHands[clientId].filter(
          c => !returnCardIds.includes(c.id)
        );

        if (toTop) {
          serverStateRef.current.deck.unshift(...cards);
        } else {
          serverStateRef.current.deck.push(...cards);
        }

        history[clientId].push({ type: 'RETURN', payload: { cards, toTop } });

        updateStateAndBroadcast(prev => ({
          ...prev,
          deckCount: serverStateRef.current.deck.length,
          players: {
            ...prev.players,
            [clientId]: {
              ...prev.players[clientId],
              handCount: serverStateRef.current.playerHands[clientId].length
            }
          },
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'RETURN' as const, playerName: prev.players[clientId]?.name, cards }]
        }));
        break;
      }
      case 'DRAW_FROM_OTHER': {
        const { targetPlayerId, cardId } = action.payload;

        const targetHand = serverStateRef.current.playerHands[targetPlayerId];

        // if cardId is empty, draw a random card from target
        const actualCardIndex = cardId && targetHand.length > 0
          ? targetHand.findIndex(c => c.id === cardId)
          : targetHand.length > 0
            ? Math.floor(Math.random() * targetHand.length)
            : -1;

        if (actualCardIndex !== -1) {
          const [stolenCard] = targetHand.splice(actualCardIndex, 1);
          serverStateRef.current.playerHands[clientId].push(stolenCard);

          history[clientId].push({ type: 'DRAW_FROM_OTHER', payload: { stolenCard, targetPlayerId } });

          // Notify target to remove
          const removeMsg: HostMessage = { type: 'REMOVE_CARDS', payload: [stolenCard.id] };
          connectionsRef.current[targetPlayerId]?.send(removeMsg);

          // Notify actor to receive
          const receiveMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: [stolenCard] };
          connectionsRef.current[clientId]?.send(receiveMsg);

          updateStateAndBroadcast(prev => ({
            ...prev,
            players: {
              ...prev.players,
              [clientId]: { ...prev.players[clientId], handCount: serverStateRef.current.playerHands[clientId].length },
              [targetPlayerId]: { ...prev.players[targetPlayerId], handCount: targetHand.length },
            },
            eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'DRAW_FROM_OTHER' as const, playerName: prev.players[clientId]?.name, targetPlayerName: prev.players[targetPlayerId]?.name, count: 1 }]
          }));
        }
        break;
      }
      case 'CLEAR_TABLE': {
        updateStateAndBroadcast(prev => {
          if (prev.playStack.length === 0) return prev;
          const flattenedStack = prev.playStack.flat();
          return {
            ...prev,
            playStack: [],
            discardPile: [...prev.discardPile, ...flattenedStack],
            eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_CLEAR_TABLE' as const, cards: flattenedStack }]
          };
        });
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
            // Remove from player's hand
            serverStateRef.current.playerHands[clientId] = serverStateRef.current.playerHands[clientId].filter(
              (c: Card) => !drawnIds.includes(c.id)
            );
            // Return to deck top
            serverStateRef.current.deck.unshift(...drawnCards);
            // Notify client to remove
            const removeMsg: HostMessage = { type: 'REMOVE_CARDS', payload: drawnIds };
            connectionsRef.current[clientId]?.send(removeMsg);

            updateStateAndBroadcast(prev => ({
              ...prev,
              deckCount: serverStateRef.current.deck.length,
              players: {
                ...prev.players,
                [clientId]: {
                  ...prev.players[clientId],
                  handCount: serverStateRef.current.playerHands[clientId].length
                }
              },
              eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name }]
            }));
            break;
          }
          case 'PLAY': {
            const playCards: Card[] = lastAction.payload.cards;
            const takenIds = playCards.map(c => c.id);
            const snapPlayStack = gameStateRef.current.playStack;
            const newPlayStack = [...snapPlayStack];
            const lastBatch = newPlayStack.pop() || [];
            const validCards = playCards.filter(c => lastBatch.some(lc => lc.id === c.id));

            if (validCards.length === 0) {
              if (lastBatch.length > 0) {
                newPlayStack.push(lastBatch);
              }
            } else {
              serverStateRef.current.playerHands[clientId].push(...validCards);
              const receiveMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: validCards };
              connectionsRef.current[clientId]?.send(receiveMsg);
              const remainingBatch = lastBatch.filter(c => !takenIds.includes(c.id));
              if (remainingBatch.length > 0) {
                newPlayStack.push(remainingBatch);
              }
            }

            updateStateAndBroadcast(prev => ({
              ...prev,
              playStack: newPlayStack,
              players: {
                ...prev.players,
                [clientId]: {
                  ...prev.players[clientId],
                  handCount: serverStateRef.current.playerHands[clientId].length
                }
              },
              eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name }]
            }));
            break;
          }
          case 'DRAW_FROM_OTHER': {
            const { stolenCard, targetPlayerId: targetId } = lastAction.payload;
            // Remove from current player's hand
            serverStateRef.current.playerHands[clientId] = serverStateRef.current.playerHands[clientId].filter(
              (c: Card) => c.id !== stolenCard.id
            );
            // Give back to target
            serverStateRef.current.playerHands[targetId].push(stolenCard);
            // Notify current player to remove
            const removeCardMsg: HostMessage = { type: 'REMOVE_CARDS', payload: [stolenCard.id] };
            connectionsRef.current[clientId]?.send(removeCardMsg);
            // Notify target to receive
            const receiveCardMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: [stolenCard] };
            connectionsRef.current[targetId]?.send(receiveCardMsg);

            updateStateAndBroadcast(prev => ({
              ...prev,
              players: {
                ...prev.players,
                [clientId]: {
                  ...prev.players[clientId],
                  handCount: serverStateRef.current.playerHands[clientId].length
                },
                [targetId]: {
                  ...prev.players[targetId],
                  handCount: serverStateRef.current.playerHands[targetId].length
                }
              },
              eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name }]
            }));
            break;
          }
          case 'RETURN': {
            const returnedCards: Card[] = lastAction.payload.cards;
            const returnedIds = returnedCards.map(c => c.id);
            // Remove from deck by ID
            serverStateRef.current.deck = serverStateRef.current.deck.filter(
              (c: Card) => !returnedIds.includes(c.id)
            );
            // Return to player's hand
            serverStateRef.current.playerHands[clientId].push(...returnedCards);
            // Send cards back to client
            const receiveCardsMsg: HostMessage = { type: 'RECEIVE_CARDS', payload: returnedCards };
            connectionsRef.current[clientId]?.send(receiveCardsMsg);

            updateStateAndBroadcast(prev => ({
              ...prev,
              deckCount: serverStateRef.current.deck.length,
              players: {
                ...prev.players,
                [clientId]: {
                  ...prev.players[clientId],
                  handCount: serverStateRef.current.playerHands[clientId].length
                }
              },
              eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'UNDO' as const, playerName: prev.players[clientId]?.name }]
            }));
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
    const handleHostDeal = (e: Event) => {
      const customEvent = e as CustomEvent<{ playerId: string, cardData?: Card }>;
      const { playerId, cardData } = customEvent.detail;

      if (!serverStateRef.current.playerHands[playerId]) return;

      let dealtCard: Card;
      if (cardData) {
        dealtCard = cardData;
      } else {
        if (serverStateRef.current.deck.length === 0) return;
        const [popped] = serverStateRef.current.deck.splice(0, 1);
        dealtCard = popped;
      }

      serverStateRef.current.playerHands[playerId].push(dealtCard);

      const msg: HostMessage = { type: 'RECEIVE_CARDS', payload: [dealtCard] };
      connectionsRef.current[playerId]?.send(msg);

      updateStateAndBroadcast(prev => ({
        ...prev,
        deckCount: serverStateRef.current.deck.length,
        players: {
          ...prev.players,
          [playerId]: {
            ...prev.players[playerId],
            handCount: serverStateRef.current.playerHands[playerId].length
          }
        },
        eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_DEAL' as const, playerName: prev.players[playerId]?.name, cards: [dealtCard] }]
      }));
    };

    const handleHostPopCard = (e: Event) => {
      const customEvent = e as CustomEvent<{ callback: (card: Card | null) => void }>;
      const { callback } = customEvent.detail;

      if (serverStateRef.current.deck.length === 0) {
        callback(null);
        return;
      }

      const [popped] = serverStateRef.current.deck.splice(0, 1);

      updateStateAndBroadcast(prev => ({
        ...prev,
        deckCount: serverStateRef.current.deck.length,
        eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [popped] }]
      }));
      callback(popped);
    };

    const handleHostReturnPoppedCard = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardData: Card }>;
      const { cardData } = customEvent.detail;

      serverStateRef.current.deck.unshift(cardData);

      updateStateAndBroadcast(prev => ({
        ...prev,
        deckCount: serverStateRef.current.deck.length,
        eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_RETURN_BATCH' as const, cards: [cardData] }]
      }));
    };

    const handleHostDrawToTable = () => {
      if (serverStateRef.current.deck.length === 0) return;
      const [drawnCard] = serverStateRef.current.deck.splice(0, 1);

      updateStateAndBroadcast(prev => ({
        ...prev,
        deckCount: serverStateRef.current.deck.length,
        playStack: [...prev.playStack, [drawnCard]],
        eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [drawnCard] }]
      }));
    };

    const handleHostDealToTable = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardData: Card }>;
      const { cardData } = customEvent.detail;

      updateStateAndBroadcast(prev => ({
        ...prev,
        playStack: [...prev.playStack, [cardData]],
        eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_DRAW_TO_TABLE' as const, cards: [cardData] }]
      }));
    };

    const handleHostReturnBatch = (e: Event) => {
      const customEvent = e as CustomEvent<{ toTop: boolean }>;
      const { toTop } = customEvent.detail;

      updateStateAndBroadcast(prev => {
        const newPlayStack = [...prev.playStack];
        if (newPlayStack.length === 0) return prev;

        const lastBatch = newPlayStack.pop() || [];

        if (toTop) {
          serverStateRef.current.deck.unshift(...lastBatch);
        } else {
          serverStateRef.current.deck.push(...lastBatch);
        }

        return {
          ...prev,
          deckCount: serverStateRef.current.deck.length,
          playStack: newPlayStack,
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_RETURN_BATCH' as const, cards: lastBatch }]
        };
      });
    };

    const handleHostClearTable = () => {
      updateStateAndBroadcast(prev => {
        if (prev.playStack.length === 0) return prev;

        const flattenedStack = prev.playStack.flat();

        return {
          ...prev,
          playStack: [],
          discardPile: [...prev.discardPile, ...flattenedStack],
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_CLEAR_TABLE' as const, cards: flattenedStack }]
        };
      });
    };

    const handleHostDragPublicCard = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardData: Card, x: number, y: number }>;
      const { cardData } = customEvent.detail;

      updateStateAndBroadcast(prev => {
        // Remove the card from playStack
        const newPlayStack = prev.playStack.map(batch =>
          batch.filter(c => c.id !== cardData.id)
        ).filter(batch => batch.length > 0);

        return {
          ...prev,
          playStack: newPlayStack,
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_TAKE_FROM_TABLE' as const, cards: [cardData] }]
        };
      });
    };

    const handleHostReturnPublicCard = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardData: Card }>;
      const { cardData } = customEvent.detail;

      updateStateAndBroadcast(prev => {
        return {
          ...prev,
          playStack: [...prev.playStack, [cardData]],
          eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_RETURN_TO_TABLE' as const, cards: [cardData] }]
        };
      });
    };

    window.addEventListener('host-deal-card', handleHostDeal);
    window.addEventListener('host-pop-card', handleHostPopCard);
    window.addEventListener('host-return-popped-card', handleHostReturnPoppedCard);
    window.addEventListener('host-draw-to-table', handleHostDrawToTable);
    window.addEventListener('host-return-batch', handleHostReturnBatch);
    window.addEventListener('host-clear-table', handleHostClearTable);
    window.addEventListener('host-deal-to-table', handleHostDealToTable);
    window.addEventListener('host-drag-public-card', handleHostDragPublicCard);
    window.addEventListener('host-return-public-card', handleHostReturnPublicCard);

    const handleHostDiscardCard = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardData: Card }>;
      const { cardData } = customEvent.detail;

      updateStateAndBroadcast(prev => ({
        ...prev,
        discardPile: [...prev.discardPile, cardData],
        eventLog: [...prev.eventLog, { timestamp: Date.now(), type: 'HOST_DISCARD' as const, cards: [cardData] }]
      }));
    };

    window.addEventListener('host-discard-card', handleHostDiscardCard);

    return () => {
      window.removeEventListener('host-deal-card', handleHostDeal);
      window.removeEventListener('host-pop-card', handleHostPopCard);
      window.removeEventListener('host-return-popped-card', handleHostReturnPoppedCard);
      window.removeEventListener('host-draw-to-table', handleHostDrawToTable);
      window.removeEventListener('host-return-batch', handleHostReturnBatch);
      window.removeEventListener('host-clear-table', handleHostClearTable);
      window.removeEventListener('host-deal-to-table', handleHostDealToTable);
      window.removeEventListener('host-drag-public-card', handleHostDragPublicCard);
      window.removeEventListener('host-return-public-card', handleHostReturnPublicCard);
      window.removeEventListener('host-discard-card', handleHostDiscardCard);
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

  return { status, error, retry, peerId, gameState, updateStateAndBroadcast, serverStateRef, resetGame };
}
