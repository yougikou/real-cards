import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../hooks/useClient';
import type { Card, GameState, Suit } from '../types';
import { playCardSound } from '../utils/audio/playCard';
import { playDrawSound } from '../utils/audio/draw';
import { playReturnSound } from '../utils/audio/returnCard';
import { DEFAULT_SANDBOX_PACK } from '../config/tableConfig';

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
  none: '🃏',
};

const MOCK_HAND: Card[] = [
  { id: 'mock-1', suit: 'spades', rank: 'A' },
  { id: 'mock-2', suit: 'hearts', rank: 'K' },
  { id: 'mock-3', suit: 'spades', rank: '2' },
  { id: 'mock-4', suit: 'diamonds', rank: '10' },
  { id: 'mock-5', suit: 'clubs', rank: 'A' },
  { id: 'mock-6', suit: 'hearts', rank: '10' },
  { id: 'mock-7', suit: 'none', rank: 'JOKER' },
];

const MOCK_GAME_STATE: GameState = {
  deckCount: 42,
  discardPile: [],
  playStack: [
    [{ id: 'mock-history-0', suit: 'spades', rank: '2' }],
    [
      { id: 'mock-history-1', suit: 'hearts', rank: '3' },
      { id: 'mock-history-2', suit: 'diamonds', rank: '3' },
    ],
  ],
  players: {
    'mock-peer-1': { id: 'mock-peer-1', name: 'Alice', handCount: 5 },
    'mock-peer-2': { id: 'mock-peer-2', name: 'Bob', handCount: 3 },
  },
};

function isRedSuit(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds';
}

function cardTone(card: Card) {
  return isRedSuit(card.suit) ? 'text-red-600' : 'text-slate-900';
}

function deckCardTone(card: Card) {
  return isRedSuit(card.suit) ? 'text-red-500' : 'text-slate-900';
}

export default function Client() {
  const { hostId } = useParams<{ hostId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const playerName = searchParams.get('name') || 'Player';
  const isPreview = searchParams.get('preview') === 'true';

  const {
    status: realStatus,
    error,
    retry,
    gameState: realGameState,
    hand: realHand,
    peerId,
    drawCard,
    playCards,
    returnCards,
    takeBackCards,
    drawFromOther,
  } = useClient(hostId!, playerName);

  const [localHand, setLocalHand] = useState<Card[]>(MOCK_HAND);
  const [localGameState, setLocalGameState] = useState<GameState>(MOCK_GAME_STATE);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewOther, setViewOther] = useState<string | null>(null);
  const [stolenCardResult, setStolenCardResult] = useState<Card | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [recentlyDrawnCardIds, setRecentlyDrawnCardIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const status = isPreview ? 'connected' : realStatus;
  const hand = isPreview ? localHand : realHand;
  const activeGameState = isPreview ? localGameState : realGameState;

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2200);
  };

  useEffect(() => {
    setSelectedCards(prev => prev.filter(id => hand.some(card => card.id === id)));
  }, [hand]);

  const previousHandRef = useRef<Card[]>(hand);
  useEffect(() => {
    const previousHand = previousHandRef.current;
    const newCards = hand.filter(card => !previousHand.some(prev => prev.id === card.id));

    if (newCards.length > 0 && !viewOther) {
      const newCardIds = newCards.map(card => card.id);
      setRecentlyDrawnCardIds(prev => [...prev, ...newCardIds]);
      setToastMessage(`+${newCards.length} Card${newCards.length > 1 ? 's' : ''}`);
      window.setTimeout(() => {
        setRecentlyDrawnCardIds(prev => prev.filter(id => !newCardIds.includes(id)));
        setToastMessage(null);
      }, 2200);
    }

    previousHandRef.current = hand;
  }, [hand, viewOther]);

  const displayHand = useMemo(() => hand, [hand]);
  const latestPlayBatch = useMemo(() => activeGameState?.playStack[activeGameState.playStack.length - 1] ?? null, [activeGameState]);

  const toggleSelect = (cardId: string) => {
    setSelectedCards(prev => (prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]));
  };

  const handleDrawAction = () => {
    if (isDrawing) return;

    setIsDrawing(true);
    window.setTimeout(() => setIsDrawing(false), 300);

    if (navigator.vibrate) navigator.vibrate(15);
    playDrawSound();

    if (isPreview) {
      if (localGameState.deckCount > 0) {
        const newCard: Card = { id: `mock-drawn-${Date.now()}`, suit: 'spades', rank: '7' };
        setLocalHand(prev => [...prev, newCard]);
        setLocalGameState(prev => ({ ...prev, deckCount: prev.deckCount - 1 }));
        showToast('Drawn from deck');
      } else {
        showToast('Deck is empty');
      }
    } else {
      drawCard(1);
    }
  };

  const handlePlaySelected = () => {
    const cardsToPlay = displayHand.filter(card => selectedCards.includes(card.id));
    if (cardsToPlay.length === 0) return;

    if (navigator.vibrate) navigator.vibrate(20);
    playCardSound();

    if (isPreview) {
      setLocalHand(prev => prev.filter(card => !cardsToPlay.some(selected => selected.id === card.id)));
      setLocalGameState(prev => ({
        ...prev,
        playStack: [...prev.playStack, cardsToPlay],
      }));
      showToast(`Played ${cardsToPlay.length} card${cardsToPlay.length > 1 ? 's' : ''}`);
    } else {
      playCards(cardsToPlay);
    }

    setSelectedCards([]);
  };

  const handleReturnSelected = (toTop: boolean) => {
    const cardsToReturn = displayHand.filter(card => selectedCards.includes(card.id));
    if (cardsToReturn.length === 0) return;

    if (navigator.vibrate) navigator.vibrate(15);
    playReturnSound();

    if (isPreview) {
      setLocalHand(prev => prev.filter(card => !cardsToReturn.some(selected => selected.id === card.id)));
      setLocalGameState(prev => ({
        ...prev,
        deckCount: prev.deckCount + cardsToReturn.length,
      }));
      showToast(`Returned to deck ${toTop ? 'top' : 'bottom'}`);
    } else {
      returnCards(cardsToReturn, toTop);
    }

    setSelectedCards([]);
  };

  const handleTakeBack = () => {
    if (!activeGameState || activeGameState.playStack.length === 0) return;
    const topBatch = activeGameState.playStack[activeGameState.playStack.length - 1];

    if (isPreview) {
      setLocalGameState(prev => ({
        ...prev,
        playStack: prev.playStack.slice(0, -1),
      }));
      setLocalHand(prev => [...prev, ...topBatch]);
      showToast('Undo play');
    } else {
      takeBackCards(topBatch);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleHandGestureEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const isVertical = Math.abs(dy) >= Math.abs(dx);

    if (selectedCards.length > 0) {
      if (isVertical && dy < -50) {
        handlePlaySelected();
      } else if (isVertical && dy > 50) {
        handleReturnSelected(false);
      }
    } else if (isVertical && dy > 55) {
      handleDrawAction();
    }

    touchStartRef.current = null;
  };

  const handleActionDockGestureEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const isVertical = Math.abs(dy) >= Math.abs(dx);

    if (selectedCards.length > 0) {
      if (isVertical && dy < -50) {
        handlePlaySelected();
      } else if (isVertical && dy > 50) {
        handleReturnSelected(false);
      } else if (!isVertical && dx < -50) {
        handleReturnSelected(true);
      } else if (!isVertical && dx > 50) {
        handleReturnSelected(false);
      }
    } else if (isVertical && dy > 55) {
      handleDrawAction();
    }

    touchStartRef.current = null;
  };

  const renderCard = (card: Card, index = 0, total = 1) => {
    const isSelected = selectedCards.includes(card.id);
    const hasSelection = selectedCards.length > 0;
    const isRecentlyDrawn = recentlyDrawnCardIds.includes(card.id);
    const tone = cardTone(card);
    const suitIcon = SUIT_SYMBOLS[card.suit];
    const spread = total > 1 ? (index / (total - 1)) * 2 - 1 : 0;
    const fanTilt = spread * 7;
    const fanLift = Math.abs(spread) * 10;

    return (
      <button
        key={card.id}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleSelect(card.id);
        }}
        className={`relative aspect-[2/3] rounded-[1.25rem] bg-gradient-to-b from-white to-slate-100 shadow-[0_10px_24px_rgba(0,0,0,0.22)] border border-white/80 flex flex-col justify-between p-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-400/80 ${isSelected ? 'ring-4 ring-amber-400 z-30' : ''} ${hasSelection && !isSelected ? 'opacity-60 saturate-50' : ''} ${isRecentlyDrawn ? 'ring-4 ring-emerald-400 shadow-[0_0_24px_rgba(34,197,94,0.45)] z-20' : ''}`}
        style={{
          transform: `translateY(${fanLift + (isSelected ? -18 : 0)}px) rotate(${fanTilt}deg) scale(${isSelected ? 1.06 : hasSelection ? 0.96 : 1})`,
          zIndex: isSelected ? 40 : 10 + index,
          minWidth: '5.8rem',
        }}
      >
        {isSelected && (
          <div className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-amber-400 text-slate-950 border-2 border-slate-950 flex items-center justify-center text-sm font-black shadow-lg">
            {selectedCards.indexOf(card.id) + 1}
          </div>
        )}
        {isRecentlyDrawn && !isSelected && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black shadow-lg">
            NEW
          </div>
        )}

        <div className="flex items-start justify-between">
          <div className={`text-lg font-black leading-none ${tone}`}>{card.rank}</div>
          <div className={`text-[0.7rem] font-black uppercase tracking-[0.24em] ${isRedSuit(card.suit) ? 'text-red-500/80' : 'text-slate-500'}`}>
            {card.suit === 'none' ? 'wild' : card.suit}
          </div>
        </div>

        <div className={`self-center text-4xl leading-none ${tone}`}>{suitIcon}</div>

        <div className="flex items-end justify-between">
          <div className={`text-lg font-black leading-none rotate-180 ${tone}`}>{card.rank}</div>
          <div className={`text-xl leading-none rotate-180 ${tone}`}>{suitIcon}</div>
        </div>
      </button>
    );
  };

  const renderMiniCard = (card: Card) => {
    const tone = deckCardTone(card);
    const suitIcon = SUIT_SYMBOLS[card.suit];

    return (
      <div
        key={card.id}
        className="w-12 h-16 rounded-lg bg-white shadow-md border border-slate-300 flex flex-col justify-between p-1 flex-shrink-0"
      >
        <div className={`text-xs font-black leading-none ${tone}`}>{card.rank}</div>
        <div className={`text-lg self-center leading-none ${tone}`}>{suitIcon}</div>
      </div>
    );
  };

  if (status !== 'connected') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#020617_70%)] text-white p-5 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          {status === 'failed' ? (
            <div className="text-center">
              <div className="text-rose-400 text-2xl font-black mb-2">Connection Failed</div>
              <div className="text-slate-300 mb-5 text-sm leading-relaxed">{error}</div>
              <button
                onClick={retry}
                className="w-full rounded-2xl bg-rose-500/90 hover:bg-rose-500 text-white font-black py-3 shadow-lg active:scale-[0.98] transition-all"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-slate-100 text-2xl font-black mb-2">
                {status === 'retrying'
                  ? 'Retrying…'
                  : status === 'reconnecting'
                    ? 'Reconnecting…'
                    : 'Connecting to Host…'}
              </div>
              <div className="text-slate-400 text-sm">Room ID: {hostId}</div>
            </div>
          )}
        </div>

        <div className="mt-4 w-full max-w-sm rounded-[1.5rem] border border-cyan-400/20 bg-cyan-500/10 p-4 text-center">
          <div className="text-cyan-300 font-black text-sm uppercase tracking-[0.2em] mb-1">Preview Mode</div>
          <p className="text-xs text-cyan-100/80 mb-3">Open the client hand UI offline to test taps and swipes.</p>
          <button
            onClick={() => setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.set('preview', 'true');
              return next;
            })}
            className="w-full rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-3 shadow-lg active:scale-[0.98] transition-all"
          >
            Enter UI Preview
          </button>
        </div>
      </div>
    );
  }

  const targetPlayer = viewOther && activeGameState ? activeGameState.players[viewOther] : null;

  if (viewOther && targetPlayer) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_70%)] text-white p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              setViewOther(null);
              setStolenCardResult(null);
            }}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-sky-300 active:scale-[0.98] transition-all"
          >
            ← Back
          </button>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-white/45">Inspect Hand</div>
          <div className="w-16" />
        </div>

        {stolenCardResult ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
            <div className="text-3xl font-black text-emerald-400 mb-2">Card taken</div>
            <p className="text-slate-300 mb-6 max-w-xs">
              You randomly pulled this card from {targetPlayer.name}&apos;s hidden hand.
            </p>
            <div className="w-48 mb-8">{renderCard(stolenCardResult, 0, 1)}</div>
            <button
              onClick={() => {
                const stolenId = stolenCardResult.id;
                setStolenCardResult(null);
                setViewOther(null);
                setRecentlyDrawnCardIds(prev => [...prev, stolenId]);
                setToastMessage('+1 Card Stolen');
                window.setTimeout(() => {
                  setRecentlyDrawnCardIds(prev => prev.filter(id => id !== stolenId));
                  setToastMessage(null);
                }, 2200);
              }}
              className="w-full max-w-sm rounded-2xl bg-emerald-500 text-slate-950 font-black py-4 shadow-[0_0_24px_rgba(16,185,129,0.35)] active:scale-[0.98] transition-all"
            >
              Back to Hand
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-[1.5rem] border border-sky-400/20 bg-sky-500/10 p-4 mb-5 text-center">
              <div className="text-xl font-black text-white">{targetPlayer.name}&apos;s Hidden Hand</div>
              <div className="text-sm text-sky-100/80 mt-1">Tap a card back to randomly steal it.</div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 content-start">
              {Array.from({ length: targetPlayer.handCount }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(15);
                    playDrawSound();

                    if (isPreview) {
                      const newCard: Card = { id: `mock-stolen-${Date.now()}`, suit: 'none', rank: 'JOKER' };
                      setLocalHand(prev => [...prev, newCard]);
                      setLocalGameState(prev => {
                        const nextPlayers = { ...prev.players };
                        if (nextPlayers[viewOther]) {
                          nextPlayers[viewOther] = {
                            ...nextPlayers[viewOther],
                            handCount: Math.max(0, nextPlayers[viewOther].handCount - 1),
                          };
                        }
                        return { ...prev, players: nextPlayers };
                      });
                      setStolenCardResult(newCard);
                    } else {
                      drawFromOther(viewOther, '');
                      setViewOther(null);
                    }
                  }}
                  className="group relative aspect-[2/3] rounded-[1.1rem] border border-white/10 bg-[linear-gradient(135deg,_rgba(30,64,175,0.9),_rgba(15,23,42,0.95))] shadow-[0_16px_36px_rgba(0,0,0,0.35)] overflow-hidden active:scale-[0.98] transition-all"
                >
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top,_white_0%,_transparent_55%)]" />
                  <div className="relative h-full flex flex-col items-center justify-center">
                    <div className="text-white/30 text-4xl font-black mb-1">?</div>
                    <div className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Tap to Draw</div>
                  </div>
                </button>
              ))}
              {targetPlayer.handCount === 0 && (
                <div className="col-span-3 sm:col-span-4 text-center text-slate-500 mt-10">No cards in hand to steal.</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const totalStackCards = activeGameState?.playStack.reduce((acc, batch) => acc + batch.length, 0) ?? 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1e293b_0%,_#020617_60%)] text-white relative overflow-hidden">
      {toastMessage && (
        <div className="pointer-events-none absolute top-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="rounded-full border border-emerald-300/40 bg-emerald-500 px-5 py-2.5 text-sm font-black text-white shadow-[0_0_30px_rgba(34,197,94,0.45)] whitespace-nowrap">
            {toastMessage}
          </div>
        </div>
      )}

      {isPreview && (
        <div className="absolute top-4 right-4 z-40 rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-violet-200 backdrop-blur">
          Preview
        </div>
      )}

      {activeGameState && (
        <div className="sticky top-0 z-30 border-b border-white/5 bg-slate-950/55 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.7)]" />
              {status === 'connected' ? 'Live' : 'Syncing'}
            </div>

            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300">
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Deck <span className="text-white">{activeGameState.deckCount}</span>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                Discard <span className="text-white">{activeGameState.discardPile.length}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 pb-4 pt-4">
        {activeGameState && (
          <div className="mb-4 rounded-[1.5rem] border border-white/8 bg-white/5 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">Play Stack</div>
                <div className="text-sm text-white/70">{totalStackCards} cards on the table</div>
              </div>
              {latestPlayBatch && activeGameState.playStack.length > 0 && (
                <button
                  onClick={handleTakeBack}
                  className="rounded-full border border-amber-300/20 bg-amber-400/15 px-3 py-1.5 text-xs font-black text-amber-200 active:scale-[0.98] transition-all"
                >
                  Undo last play
                </button>
              )}
            </div>

            <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-[1.25rem] border border-dashed border-white/8 bg-slate-950/35 p-4">
              {activeGameState.playStack.length > 0 ? (
                <div className="relative h-36 w-56">
                  {activeGameState.playStack.slice(-3).map((batch, batchIndex) => {
                    const isTopBatch = batchIndex === activeGameState.playStack.slice(-3).length - 1;
                    const offset = batchIndex * 10;
                    return (
                      <div
                        key={`${batchIndex}-${batch[0]?.id ?? 'batch'}`}
                        className={`absolute inset-0 rounded-[1.25rem] border ${isTopBatch ? 'border-amber-300/50 bg-amber-400/10' : 'border-white/8 bg-white/5'} shadow-2xl`}
                        style={{
                          transform: `translate(${offset}px, ${-offset}px) rotate(${(batchIndex - 1) * 4}deg)`,
                        }}
                      >
                        <div className="flex h-full items-center justify-center gap-2 overflow-hidden rounded-[1.25rem] p-3">
                          {batch.map(renderMiniCard)}
                        </div>
                        {isTopBatch && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.24em] text-slate-950 shadow-lg">
                            Latest
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-white/35">
                  <div className="text-lg font-black uppercase tracking-[0.3em]">Empty Stack</div>
                  <div className="mt-2 text-xs text-white/25">{DEFAULT_SANDBOX_PACK.containers.playStack.emptyText}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeGameState && Object.keys(activeGameState.players).length > 1 && (
          <div className="mb-4 rounded-[1.5rem] border border-white/8 bg-white/5 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.2)] backdrop-blur-xl">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.3em] text-white/45">Other Hands</div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {Object.values(activeGameState.players)
                .filter(player => player.id !== peerId)
                .map(player => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setViewOther(player.id)}
                    className="w-32 flex-shrink-0 rounded-[1.2rem] border border-white/8 bg-slate-950/60 p-3 text-left shadow-lg active:scale-[0.98] transition-all"
                  >
                    <div className="text-sm font-black text-white truncate">{player.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{player.handCount} cards</div>
                    <div className="mt-3 text-[10px] font-black uppercase tracking-[0.24em] text-sky-300">Peek & draw</div>
                  </button>
                ))}
            </div>
          </div>
        )}

        <div
          className="mb-4 rounded-[1.75rem] border border-white/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.07),_rgba(255,255,255,0.03))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleHandGestureEnd}
        >
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">Your Hand</div>
              <div className="text-sm text-white/70">Tap cards to select. Swipe up to play.</div>
            </div>
            <div className="rounded-full border border-white/8 bg-slate-950/40 px-3 py-1.5 text-xs font-black text-white/85">
              {hand.length} cards
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-0 px-1 py-3">
              {displayHand.map((card, index) => (
                <div key={card.id} className="-ml-8 first:ml-0 first:pl-0" style={{ zIndex: index + 1 }}>
                  {renderCard(card, index, displayHand.length)}
                </div>
              ))}
            </div>
          </div>

          {hand.length === 0 && (
            <div className="rounded-[1.25rem] border border-dashed border-white/8 bg-slate-950/35 px-4 py-10 text-center text-white/35">
              No cards in hand. Swipe down to draw.
            </div>
          )}
        </div>

        <div
          className={`mt-auto rounded-[1.75rem] border ${selectedCards.length > 0 ? 'border-amber-300/25 bg-amber-400/10' : 'border-cyan-300/15 bg-cyan-500/8'} p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleActionDockGestureEnd}
        >
          {selectedCards.length > 0 ? (
            <div className="text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/80">
                {selectedCards.length} selected
              </div>
              <div className="mt-2 text-sm text-amber-50/90">Swipe up to play, left for deck top, right for deck bottom.</div>
              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/80">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">← Top</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">↑ Play</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Bottom →</span>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-200/70">Gesture Dock</div>
              <div className="mt-2 text-sm text-cyan-50/80">Swipe down here to draw a card.</div>
              <div className="mt-3 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100/60">Tap cards to build a play, then swipe.</div>
            </div>
          )}
        </div>
      </div>

      {selectedCards.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-[1.5rem] border border-white/8 bg-slate-950/70 px-4 py-3 text-center shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-white/45">Selection ready</div>
          <div className="mt-1 text-sm text-white/75">Gesture dock handles play and return. Tap a selected card to deselect.</div>
        </div>
      )}
    </div>
  );
}
