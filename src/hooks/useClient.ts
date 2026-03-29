import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Card, GameState, ClientAction, HostMessage } from '../types';

export function useClient(hostId: string, playerName: string) {
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);

  const connRef = useRef<DataConnection | null>(null);

  useEffect(() => {
    if (!hostId) return;

    const peer = new Peer();

    peer.on('open', () => {
      const conn = peer.connect(hostId);
      connRef.current = conn;

      conn.on('open', () => {
        setConnected(true);
        conn.send({ type: 'JOIN', payload: { name: playerName } });
      });

      conn.on('data', (data: unknown) => {
        const message = data as HostMessage;
        switch (message.type) {
          case 'STATE_UPDATE':
            setGameState(message.payload);
            break;
          case 'RECEIVE_CARDS':
            setHand(prev => [...prev, ...message.payload]);
            break;
          case 'REMOVE_CARDS':
            setHand(prev => prev.filter(c => !message.payload.includes(c.id)));
            break;
          case 'ERROR':
            console.error('Server error:', message.payload);
            break;
        }
      });

      conn.on('close', () => {
        setConnected(false);
      });
    });

    return () => {
      peer.destroy();
    };
  }, [hostId, playerName]);

  const sendAction = (action: ClientAction) => {
    if (connRef.current && connected) {
      connRef.current.send(action);
    }
  };

  const drawCard = (count: number = 1) => {
    sendAction({ type: 'DRAW', payload: { count } });
  };

  const playCards = (cards: Card[]) => {
    // Optimistic UI update
    setHand(prev => prev.filter(c => !cards.map(sc => sc.id).includes(c.id)));
    sendAction({ type: 'PLAY', payload: { cards } });
  };

  const returnCards = (cards: Card[], toTop: boolean = true) => {
    setHand(prev => prev.filter(c => !cards.map(sc => sc.id).includes(c.id)));
    sendAction({ type: 'RETURN', payload: { cards, toTop } });
  };

  const takeBackCards = (cards: Card[]) => {
    // Reverts play action - server will send back cards
    sendAction({ type: 'TAKE_BACK', payload: { cards } });
  };

  const drawFromOther = (targetPlayerId: string, cardId: string) => {
    sendAction({ type: 'DRAW_FROM_OTHER', payload: { targetPlayerId, cardId } });
  };

  return {
    connected,
    gameState,
    hand,
    drawCard,
    playCards,
    returnCards,
    takeBackCards,
    drawFromOther,
  };
}
