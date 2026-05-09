import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../hooks/useClient';
import type { Card, GameState, Suit } from '../types';
import { playCardSound } from '../utils/audio/playCard';
import { playDrawSound } from '../utils/audio/draw';
import { playReturnSound } from '../utils/audio/returnCard';
import { useLocale, t } from '../i18n/LocaleProvider';
import dict from '../i18n/translations';
import type { Locale } from '../i18n/LocaleProvider';

const LOCALES: { code: Locale; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
];

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

export default function Client() {
  const { hostId } = useParams<{ hostId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const playerName = searchParams.get('name') || 'Player';
  const isPreview = searchParams.get('preview') === 'true';
  const { locale, setLocale } = useLocale();

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
  const isUndoingRef = useRef(false);

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
      setToastMessage(t(locale, dict, 'client.plusCards', { n: String(newCards.length) }));
      window.setTimeout(() => {
        setRecentlyDrawnCardIds(prev => prev.filter(id => !newCardIds.includes(id)));
        setToastMessage(null);
      }, 2200);
    }

    previousHandRef.current = hand;
  }, [hand, viewOther, locale]);

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
        showToast(t(locale, dict, 'client.drawnToast'));
      } else {
        showToast(t(locale, dict, 'client.deckEmpty'));
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
      showToast(t(locale, dict, 'client.played', { n: String(cardsToPlay.length) }));
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
      showToast(toTop ? t(locale, dict, 'client.returnedTop') : t(locale, dict, 'client.returnedBottom'));
    } else {
      returnCards(cardsToReturn, toTop);
    }

    setSelectedCards([]);
  };

  const handleTakeBack = () => {
    if (!activeGameState || activeGameState.playStack.length === 0) return;
    if (isUndoingRef.current) return;
    const topBatch = activeGameState.playStack[activeGameState.playStack.length - 1];

    if (isPreview) {
      setLocalGameState(prev => ({
        ...prev,
        playStack: prev.playStack.slice(0, -1),
      }));
      setLocalHand(prev => [...prev, ...topBatch]);
      showToast(t(locale, dict, 'client.undone'));
    } else {
      isUndoingRef.current = true;
      takeBackCards(topBatch);
      setTimeout(() => { isUndoingRef.current = false; }, 500);
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

  const renderPlayStackCard = (card: Card, index = 0, total = 1) => {
    const tone = cardTone(card);
    const suitIcon = SUIT_SYMBOLS[card.suit];
    const spread = total > 1 ? (index / (total - 1)) * 2 - 1 : 0;
    const fanTilt = spread * 7;
    const fanLift = Math.abs(spread) * 10;

    return (
      <div
        key={card.id}
        className="relative aspect-[2/3] rounded-[1.25rem] bg-gradient-to-b from-white to-slate-100 shadow-[0_10px_24px_rgba(0,0,0,0.22)] border border-white/80 flex flex-col justify-between p-2"
        style={{
          transform: `translateY(${fanLift}px) rotate(${fanTilt}deg)`,
          zIndex: 10 + index,
          minWidth: '5.8rem',
        }}
      >
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
      </div>
    );
  };

  if (status !== 'connected') {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#020617_70%)] text-white p-5 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          {status === 'failed' ? (
            <div className="text-center">
              <div className="text-rose-400 text-2xl font-black mb-2">{t(locale, dict, 'client.connectionFailed')}</div>
              <div className="text-slate-300 mb-5 text-sm leading-relaxed">{error}</div>
              <button
                onClick={retry}
                className="w-full rounded-2xl bg-rose-500/90 hover:bg-rose-500 text-white font-black py-3 shadow-lg active:scale-[0.98] transition-all"
              >
                {t(locale, dict, 'client.retry')}
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-slate-100 text-2xl font-black mb-2">
                {status === 'retrying'
                  ? t(locale, dict, 'client.retrying')
                  : status === 'reconnecting'
                    ? t(locale, dict, 'client.reconnecting')
                    : t(locale, dict, 'client.connecting')}
              </div>
              <div className="text-slate-400 text-sm">{t(locale, dict, 'client.roomId')}: {hostId}</div>
            </div>
          )}
        </div>

        <div className="mt-4 w-full max-w-sm rounded-[1.5rem] border border-cyan-400/20 bg-cyan-500/10 p-4 text-center">
          <div className="text-cyan-300 font-black text-sm uppercase tracking-[0.2em] mb-1">{t(locale, dict, 'client.previewMode')}</div>
          <p className="text-xs text-cyan-100/80 mb-3">{t(locale, dict, 'client.previewHint')}</p>
          <button
            onClick={() => setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.set('preview', 'true');
              return next;
            })}
            className="w-full rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-3 shadow-lg active:scale-[0.98] transition-all"
          >
            {t(locale, dict, 'client.enterPreview')}
          </button>
        </div>
        <div className="mt-4">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white/80 appearance-none cursor-pointer outline-none hover:bg-white/15 transition-colors text-center"
          >
            {LOCALES.map(({ code, label }) => (
              <option key={code} value={code} className="bg-slate-800 text-white">{label}</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const targetPlayer = viewOther && activeGameState ? activeGameState.players[viewOther] : null;

  if (viewOther && targetPlayer) {
    return (
      <div className="h-dvh bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_70%)] text-white p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              setViewOther(null);
              setStolenCardResult(null);
            }}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-sky-300 active:scale-[0.98] transition-all"
          >
            {t(locale, dict, 'client.backToHand')}
          </button>
          <div className="text-xs font-black uppercase tracking-[0.25em] text-white/45">{t(locale, dict, 'client.inspectHand')}</div>
          <div className="w-16" />
        </div>

        {stolenCardResult ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
            <div className="text-3xl font-black text-emerald-400 mb-2">{t(locale, dict, 'client.cardTaken')}</div>
            <p className="text-slate-300 mb-6 max-w-xs">
              {t(locale, dict, 'client.stolenHint', { name: targetPlayer.name })}
            </p>
            <div className="w-48 mb-8">{renderCard(stolenCardResult, 0, 1)}</div>
            <button
              onClick={() => {
                const stolenId = stolenCardResult.id;
                setStolenCardResult(null);
                setViewOther(null);
                setRecentlyDrawnCardIds(prev => [...prev, stolenId]);
                setToastMessage(t(locale, dict, 'client.stolenToast'));
                window.setTimeout(() => {
                  setRecentlyDrawnCardIds(prev => prev.filter(id => id !== stolenId));
                  setToastMessage(null);
                }, 2200);
              }}
              className="w-full max-w-sm rounded-2xl bg-emerald-500 text-slate-950 font-black py-4 shadow-[0_0_24px_rgba(16,185,129,0.35)] active:scale-[0.98] transition-all"
            >
              {t(locale, dict, 'client.backToHand')}
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-[1.5rem] border border-sky-400/20 bg-sky-500/10 p-4 mb-5 text-center">
              <div className="text-xl font-black text-white">{t(locale, dict, 'client.hiddenHand', { name: targetPlayer.name })}</div>
              <div className="text-sm text-sky-100/80 mt-1">{t(locale, dict, 'client.tapToSteal')}</div>
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
                    <div className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">{t(locale, dict, 'client.tapToDraw')}</div>
                  </div>
                </button>
              ))}
              {targetPlayer.handCount === 0 && (
                <div className="col-span-3 sm:col-span-4 text-center text-slate-500 mt-10">{t(locale, dict, 'client.noCardsToSteal')}</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const totalStackCards = activeGameState?.playStack.reduce((acc, batch) => acc + batch.length, 0) ?? 0;

  return (
    <div className="h-dvh flex flex-col bg-[#07111f] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.08),transparent_30%),linear-gradient(to_bottom,rgba(2,6,23,0.1),rgba(2,6,23,0.3))]" />
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
        <div className="shrink-0 border-b border-white/5 bg-slate-950/55 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.7)]" />
              {status === 'connected' ? t(locale, dict, 'host.live') : 'Syncing'}
            </div>

            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300">
              <button
                onClick={handleDrawAction}
                disabled={isDrawing}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 cursor-pointer active:scale-[0.95] transition-all hover:bg-white/10 disabled:opacity-50"
              >
                {t(locale, dict, 'tableConfig.deck')} <span className="text-white">{activeGameState.deckCount}</span>
              </button>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                {t(locale, dict, 'tableConfig.discard')} <span className="text-white">{activeGameState.discardPile.length}</span>
              </div>
            </div>

            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="rounded border border-white/10 bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white/80 appearance-none cursor-pointer outline-none hover:bg-slate-700 transition-colors"
            >
              {LOCALES.map(({ code, label }) => (
                <option key={code} value={code} className="bg-slate-800 text-white">{label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pb-2 pt-2 gap-2">
        {activeGameState && (
          <>
            {/* Play stack - full size cards with horizontal scroll */}
            <div className="min-h-0 flex-1 rounded-[1.75rem] border border-white/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.07),_rgba(255,255,255,0.03))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl flex flex-col">
              <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">{t(locale, dict, 'tableConfig.playStackLabel')}</div>
                  <div className="text-xs text-white/60">{t(locale, dict, 'client.playStack')}</div>
                </div>
                <div className="flex items-center gap-2">
                  {latestPlayBatch && activeGameState.playStack.length > 0 && (
                    <button
                      onClick={handleTakeBack}
                      className="rounded-full border border-amber-300/20 bg-amber-400/15 px-2.5 py-1 text-[9px] font-black text-amber-200 active:scale-[0.98] transition-all"
                    >
                      {t(locale, dict, 'client.undoPlay')}
                    </button>
                  )}
                  <div className="rounded-full border border-white/8 bg-slate-950/40 px-2.5 py-1 text-[10px] font-black text-white/85">
                    {totalStackCards} {t(locale, dict, 'client.cards')}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-none pb-2">
                <div className="flex h-full items-end gap-0 px-1 py-2">
                  {activeGameState.playStack.flat().length > 0 ? (
                    activeGameState.playStack.flat().map((card, index, arr) => (
                      <div key={card.id} className="-ml-6 first:ml-0" style={{ zIndex: index + 1 }}>
                        {renderPlayStackCard(card, index, arr.length)}
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-1 items-center justify-center h-full">
                      <div className="rounded-[1.25rem] border border-dashed border-white/8 bg-slate-950/35 px-4 py-6 text-center text-white/35 w-full">
                        {t(locale, dict, 'tableConfig.playStackEmpty')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Other players compact row */}
            {Object.keys(activeGameState.players).length > 1 && (
              <div className="flex shrink-0 gap-1.5 overflow-x-hidden">
                {Object.values(activeGameState.players)
                  .filter(player => player.id !== peerId)
                  .map(player => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setViewOther(player.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/60 px-2.5 py-1 text-left shadow-lg active:scale-[0.98] transition-all"
                    >
                      <div className="text-xs font-black text-white truncate max-w-[5rem]">{player.name}</div>
                      <div className="text-[10px] text-slate-400">{player.handCount}{t(locale, dict, 'client.cards')}</div>
                      <div className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-300">{t(locale, dict, 'client.peekDraw')}</div>
                    </button>
                  ))}
              </div>
            )}
          </>
        )}

        <div
          className="min-h-0 flex-1 rounded-[1.75rem] border border-white/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.07),_rgba(255,255,255,0.03))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleHandGestureEnd}
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/45">{t(locale, dict, 'client.yourHand')}</div>
              <div className="text-xs text-white/60">{t(locale, dict, 'client.handHint')}</div>
            </div>
            <div className="rounded-full border border-white/8 bg-slate-950/40 px-2.5 py-1 text-[10px] font-black text-white/85">
              {hand.length} {t(locale, dict, 'client.cards')}
            </div>
          </div>

          {hand.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-none pb-2">
              <div className="flex h-full items-end gap-0 px-1 py-2">
                {displayHand.map((card, index) => (
                  <div key={card.id} className="-ml-6 first:ml-0 first:pl-0" style={{ zIndex: index + 1 }}>
                    {renderCard(card, index, displayHand.length)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center px-4 pb-4 min-h-0 flex-1">
              <div className="rounded-[1.25rem] border border-dashed border-white/8 bg-slate-950/35 px-4 py-6 text-center text-white/35 w-full">
                {t(locale, dict, 'client.noCards')}
              </div>
            </div>
          )}
        </div>

        {/* Play action bar for selected cards */}
        {selectedCards.length > 0 && (
          <div className="shrink-0 rounded-[1.5rem] border border-amber-300/25 bg-amber-400/10 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="flex items-center justify-center gap-3 text-center">
              <button
                onClick={() => handleReturnSelected(true)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/80 active:scale-[0.98] transition-all"
              >
                ← {t(locale, dict, 'client.swipeTop')}
              </button>
              <button
                onClick={handlePlaySelected}
                className="flex-1 rounded-xl bg-amber-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-950 shadow-lg active:scale-[0.98] transition-all"
              >
                ↑ {t(locale, dict, 'client.swipePlay')}
              </button>
              <button
                onClick={() => handleReturnSelected(false)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/80 active:scale-[0.98] transition-all"
              >
                {t(locale, dict, 'client.swipeBottom')} →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
