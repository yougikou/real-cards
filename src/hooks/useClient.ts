import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Card, GameState, ClientAction, HostMessage } from '../types';

export function useClient(hostId: string, playerName: string) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed' | 'retrying'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);

  const connRef = useRef<DataConnection | null>(null);

  const retry = () => {
    setStatus('retrying');
    setError(null);
    setRetryCount(prev => prev + 1);
  };

  useEffect(() => {
    if (!hostId) return;

    const peer = new Peer();

    // Timeout to catch connection hangs
    const timeout = setTimeout(() => {
      setStatus('failed');
      setError('Connection timed out. Host might be offline or ID is incorrect.');
      peer.destroy();
    }, 10000);

    peer.on('open', (id) => {
      setPeerId(id);
      const conn = peer.connect(hostId);
      connRef.current = conn;

      conn.on('open', () => {
        clearTimeout(timeout);
        setStatus('connected');
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
        setStatus('failed');
        setError('Connection to host closed.');
      });

      conn.on('error', (err) => {
        setStatus('failed');
        setError(`Connection error: ${err.message}`);
      });
    });

    peer.on('error', (err) => {
      clearTimeout(timeout);
      setStatus('failed');
      setError(`Peer connection error: ${err.message}`);
    });

    peer.on('disconnected', () => {
      clearTimeout(timeout);
      setStatus('failed');
      setError('Disconnected from peer server.');
    });

    return () => {
      clearTimeout(timeout);
      peer.destroy();
    };
  }, [hostId, playerName, retryCount]);

  const sendAction = (action: ClientAction) => {
    if (connRef.current && status === 'connected') {
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
    status,
    error,
    retry,
    gameState,
    hand,
    peerId,
    drawCard,
    playCards,
    returnCards,
    takeBackCards,
    drawFromOther,
  };
}
