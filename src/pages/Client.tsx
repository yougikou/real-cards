import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../hooks/useClient';
import type { Card, GameEvent, GameState, Suit } from '../types';
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
  eventLog: [],
};

function isRedSuit(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds';
}

function cardTone(card: Card) {
  return isRedSuit(card.suit) ? 'text-red-600' : 'text-slate-900';
}

function cardToStr(card: Card) {
  return `${SUIT_SYMBOLS[card.suit]}${card.rank}`;
}

function formatCardList(cards: Card[], max = Infinity, andMoreTpl = '+{n} more') {
  if (cards.length === 0) return '';
  const visible = cards.slice(0, max);
  const parts = visible.map(cardToStr);
  if (cards.length > max) {
    parts.push(andMoreTpl.replace('{n}', String(cards.length - max)));
  }
  return parts.join(' ');
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Client() {
  const { hostId } = useParams<{ hostId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const { locale, setLocale } = useLocale();
  const [enteredName, setEnteredName] = useState('');

  const needsName = !searchParams.has('name') && !isPreview;

  if (needsName) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#020617_70%)] text-white p-5 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-white/5 backdrop-blur-xl p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="text-center">
            <div className="text-slate-100 text-2xl font-black mb-5">{t(locale, dict, 'client.enterName')}</div>
            <input
              type="text"
              value={enteredName}
              onChange={(e) => setEnteredName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && enteredName.trim()) {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('name', enteredName.trim());
                    return next;
                  });
                }
              }}
              placeholder={t(locale, dict, 'home.yourName')}
              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white text-base font-bold placeholder:text-white/40 outline-none focus:ring-2 focus:ring-amber-400/60 text-center mb-4"
              autoFocus
            />
            <button
              onClick={() => {
                if (enteredName.trim()) {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('name', enteredName.trim());
                    return next;
                  });
                }
              }}
              disabled={!enteredName.trim()}
              className="w-full rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t(locale, dict, 'client.joinGame')}
            </button>
            <div className="text-slate-400 text-sm mt-4">
              {t(locale, dict, 'client.roomId')}: {hostId}
            </div>
          </div>
        </div>

        <div className="mt-4 w-full max-w-sm rounded-[1.5rem] border border-cyan-400/20 bg-cyan-500/10 p-4 text-center">
          <div className="text-cyan-300 font-black text-sm uppercase tracking-[0.2em] mb-1">{t(locale, dict, 'client.previewMode')}</div>
          <p className="text-xs text-cyan-100/80 mb-3">{t(locale, dict, 'client.previewHint')}</p>
          <button
            onClick={() =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('preview', 'true');
                return next;
              })
            }
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
              <option key={code} value={code} className="bg-slate-800 text-white">
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const playerName = searchParams.get('name') || 'Player';
  return <ConnectedClient hostId={hostId!} playerName={playerName} isPreview={isPreview} />;
}

function ConnectedClient({ hostId, playerName, isPreview }: { hostId: string; playerName: string; isPreview: boolean }) {
  const [, setSearchParams] = useSearchParams();
  const { locale, setLocale } = useLocale();

  const {
    status: realStatus,
    error,
    retry,
    gameState: realGameState,
    hand: realHand,
    peerId,
    undoableActionCount,
    drawCard,
    playCards,
    returnCards,
    drawFromOther,
    clearTable,
    undoLastAction,
  } = useClient(hostId, playerName);

  const [localHand, setLocalHand] = useState<Card[]>(MOCK_HAND);
  const [localGameState, setLocalGameState] = useState<GameState>(MOCK_GAME_STATE);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewOther, setViewOther] = useState<string | null>(null);
  const [stolenCardResult, setStolenCardResult] = useState<Card | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [recentlyDrawnCardIds, setRecentlyDrawnCardIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [previewUndoCount, setPreviewUndoCount] = useState(0);
  const [showEventModal, setShowEventModal] = useState(false);
  const [localEventLog, setLocalEventLog] = useState<GameEvent[]>([]);
  const previewActionHistoryRef = useRef<{ type: string; payload: any }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const deckAreaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; pointerId: number; isDragging: boolean } | null>(null);
  const justPlayedRef = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const [dragOverPlayArea, setDragOverPlayArea] = useState(false);
  const [dragOverReturnTopArea, setDragOverReturnTopArea] = useState(false);
  const [dragOverReturnBottomArea, setDragOverReturnBottomArea] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const body = document.body;
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    return () => {
      body.style.overflow = '';
      body.style.overscrollBehavior = '';
    };
  }, []);

  const status = isPreview ? 'connected' : realStatus;
  const hand = isPreview ? localHand : realHand;
  const activeGameState = isPreview ? localGameState : realGameState;
  const eventLog = isPreview ? localEventLog : (activeGameState?.eventLog || []);

  const andMoreTpl = t(locale, dict, 'event.andMore');

  const formatEventDetail = (event: GameEvent) => {
    const pn = event.playerName || '';
    const target = event.targetPlayerName || '';
    const cards = event.cards || [];
    const count = event.count || cards.length || 0;
    const cardStr = formatCardList(cards, 10, andMoreTpl);
    switch (event.type) {
      case 'JOIN': return t(locale, dict, 'event.joined', { player: pn });
      case 'DRAW': return t(locale, dict, 'event.drawn', { player: pn, n: String(count) });
      case 'PLAY': return t(locale, dict, 'event.played', { player: pn, cards: cardStr });
      case 'RETURN': return t(locale, dict, 'event.returned', { player: pn, cards: cardStr });
      case 'DRAW_FROM_OTHER': return t(locale, dict, 'event.drewFromOther', { player: pn, target });
      case 'UNDO': return t(locale, dict, 'event.undone', { player: pn });
      case 'HOST_DRAW_TO_TABLE': return t(locale, dict, 'event.hostDrewToTable', { cards: cardStr });
      case 'HOST_DEAL': return t(locale, dict, 'event.hostDealt', { player: pn, cards: cardStr });
      case 'HOST_RETURN_BATCH': return cards.length > 0 && cards.length <= 3
        ? t(locale, dict, 'event.hostReturnedToTable', { cards: cardStr })
        : t(locale, dict, 'event.hostReturnedBatch', { n: String(cards.length) });
      case 'HOST_CLEAR_TABLE': return cards.length > 0 ? t(locale, dict, 'event.hostClearedTable', { n: String(cards.length) }) : t(locale, dict, 'event.reset');
      case 'HOST_DISCARD': return t(locale, dict, 'event.hostDiscarded', { cards: cardStr });
      case 'HOST_TAKE_FROM_TABLE': return t(locale, dict, 'event.hostTakenFromTable', { cards: cardStr });
      case 'HOST_RETURN_TO_TABLE': return t(locale, dict, 'event.hostReturnedToTable', { cards: cardStr });
      default: return '';
    }
  };

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
        setLocalEventLog(prev => [...prev, { timestamp: Date.now(), type: 'DRAW', playerName, count: 1 }]);
        previewActionHistoryRef.current.push({ type: 'DRAW', payload: { card: newCard } });
        setPreviewUndoCount(previewActionHistoryRef.current.length);
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
      setLocalEventLog(prev => [...prev, { timestamp: Date.now(), type: 'PLAY', playerName, cards: cardsToPlay }]);
      previewActionHistoryRef.current.push({ type: 'PLAY', payload: { cards: cardsToPlay } });
      setPreviewUndoCount(previewActionHistoryRef.current.length);
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
      setLocalEventLog(prev => [...prev, { timestamp: Date.now(), type: 'RETURN', playerName, cards: cardsToReturn }]);
      previewActionHistoryRef.current.push({ type: 'RETURN', payload: { cards: cardsToReturn } });
      setPreviewUndoCount(previewActionHistoryRef.current.length);
      showToast(toTop ? t(locale, dict, 'client.returnedTop') : t(locale, dict, 'client.returnedBottom'));
    } else {
      returnCards(cardsToReturn, toTop);
    }

    setSelectedCards([]);
  };

  const handleTakeBack = () => {
    if (isPreview) {
      const history = previewActionHistoryRef.current;
      const lastAction = history.pop();
      if (!lastAction) return;
      setPreviewUndoCount(history.length);
      setLocalEventLog(prev => [...prev, { timestamp: Date.now(), type: 'UNDO', playerName }]);

      switch (lastAction.type) {
        case 'DRAW':
          setLocalHand(prev => prev.filter(c => c.id !== lastAction.payload.card.id));
          setLocalGameState(prev => ({ ...prev, deckCount: prev.deckCount + 1 }));
          break;
        case 'PLAY':
          setLocalHand(prev => [...prev, ...lastAction.payload.cards]);
          setLocalGameState(prev => ({
            ...prev,
            playStack: prev.playStack.slice(0, -1),
          }));
          break;
        case 'RETURN':
          setLocalHand(prev => [...prev, ...lastAction.payload.cards]);
          setLocalGameState(prev => ({
            ...prev,
            deckCount: prev.deckCount - lastAction.payload.cards.length,
          }));
          break;
        case 'DRAW_FROM_OTHER':
          setLocalHand(prev => prev.filter(c => c.id !== lastAction.payload.card.id));
          setLocalGameState(prev => {
            const targetId = lastAction.payload.targetPlayerId;
            const nextPlayers = { ...prev.players };
            if (nextPlayers[targetId]) {
              nextPlayers[targetId] = {
                ...nextPlayers[targetId],
                handCount: nextPlayers[targetId].handCount + 1,
              };
            }
            return { ...prev, players: nextPlayers };
          });
          break;
      }
    } else {
      undoLastAction();
    }
    showToast(t(locale, dict, 'client.undone'));
  };

  const handleUndoConfirm = () => {
    setShowUndoConfirm(false);
    handleTakeBack();
  };

  const checkDropZones = (x: number, y: number) => {
    if (playAreaRef.current) {
      const rect = playAreaRef.current.getBoundingClientRect();
      setDragOverPlayArea(
        x >= rect.left && x <= rect.right &&
        y >= rect.top && y <= rect.bottom
      );
    } else {
      setDragOverPlayArea(false);
    }

    if (deckAreaRef.current) {
      const rect = deckAreaRef.current.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const midPoint = rect.left + rect.width / 2;
        if (x < midPoint) {
          setDragOverReturnTopArea(true);
          setDragOverReturnBottomArea(false);
        } else {
          setDragOverReturnTopArea(false);
          setDragOverReturnBottomArea(true);
        }
      } else {
        setDragOverReturnTopArea(false);
        setDragOverReturnBottomArea(false);
      }
    } else {
      setDragOverReturnTopArea(false);
      setDragOverReturnBottomArea(false);
    }
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
          if (justPlayedRef.current) {
            justPlayedRef.current = false;
            return;
          }
          e.stopPropagation();
          toggleSelect(card.id);
        }}
        onPointerDown={(e) => {
          if (!isSelected || !hasSelection) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
            isDragging: false,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;

          if (!dragRef.current.isDragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            dragRef.current.isDragging = true;
            setDragActive(true);
          }

          if (dragRef.current.isDragging) {
            setDragPos({ x: e.clientX, y: e.clientY });
            checkDropZones(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (!dragRef.current) return;

          if (dragRef.current.isDragging) {
            if (dragOverPlayArea) {
              justPlayedRef.current = true;
              handlePlaySelected();
            } else if (dragOverReturnTopArea) {
              justPlayedRef.current = true;
              handleReturnSelected(true);
            } else if (dragOverReturnBottomArea) {
              justPlayedRef.current = true;
              handleReturnSelected(false);
            }
            setDragActive(false);
            setDragOverPlayArea(false);
            setDragOverReturnTopArea(false);
            setDragOverReturnBottomArea(false);
          }

          try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          dragRef.current = null;
        }}
        className={`relative w-24 h-36 rounded-[0.625rem] bg-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] border border-slate-300 flex flex-col justify-between p-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-400/80 ${isSelected ? 'ring-4 ring-amber-400 z-30' : ''} ${hasSelection && !isSelected ? 'opacity-60 saturate-50' : ''} ${isRecentlyDrawn ? 'ring-4 ring-emerald-400 shadow-[0_0_24px_rgba(34,197,94,0.45)] z-20' : ''} ${dragActive && isSelected ? 'opacity-40 scale-95' : ''}`}
        style={{
          transform: `translateY(${fanLift + (isSelected ? -18 : 0)}px) rotate(${fanTilt}deg) scale(${isSelected ? 1.06 : hasSelection ? 0.96 : 1})`,
          zIndex: isSelected ? 40 : 10 + index,
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

        <div className="flex items-start">
          <div className="flex flex-col items-start">
            <div className={`text-lg font-black leading-none ${tone}`}>{card.rank}</div>
            <div className={`text-sm leading-none ${tone}`}>{suitIcon}</div>
          </div>
        </div>

        <div className={`self-center text-5xl leading-none ${tone}`}>{suitIcon}</div>

        <div className="flex items-end justify-end">
          <div className="flex flex-col items-end">
            <div className={`text-lg font-black leading-none rotate-180 ${tone}`}>{card.rank}</div>
            <div className={`text-sm leading-none rotate-180 ${tone}`}>{suitIcon}</div>
          </div>
        </div>
      </button>
    );
  };

  const renderPlayStackCard = (card: Card) => {
    const tone = cardTone(card);
    const suitIcon = SUIT_SYMBOLS[card.suit];

    return (
      <div
        key={card.id}
        className="relative w-16 h-24 rounded-[0.4rem] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.2)] border border-slate-300 flex flex-col justify-between p-1.5"
        style={{ zIndex: 10 }}
      >
        <div className="flex items-start">
          <div className="flex flex-col items-start">
            <div className={`text-xs font-black leading-none ${tone}`}>{card.rank}</div>
            <div className={`text-[9px] leading-none ${tone}`}>{suitIcon}</div>
          </div>
        </div>
        <div className="flex items-end justify-end">
          <div className="flex flex-col items-end">
            <div className={`text-xs font-black leading-none rotate-180 ${tone}`}>{card.rank}</div>
            <div className={`text-[9px] leading-none rotate-180 ${tone}`}>{suitIcon}</div>
          </div>
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
              <div className="flex gap-3">
                <button
                  onClick={retry}
                  className="flex-1 rounded-2xl bg-rose-500/90 hover:bg-rose-500 text-white font-black py-3 shadow-lg active:scale-[0.98] transition-all"
                >
                  {t(locale, dict, 'client.retry')}
                </button>
                <button
                  onClick={() => setSearchParams(prev => {
                    const next = new URLSearchParams(prev);
                    next.delete('name');
                    return next;
                  })}
                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-black py-3 shadow-lg active:scale-[0.98] transition-all"
                >
                  {t(locale, dict, 'client.changeName')}
                </button>
              </div>
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
      <div className="h-dvh bg-[radial-gradient(circle_at_top,_#0f172a_0%,_#020617_70%)] text-white p-4 flex flex-col overflow-hidden touch-none">
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
                      setLocalEventLog(prev => [...prev, { timestamp: Date.now(), type: 'DRAW_FROM_OTHER', playerName, count: 1, targetPlayerName: targetPlayer.name }]);
                      previewActionHistoryRef.current.push({
                        type: 'DRAW_FROM_OTHER',
                        payload: { card: newCard, targetPlayerId: viewOther }
                      });
                      setPreviewUndoCount(previewActionHistoryRef.current.length);
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
    <div ref={containerRef} className="h-dvh flex flex-col bg-[#07111f] text-white relative overflow-hidden touch-none overscroll-none select-none">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(14,165,233,0.08),transparent_30%),linear-gradient(to_bottom,rgba(2,6,23,0.1),rgba(2,6,23,0.3))]" />
      {toastMessage && (
        <div className="pointer-events-none absolute top-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="rounded-full border border-emerald-300/40 bg-emerald-500 px-5 py-2.5 text-sm font-black text-white shadow-[0_0_30px_rgba(34,197,94,0.45)] whitespace-nowrap">
            {toastMessage}
          </div>
        </div>
      )}

      {showUndoConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 mx-4 w-72 shadow-2xl">
            <div className="text-center">
              <div className="text-base font-black text-white mb-5">{t(locale, dict, 'client.undoConfirm')}</div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUndoConfirm(false)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-black text-white active:scale-[0.98] transition-all"
                >
                  {t(locale, dict, 'client.cancel')}
                </button>
                <button
                  onClick={handleUndoConfirm}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950 active:scale-[0.98] transition-all"
                >
                  {t(locale, dict, 'client.confirmUndo')}
                </button>
              </div>
            </div>
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
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-slate-200">
                <span className="h-2 w-2 inline-block rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.7)] mr-1.5" />
                {status === 'connected' ? t(locale, dict, 'host.live') : 'Syncing'}
              </div>
              {(isPreview
                ? previewUndoCount > 0
                : undoableActionCount > 0) && (
                <button
                  onClick={() => setShowUndoConfirm(true)}
                  className="rounded-full border border-amber-300/20 bg-amber-400/15 px-3 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-amber-200 active:scale-[0.95] transition-all whitespace-nowrap"
                >
                  {t(locale, dict, 'client.undoPlay')}
                </button>
              )}
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
            {/* Play stack - compact overlapping cards like host public table */}
            <div
              ref={playAreaRef}
              className={`min-h-0 flex-none h-[10rem] flex flex-col rounded-xl border-2 transition-all duration-200 ${
                dragActive
                  ? dragOverPlayArea
                    ? 'border-emerald-400/60 bg-emerald-500/10 shadow-[0_0_40px_rgba(52,211,153,0.15)]'
                    : 'border-white/5'
                  : 'border-transparent'
              }`}
            >
              <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <div className="text-xs text-white/60">{t(locale, dict, 'client.playStack')}</div>
                  {dragOverPlayArea && (
                    <div className="text-[10px] font-black text-emerald-300 animate-pulse">↓ {t(locale, dict, 'client.releaseToPlay')}</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {totalStackCards > 0 && (
                    <button
                      onClick={() => {
                        if (isPreview) {
                          const flattened = activeGameState.playStack.flat();
                          setLocalGameState(prev => ({
                            ...prev,
                            playStack: [],
                            discardPile: [...prev.discardPile, ...flattened],
                          }));
                          setLocalEventLog(prev => [...prev, { timestamp: Date.now(), type: 'HOST_CLEAR_TABLE' as const, cards: flattened }]);
                        } else {
                          clearTable();
                        }
                      }}
                      className="rounded-lg border border-rose-300/20 bg-rose-950/60 px-2 py-1 text-[10px] font-bold text-rose-200/80 active:scale-95 transition-all hover:bg-rose-900/70"
                    >
                      {t(locale, dict, 'tableConfig.playStackAction')}
                    </button>
                  )}
                  <div className="rounded-full border border-white/8 bg-slate-950/40 px-2.5 py-1 text-[10px] font-black text-white/85">
                    {totalStackCards} {t(locale, dict, 'client.cards')}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-none pb-2 touch-pan-x">
                <div className="flex h-full items-center gap-0 px-2 py-2">
                  {activeGameState.playStack.flat().length > 0 ? (
                    (() => {
                      const flatStack = activeGameState.playStack.flat();
                      const overlap = flatStack.length <= 1 ? 0 : 36; // expose ~28px per card for rank+suit
                      return flatStack.map((card, index) => (
                        <div key={card.id} style={{ marginLeft: index === 0 ? 0 : -overlap, zIndex: index + 1 }}>
                          {renderPlayStackCard(card)}
                        </div>
                      ));
                    })()
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

        {/* Deck & discard pile row */}
        {activeGameState && (
          <div ref={deckAreaRef} className="shrink-0 flex items-center gap-3 px-2">
            <button
              onClick={handleDrawAction}
              disabled={isDrawing}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 ${
                dragActive && dragOverReturnTopArea
                  ? 'border-amber-400/60 bg-amber-500/20 shadow-[0_0_40px_rgba(251,191,36,0.2)]'
                  : 'border-white/8 bg-slate-950/60'
              }`}
            >
              <div className="text-xs font-black text-white">{t(locale, dict, 'tableConfig.deck')}</div>
              <div className="rounded-md bg-white/10 px-2 py-0.5 text-sm font-black text-white">{activeGameState.deckCount}</div>
            </button>
            <div
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 shadow-lg transition-all ${
                dragActive && dragOverReturnBottomArea
                  ? 'border-amber-400/60 bg-amber-500/20 shadow-[0_0_40px_rgba(251,191,36,0.2)]'
                  : 'border-white/8 bg-slate-950/60'
              }`}
            >
              <div className="text-xs font-black text-white">{t(locale, dict, 'tableConfig.discard')}</div>
              <div className="rounded-md bg-white/10 px-2 py-0.5 text-sm font-black text-white">{activeGameState.discardPile.length}</div>
            </div>
          </div>
        )}

        <div
          className={`min-h-0 flex-none h-[14.5rem] flex flex-col`}
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
            <div>
              <div className="text-xs text-white/60">手牌区</div>
            </div>
            <div className="rounded-full border border-white/8 bg-slate-950/40 px-2.5 py-1 text-[10px] font-black text-white/85">
              {hand.length} {t(locale, dict, 'client.cards')}
            </div>
          </div>

          {hand.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-none pb-2 touch-pan-x">
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

      </div>

      {/* Event feed bar */}
      {activeGameState && (
        <button
          onClick={() => setShowEventModal(true)}
          className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-t border-white/8 bg-slate-950/85 text-xs text-white/60 active:scale-[0.98] transition-all"
        >
          <span className="rounded bg-white/8 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{t(locale, dict, 'event.feedTitle')}</span>
          {eventLog.length > 0 ? (
            <span key={eventLog[eventLog.length - 1].timestamp} className="truncate animate-in fade-in slide-in-from-bottom-1 duration-300">
              {formatEventDetail(eventLog[eventLog.length - 1])}
            </span>
          ) : (
            <span className="text-white/30 italic">{t(locale, dict, 'event.empty')}</span>
          )}
          <span className="ml-auto shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] font-black text-white/40">{eventLog.length}</span>
        </button>
      )}

      {/* Event log modal */}
      {showEventModal && (
        <div className="absolute inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/8">
            <div className="text-sm font-black text-white">{t(locale, dict, 'event.modalTitle')}</div>
            <button
              onClick={() => setShowEventModal(false)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black text-white/70 active:scale-[0.95] transition-all"
            >
              {t(locale, dict, 'event.close')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {eventLog.length > 0 ? (
              <div className="divide-y divide-white/5">
                {[...eventLog].reverse().map((event, i) => (
                  <div key={event.timestamp + '-' + i} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="shrink-0 mt-0.5 text-[10px] font-mono text-white/30 min-w-[3rem]">{formatTime(event.timestamp)}</span>
                    <span className="text-xs text-white/80 leading-relaxed">{formatEventDetail(event)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32">
                <span className="text-xs text-white/30 italic">{t(locale, dict, 'event.empty')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {dragActive && (
        <div
          className="pointer-events-none fixed z-[9999] flex items-center justify-center"
          style={{ left: dragPos.x - 40, top: dragPos.y - 60 }}
        >
          <div className="w-20 h-28 rounded-lg bg-amber-400 border-2 border-amber-300 shadow-2xl flex flex-col items-center justify-center">
            <div className="text-slate-950 text-xl font-black">{selectedCards.length}</div>
            <div className="text-slate-950 text-[8px] font-bold uppercase tracking-wider mt-0.5">{t(locale, dict, 'client.cards')}</div>
          </div>
          {selectedCards.length > 1 && (
            <div className="absolute -right-1.5 -bottom-1.5 w-6 h-6 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center border border-white/20 shadow-lg">
              {selectedCards.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
