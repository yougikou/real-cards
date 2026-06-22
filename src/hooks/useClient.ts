import { useState, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Card, GameState, ClientAction, HostMessage, MoveLedgerEntry, PendingAction } from '../types';

const PUBLIC_CONTAINERS = new Set(['deck', 'deckTop', 'deckBottom', 'playStack', 'discardPile']);

function getUndoConfirmation(move: MoveLedgerEntry) {
  if (move.undoConfirmationMode) return move.undoConfirmationMode;
  if (move.counterpartyPlayerId) return 'counterparty';
  if (PUBLIC_CONTAINERS.has(move.from) || PUBLIC_CONTAINERS.has(move.to)) return 'host';
  return 'none';
}

function countUndoableMoves(state: GameState, playerName: string) {
  return state.moveLedger.filter(move => (
    !move.undone &&
    !move.undoOf &&
    move.reversible !== false &&
    getUndoConfirmation(move) !== 'locked' &&
    move.actorName === playerName
  )).length;
}

export function useClient(hostId: string, playerName: string) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed' | 'retrying' | 'reconnecting'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [undoableActionCount, setUndoableActionCount] = useState(0);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingAction[]>([]);

  const connRef = useRef<DataConnection | null>(null);

  const retry = () => {
    setStatus('retrying');
    setError(null);
    setRetryCount(prev => prev + 1);
  };

  useEffect(() => {
    if (!hostId) return;
    let isCleaningUp = false;

    const peer = new Peer();

    // Timeout to catch connection hangs
    const timeout = setTimeout(() => {
      if (isCleaningUp) return;
      setStatus('failed');
      setError('Connection timed out. Host might be offline or ID is incorrect.');
      peer.destroy();
    }, 10000);

    peer.on('open', (id) => {
      if (isCleaningUp) return;
      setPeerId(id);
      const conn = peer.connect(hostId);
      connRef.current = conn;

      conn.on('open', () => {
        if (isCleaningUp) return;
        clearTimeout(timeout);
        setStatus('connected');
        conn.send({ type: 'JOIN', payload: { name: playerName } });
      });

      conn.on('data', (data: unknown) => {
        if (isCleaningUp) return;
        const message = data as HostMessage;
        switch (message.type) {
          case 'STATE_UPDATE':
            setGameState(message.payload);
            setUndoableActionCount(countUndoableMoves(message.payload, playerName));
            break;
          case 'RECEIVE_CARDS':
            setHand(prev => {
              const existingIds = new Set(prev.map(c => c.id));
              const newCards = message.payload.filter(c => !existingIds.has(c.id));
              if (newCards.length === 0) return prev;
              return [...prev, ...newCards];
            });
            break;
          case 'REMOVE_CARDS':
            setHand(prev => prev.filter(c => !message.payload.includes(c.id)));
            break;
          case 'ERROR':
            clearTimeout(timeout);
            conn.close();
            setStatus('failed');
            setError(message.payload);
            break;
          case 'CONFIRMATION_REQUEST':
            setPendingConfirmations(prev => {
              if (prev.some(action => action.id === message.payload.id)) return prev;
              return [...prev, message.payload];
            });
            break;
        }
      });

      conn.on('close', () => {
        if (isCleaningUp) return;
        setStatus('failed');
        setError('Connection to host closed.');
      });

      conn.on('error', (err) => {
        if (isCleaningUp) return;
        setStatus('failed');
        setError(`Connection error: ${err.message}`);
      });
    });

    peer.on('error', (err) => {
      if (isCleaningUp) return;

      const type = err.type as string;
      // peer-unavailable is fatal for the client trying to join a specific host room
      if (type === 'network' || type === 'webrtc') {
        console.warn(`Non-fatal client error: ${type} - ${err.message}`);
        return;
      }

      clearTimeout(timeout);
      setStatus('failed');
      setError(`Peer connection error: ${err.message}`);
    });

    peer.on('disconnected', () => {
      if (isCleaningUp) return;
      clearTimeout(timeout);
      setStatus('reconnecting');
      setTimeout(() => {
        if (!peer.destroyed && !isCleaningUp) {
          peer.reconnect();
        }
      }, 1000);
    });

    return () => {
      isCleaningUp = true;
      clearTimeout(timeout);
      peer.destroy();
    };
  }, [hostId, playerName, retryCount]);

  const sendAction = (action: ClientAction) => {
    if (connRef.current && status === 'connected') {
      try {
        connRef.current.send(action);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown send failure';
        setStatus('failed');
        setError(`Action failed to send. Please retry or resync: ${message}`);
        return false;
      }
    }
    setError('Action was not sent because the client is not connected.');
    return false;
  };

  const drawCard = (count: number = 1) => {
    sendAction({ type: 'DRAW', payload: { count } });
  };

  const playCards = (cards: Card[]) => {
    if (sendAction({ type: 'PLAY', payload: { cards } })) {
      setHand(prev => prev.filter(c => !cards.map(sc => sc.id).includes(c.id)));
    }
  };

  const returnCards = (cards: Card[], toTop: boolean = true) => {
    if (sendAction({ type: 'RETURN', payload: { cards, toTop } })) {
      setHand(prev => prev.filter(c => !cards.map(sc => sc.id).includes(c.id)));
    }
  };

  const drawFromOther = (targetPlayerId: string, cardId: string) => {
    sendAction({ type: 'DRAW_FROM_OTHER', payload: { targetPlayerId, cardId } });
  };

  const giveCards = (targetPlayerId: string, cards: Card[]) => {
    sendAction({ type: 'GIVE_CARD', payload: { targetPlayerId, cards } });
  };

  const clearTable = () => {
    sendAction({ type: 'CLEAR_TABLE', payload: {} });
  };

  const undoLastAction = () => {
    if (undoableActionCount === 0) return;
    sendAction({ type: 'UNDO_LAST_ACTION', payload: {} });
  };

  const respondToPendingAction = (pendingActionId: string, approved: boolean) => {
    setPendingConfirmations(prev => prev.filter(action => action.id !== pendingActionId));
    sendAction({ type: 'RESPOND_PENDING_ACTION', payload: { pendingActionId, approved } });
  };

  const reorderHand = (cards: Card[]) => {
    const nextIds = new Set(cards.map(card => card.id));
    setHand(prev => {
      const missingCards = prev.filter(card => !nextIds.has(card.id));
      return [...cards, ...missingCards];
    });
  };

  return {
    status,
    error,
    retry,
    gameState,
    hand,
    peerId,
    pendingConfirmations,
    undoableActionCount,
    drawCard,
    playCards,
    returnCards,
    drawFromOther,
    giveCards,
    clearTable,
    undoLastAction,
    reorderHand,
    respondToPendingAction,
  };
}
