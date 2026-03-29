import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Card, GameState, ClientAction, HostMessage } from '../types';
import { createDeck } from '../utils/deck';

export function useHost() {
  const [peerId, setPeerId] = useState<string>('');
  const [gameState, setGameState] = useState<GameState>({
    deckCount: 54,
    discardPile: [],
    playStack: [],
    players: {},
  });

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Record<string, DataConnection>>({});

  // Keep true deck and hands server-side
  const serverStateRef = useRef({
    deck: createDeck(),
    playerHands: {} as Record<string, Card[]>,
  });

  const broadcastState = (newState: GameState) => {
    const message: HostMessage = { type: 'STATE_UPDATE', payload: newState };
    Object.values(connectionsRef.current).forEach(conn => {
      conn.send(message);
    });
  };

  const updateStateAndBroadcast = (updater: (prev: GameState) => GameState) => {
    setGameState(prev => {
      const next = updater(prev);
      broadcastState(next);
      return next;
    });
  };

  const handleClientAction = (clientId: string, action: ClientAction) => {
    switch (action.type) {
      case 'JOIN': {
        serverStateRef.current.playerHands[clientId] = [];
        updateStateAndBroadcast(prev => ({
          ...prev,
          players: {
            ...prev.players,
            [clientId]: { id: clientId, name: action.payload.name, handCount: 0 }
          }
        }));
        break;
      }
      case 'DRAW': {
        const { count } = action.payload;
        const drawnCards = serverStateRef.current.deck.splice(0, count);

        serverStateRef.current.playerHands[clientId].push(...drawnCards);

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
          }
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

        updateStateAndBroadcast(prev => ({
          ...prev,
          playStack: [...prev.playStack, cards],
          players: {
            ...prev.players,
            [clientId]: {
              ...prev.players[clientId],
              handCount: serverStateRef.current.playerHands[clientId].length
            }
          }
        }));
        break;
      }
      case 'RETURN': {
        const { cards, toTop } = action.payload;

        // Remove from server hand
        const cardIds = cards.map(c => c.id);
        serverStateRef.current.playerHands[clientId] = serverStateRef.current.playerHands[clientId].filter(
          c => !cardIds.includes(c.id)
        );

        if (toTop) {
          serverStateRef.current.deck.unshift(...cards);
        } else {
          serverStateRef.current.deck.push(...cards);
        }

        updateStateAndBroadcast(prev => ({
          ...prev,
          deckCount: serverStateRef.current.deck.length,
          players: {
            ...prev.players,
            [clientId]: {
              ...prev.players[clientId],
              handCount: serverStateRef.current.playerHands[clientId].length
            }
          }
        }));
        break;
      }
      case 'TAKE_BACK': {
        const { cards } = action.payload;

        // We need to pop from playStack
        updateStateAndBroadcast(prev => {
          const newPlayStack = [...prev.playStack];
          // We assume taking back from top of playStack for simplicity
          // Finding the exact cards and removing them from stack
          const lastBatch = newPlayStack.pop() || [];

          const takenIds = cards.map(c => c.id);
          const remainingBatch = lastBatch.filter(c => !takenIds.includes(c.id));

          if (remainingBatch.length > 0) {
            newPlayStack.push(remainingBatch);
          }

          // Add to player hand server side
          serverStateRef.current.playerHands[clientId].push(...cards);

          // Send cards back to player
          const msg: HostMessage = { type: 'RECEIVE_CARDS', payload: cards };
          connectionsRef.current[clientId]?.send(msg);

          return {
            ...prev,
            playStack: newPlayStack,
            players: {
              ...prev.players,
              [clientId]: {
                ...prev.players[clientId],
                handCount: serverStateRef.current.playerHands[clientId].length
              }
            }
          };
        });
        break;
      }
      case 'DRAW_FROM_OTHER': {
        const { targetPlayerId, cardId } = action.payload;

        const targetHand = serverStateRef.current.playerHands[targetPlayerId];

        // if cardId is empty, draw a random card from target
        const actualCardIndex = cardId
          ? targetHand.findIndex(c => c.id === cardId)
          : Math.floor(Math.random() * targetHand.length);

        if (actualCardIndex !== -1) {
          const [stolenCard] = targetHand.splice(actualCardIndex, 1);
          serverStateRef.current.playerHands[clientId].push(stolenCard);

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
            }
          }));
        }
        break;
      }
    }
  };

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
    });

    peer.on('connection', (conn) => {
      connectionsRef.current[conn.peer] = conn;

      conn.on('data', (data: unknown) => {
        handleClientAction(conn.peer, data as ClientAction);
      });

      conn.on('close', () => {
        // Handle player disconnect
        setGameState(prev => {
          const newPlayers = { ...prev.players };
          delete newPlayers[conn.peer];
          return { ...prev, players: newPlayers };
        });
        delete connectionsRef.current[conn.peer];
      });
    });

    return () => {
      peer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { peerId, gameState, updateStateAndBroadcast, serverStateRef };
}
