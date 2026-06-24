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
import { DEFAULT_GAME_SETTINGS } from '../config/tableConfig';

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

const SUIT_ORDER: Record<Suit, number> = {
  spades: 0,
  hearts: 1,
  clubs: 2,
  diamonds: 3,
  none: 4,
};

const RANK_ORDER: Record<Card['rank'], number> = {
  A: 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
  '9': 8,
  '10': 9,
  J: 10,
  Q: 11,
  K: 12,
  JOKER: 13,
  CUSTOM: 14,
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

type PreviewActionHistoryEntry =
  | { type: 'DRAW'; payload: { cards: Card[] } }
  | { type: 'PLAY'; payload: { cards: Card[] } }
  | { type: 'RETURN'; payload: { cards: Card[] } }
  | { type: 'DRAW_FROM_OTHER'; payload: { card: Card; targetPlayerId: string } };

function eventTimestamp() {
  return Date.now();
}

const MOCK_GAME_STATE: GameState = {
  gameSettings: DEFAULT_GAME_SETTINGS,
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
    'mock-peer-1': { id: 'mock-peer-1', name: 'Alice', handCount: 5, seatId: 'player_top_1', online: true },
    'mock-peer-2': { id: 'mock-peer-2', name: 'Bob', handCount: 3, seatId: 'player_right_1', online: true },
  },
  eventLog: [],
  moveLedger: [],
  pendingActions: {},
};

function isRedSuit(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds';
}

function cardTone(card: Card) {
  return isRedSuit(card.suit) ? 'text-red-600' : 'text-slate-900';
}

function cardToStr(card: Card) {
  if (card.title) return card.title;
  return `${SUIT_SYMBOLS[card.suit]}${card.rank}`;
}

function getCardCornerLabel(card: Card) {
  if (!card.title) return card.rank;
  return card.category ? card.category.slice(0, 4).toUpperCase() : 'CARD';
}

function getCardCenterLabel(card: Card) {
  return card.title ?? SUIT_SYMBOLS[card.suit];
}

function getCardSubLabel(card: Card) {
  if (card.title) return card.tags?.slice(0, 2).join(' / ') ?? card.category ?? '';
  return SUIT_SYMBOLS[card.suit];
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

export function ConnectedClient({ hostId, playerName, isPreview }: { hostId: string; playerName: string; isPreview: boolean }) {
  const [, setSearchParams] = useSearchParams();
  const { locale, setLocale } = useLocale();

  const {
    status: realStatus,
    error,
    retry,
    gameState: realGameState,
    hand: realHand,
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
  } = useClient(isPreview ? '' : hostId, playerName);

  const [localHand, setLocalHand] = useState<Card[]>(MOCK_HAND);
  const [localGameState, setLocalGameState] = useState<GameState>(MOCK_GAME_STATE);
  const [selectedCardIds, setSelectedCards] = useState<string[]>([]);
  const [viewOther, setViewOther] = useState<string | null>(null);
  const [targetActionPlayerId, setTargetActionPlayerId] = useState<string | null>(null);
  const [stolenCardResult, setStolenCardResult] = useState<Card | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawCount, setDrawCount] = useState(1);
  const [recentlyDrawnCardIds, setRecentlyDrawnCardIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [previewUndoCount, setPreviewUndoCount] = useState(0);
  const [showEventModal, setShowEventModal] = useState(false);
  const [localEventLog, setLocalEventLog] = useState<GameEvent[]>([]);
  const previewActionHistoryRef = useRef<PreviewActionHistoryEntry[]>([]);
  const previewCardIdRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const deckAreaRef = useRef<HTMLDivElement>(null);
  const handScrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dragRef = useRef<{
    startX: number;
    startY: number;
    pointerId: number;
    sourceCardId: string;
    isDragging: boolean;
    mode: 'pending' | 'action' | 'reorder' | 'select';
    lastTargetCardId: string | null;
    longPressTimer: number | null;
  } | null>(null);
  const justPlayedRef = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const [isReorderingHand, setIsReorderingHand] = useState(false);
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  const [reorderTargetCardId, setReorderTargetCardId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!showEventModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowEventModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEventModal]);

  const status = isPreview ? 'connected' : realStatus;
  const hand = isPreview ? localHand : realHand;
  const activeGameState = isPreview ? localGameState : realGameState;
  const activeGameSettings = activeGameState?.gameSettings ?? DEFAULT_GAME_SETTINGS;
  const eventLog = isPreview ? localEventLog : (activeGameState?.eventLog || []);
  const activePendingConfirmation = isPreview ? null : pendingConfirmations[0] ?? null;

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
      case 'GIVE_CARD': return t(locale, dict, 'event.gaveCard', { player: pn, target, cards: cardStr });
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
      case 'SEAT_ASSIGNED': return t(locale, dict, 'event.seatAssigned', { player: pn, seat: event.seatId || t(locale, dict, 'host.unseated') });
      case 'PLAYER_REMOVED': return t(locale, dict, 'event.playerRemoved', { player: pn, n: String(count) });
      default: return '';
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2200);
  };

  const pendingConfirmationText = () => {
    if (!activePendingConfirmation) return '';
    if (activePendingConfirmation.type === 'UNDO') {
      return t(locale, dict, 'client.confirmUndoForPlayer', { name: activePendingConfirmation.requestedByName || '' });
    }
    if (activePendingConfirmation.move?.action === 'GIVE_CARD') {
      return t(locale, dict, 'client.confirmReceiveCards', {
        name: activePendingConfirmation.requestedByName || '',
        n: String(activePendingConfirmation.move.cards.length),
      });
    }
    return t(locale, dict, 'client.confirmTakeFromHand', { name: activePendingConfirmation.requestedByName || '' });
  };

  const handOrderRef = useRef<Record<string, number>>({});
  const nextHandOrderRef = useRef(0);
  const previousHandRef = useRef<Card[]>(hand);
  useEffect(() => {
    const previousHand = previousHandRef.current;
    const newCards = hand.filter(card => !previousHand.some(prev => prev.id === card.id));
    for (const card of hand) {
      if (handOrderRef.current[card.id] === undefined) {
        handOrderRef.current[card.id] = nextHandOrderRef.current;
        nextHandOrderRef.current += 1;
      }
    }

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
  const handCardIds = useMemo(() => new Set(hand.map(card => card.id)), [hand]);
  const selectedCards = useMemo(
    () => selectedCardIds.filter(id => handCardIds.has(id)),
    [handCardIds, selectedCardIds],
  );

  const applyHandOrder = (cards: Card[]) => {
    if (isPreview) {
      setLocalHand(cards);
      return;
    }
    reorderHand(cards);
  };

  const sortHand = (mode: 'suit' | 'rank' | 'drawn') => {
    const sorted = [...displayHand].sort((a, b) => {
      if (mode === 'drawn') {
        return (handOrderRef.current[a.id] ?? 0) - (handOrderRef.current[b.id] ?? 0);
      }
      if (mode === 'suit') {
        return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
      }
      return RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    });
    applyHandOrder(sorted);
    showToast(t(locale, dict, `client.sort${mode === 'suit' ? 'Suit' : mode === 'rank' ? 'Rank' : 'Drawn'}`));
  };

  const moveSelectedCards = (direction: -1 | 1) => {
    if (selectedCards.length === 0) return;
    const selectedSet = new Set(selectedCards);
    const next = [...displayHand];
    const indexes = direction < 0
      ? next.map((card, index) => ({ card, index })).filter(item => selectedSet.has(item.card.id))
      : next.map((card, index) => ({ card, index })).filter(item => selectedSet.has(item.card.id)).reverse();

    for (const { index } of indexes) {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length || selectedSet.has(next[targetIndex].id)) continue;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    }

    applyHandOrder(next);
  };

  const toggleSelect = (cardId: string) => {
    setSelectedCards(prev => (prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]));
  };

  const clearLongPressTimer = () => {
    if (dragRef.current?.longPressTimer) {
      window.clearTimeout(dragRef.current.longPressTimer);
      dragRef.current.longPressTimer = null;
    }
  };

  const cardIdAtPoint = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest<HTMLElement>('[data-hand-card-id]')?.dataset.handCardId ?? null;
  };

  const selectRangeToCard = (sourceCardId: string, targetCardId: string) => {
    const sourceIndex = displayHand.findIndex(card => card.id === sourceCardId);
    const targetIndex = displayHand.findIndex(card => card.id === targetCardId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const start = Math.min(sourceIndex, targetIndex);
    const end = Math.max(sourceIndex, targetIndex);
    const rangeIds = displayHand.slice(start, end + 1).map(card => card.id);
    setSelectedCards(prev => Array.from(new Set([...prev, ...rangeIds])));
  };

  const autoScrollHandAtEdge = (x: number) => {
    const scroller = handScrollerRef.current;
    if (!scroller) return;

    const rect = scroller.getBoundingClientRect();
    const edgeSize = 56;
    if (x < rect.left + edgeSize) {
      scroller.scrollLeft -= 18;
    } else if (x > rect.right - edgeSize) {
      scroller.scrollLeft += 18;
    }
  };

  const reorderCardsAtPoint = (sourceCardId: string, x: number, y: number) => {
    const dragState = dragRef.current;
    autoScrollHandAtEdge(x);
    const targetCardId = cardIdAtPoint(x, y);
    if (!dragState || !targetCardId || targetCardId === sourceCardId || dragState.lastTargetCardId === targetCardId) return;

    const selectedSet = new Set(selectedCards);
    const movingIds = selectedSet.has(sourceCardId) ? selectedCards : [sourceCardId];
    if (movingIds.includes(targetCardId)) return;

    const targetElement = cardRefs.current[targetCardId];
    const targetRect = targetElement?.getBoundingClientRect();
    if (!targetRect) return;

    const remaining = displayHand.filter(card => !movingIds.includes(card.id));
    const movingCards = displayHand.filter(card => movingIds.includes(card.id));
    const targetIndex = remaining.findIndex(card => card.id === targetCardId);
    if (targetIndex < 0 || movingCards.length === 0) return;

    const insertAfter = x > targetRect.left + targetRect.width / 2;
    const insertIndex = targetIndex + (insertAfter ? 1 : 0);
    const next = [
      ...remaining.slice(0, insertIndex),
      ...movingCards,
      ...remaining.slice(insertIndex),
    ];

    dragState.lastTargetCardId = targetCardId;
    setReorderTargetCardId(targetCardId);
    applyHandOrder(next);
  };

  const resetHandDragState = () => {
    clearLongPressTimer();
    setDragActive(false);
    setIsReorderingHand(false);
    setReorderTargetCardId(null);
    setDragOverPlayArea(false);
    setDragOverReturnTopArea(false);
    setDragOverReturnBottomArea(false);
    dragRef.current = null;
  };

  const handleDrawAction = () => {
    if (isDrawing) return;
    const count = Math.max(1, Math.min(drawCount, activeGameState?.deckCount ?? drawCount));

    setIsDrawing(true);
    window.setTimeout(() => setIsDrawing(false), 300);

    if (navigator.vibrate) navigator.vibrate(15);
    playDrawSound();

    if (isPreview) {
      if (localGameState.deckCount > 0) {
        const drawnCards = Array.from({ length: Math.min(count, localGameState.deckCount) }, () => {
          previewCardIdRef.current += 1;
          return { id: `mock-drawn-${previewCardIdRef.current}`, suit: 'spades' as const, rank: '7' as const };
        });
        setLocalHand(prev => [...prev, ...drawnCards]);
        setLocalGameState(prev => ({ ...prev, deckCount: prev.deckCount - drawnCards.length }));
        setLocalEventLog(prev => [...prev, { timestamp: eventTimestamp(), type: 'DRAW', playerName, count: drawnCards.length }]);
        previewActionHistoryRef.current.push({ type: 'DRAW', payload: { cards: drawnCards } });
        setPreviewUndoCount(previewActionHistoryRef.current.length);
        showToast(t(locale, dict, 'client.plusCards', { n: String(drawnCards.length) }));
      } else {
        showToast(t(locale, dict, 'client.deckEmpty'));
      }
    } else {
      drawCard(count);
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
      setLocalEventLog(prev => [...prev, { timestamp: eventTimestamp(), type: 'PLAY', playerName, cards: cardsToPlay }]);
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
      setLocalEventLog(prev => [...prev, { timestamp: eventTimestamp(), type: 'RETURN', playerName, cards: cardsToReturn }]);
      previewActionHistoryRef.current.push({ type: 'RETURN', payload: { cards: cardsToReturn } });
      setPreviewUndoCount(previewActionHistoryRef.current.length);
      showToast(toTop ? t(locale, dict, 'client.returnedTop') : t(locale, dict, 'client.returnedBottom'));
    } else {
      returnCards(cardsToReturn, toTop);
    }

    setSelectedCards([]);
  };

  const handleGiveSelected = (targetPlayerId: string) => {
    const cardsToGive = displayHand.filter(card => selectedCards.includes(card.id));
    if (cardsToGive.length === 0) return;

    if (navigator.vibrate) navigator.vibrate(15);

    if (isPreview) {
      const target = localGameState.players[targetPlayerId];
      setLocalHand(prev => prev.filter(card => !cardsToGive.some(selected => selected.id === card.id)));
      setLocalGameState(prev => {
        const nextPlayers = { ...prev.players };
        if (nextPlayers[targetPlayerId]) {
          nextPlayers[targetPlayerId] = {
            ...nextPlayers[targetPlayerId],
            handCount: nextPlayers[targetPlayerId].handCount + cardsToGive.length,
          };
        }
        return { ...prev, players: nextPlayers };
      });
      setLocalEventLog(prev => [...prev, { timestamp: eventTimestamp(), type: 'GIVE_CARD', playerName, targetPlayerName: target?.name, cards: cardsToGive, count: cardsToGive.length }]);
      showToast(t(locale, dict, 'client.gaveCards', { n: String(cardsToGive.length), name: target?.name || '' }));
    } else {
      giveCards(targetPlayerId, cardsToGive);
      showToast(t(locale, dict, 'client.waitingForAccept'));
    }

    setSelectedCards([]);
    setTargetActionPlayerId(null);
  };

  const handleTakeBack = () => {
    if (isPreview) {
      const history = previewActionHistoryRef.current;
      const lastAction = history.pop();
      if (!lastAction) return;
      setPreviewUndoCount(history.length);
      setLocalEventLog(prev => [...prev, { timestamp: eventTimestamp(), type: 'UNDO', playerName }]);

      switch (lastAction.type) {
        case 'DRAW':
          setLocalHand(prev => prev.filter(c => !lastAction.payload.cards.some(card => card.id === c.id)));
          setLocalGameState(prev => ({ ...prev, deckCount: prev.deckCount + lastAction.payload.cards.length }));
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
    const isReorderTarget = reorderTargetCardId === card.id;
    const tone = cardTone(card);
    const suitIcon = SUIT_SYMBOLS[card.suit];
    const cornerLabel = getCardCornerLabel(card);
    const centerLabel = getCardCenterLabel(card);
    const subLabel = getCardSubLabel(card);
    const isCustomCard = Boolean(card.title);
    const spread = total > 1 ? (index / (total - 1)) * 2 - 1 : 0;
    const fanTilt = spread * 7;
    const fanLift = Math.abs(spread) * 10;

    return (
      <button
        key={card.id}
        ref={(node) => {
          cardRefs.current[card.id] = node;
        }}
        data-hand-card-id={card.id}
        type="button"
        onClick={(e) => {
          if (justPlayedRef.current) {
            justPlayedRef.current = false;
            return;
          }
          e.stopPropagation();
          if (dragRef.current) return;
          setMultiSelectActive(false);
          toggleSelect(card.id);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const longPressTimer = window.setTimeout(() => {
            if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
            dragRef.current.mode = 'select';
            dragRef.current.isDragging = true;
            setMultiSelectActive(true);
            setSelectedCards(prev => (prev.includes(card.id) ? prev : [...prev, card.id]));
            if (navigator.vibrate) navigator.vibrate(10);
          }, 360);
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            pointerId: e.pointerId,
            sourceCardId: card.id,
            isDragging: false,
            mode: 'pending',
            lastTargetCardId: null,
            longPressTimer,
          };
        }}
        onPointerMove={(e) => {
          if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;

          if (!dragRef.current.isDragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            clearLongPressTimer();
            dragRef.current.isDragging = true;
            if (isSelected && hasSelection && Math.abs(dy) > Math.abs(dx) + 8) {
              dragRef.current.mode = 'action';
              setDragActive(true);
            } else {
              dragRef.current.mode = 'reorder';
              setIsReorderingHand(true);
              setSelectedCards(prev => (prev.includes(card.id) ? prev : [card.id]));
            }
          }

          if (dragRef.current.mode === 'select') {
            autoScrollHandAtEdge(e.clientX);
            const targetCardId = cardIdAtPoint(e.clientX, e.clientY);
            if (targetCardId) selectRangeToCard(dragRef.current.sourceCardId, targetCardId);
            return;
          }

          if (dragRef.current.mode === 'reorder') {
            reorderCardsAtPoint(dragRef.current.sourceCardId, e.clientX, e.clientY);
            return;
          }

          if (dragRef.current.mode === 'action') {
            setDragPos({ x: e.clientX, y: e.clientY });
            checkDropZones(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (!dragRef.current) return;

          clearLongPressTimer();

          if (dragRef.current.mode === 'action' && dragRef.current.isDragging) {
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
          } else if (dragRef.current.mode === 'select') {
            const targetCardId = cardIdAtPoint(e.clientX, e.clientY);
            if (targetCardId) selectRangeToCard(dragRef.current.sourceCardId, targetCardId);
            justPlayedRef.current = true;
          } else if (dragRef.current.mode === 'reorder') {
            reorderCardsAtPoint(dragRef.current.sourceCardId, e.clientX, e.clientY);
            justPlayedRef.current = true;
          }

          try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          resetHandDragState();
        }}
        onPointerCancel={(e) => {
          try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          resetHandDragState();
        }}
        className={`relative w-24 h-36 rounded-[0.625rem] bg-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] border border-slate-300 flex flex-col justify-between p-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-400/80 touch-none ${isSelected ? 'ring-4 ring-inset ring-amber-400 z-30' : ''} ${hasSelection && !isSelected ? 'opacity-60 saturate-50' : ''} ${isRecentlyDrawn ? 'ring-4 ring-inset ring-emerald-400 shadow-[0_0_24px_rgba(34,197,94,0.45)] z-20' : ''} ${dragActive && isSelected ? 'opacity-40 scale-95' : ''} ${isReorderingHand && isSelected ? 'shadow-[0_0_28px_rgba(251,191,36,0.45)]' : ''} ${isReorderTarget ? 'outline outline-2 outline-cyan-300 outline-offset-4' : ''}`}
        style={{
          transform: `translateY(${fanLift + (isSelected ? -18 : 0)}px) rotate(${fanTilt}deg) scale(${isSelected ? 1.06 : hasSelection ? 0.96 : 1})`,
          zIndex: isSelected ? 40 : 10 + index,
        }}
      >
        {isSelected && (
          <div className="absolute right-1 top-1 h-7 w-7 rounded-full bg-amber-400 text-slate-950 border-2 border-white flex items-center justify-center text-xs font-black shadow-lg">
            {selectedCards.indexOf(card.id) + 1}
          </div>
        )}
        {isRecentlyDrawn && !isSelected && (
          <div className="absolute left-1/2 top-1 -translate-x-1/2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black shadow-lg">
            NEW
          </div>
        )}

        <div className="flex items-start">
          <div className="flex flex-col items-start">
            <div className={`${isCustomCard ? 'max-w-[4.25rem] truncate text-[10px]' : 'text-lg'} font-black leading-none ${tone}`}>{cornerLabel}</div>
            <div className={`text-sm leading-none ${tone}`}>{suitIcon}</div>
          </div>
        </div>

        <div className={`self-center px-1 text-center font-black leading-tight ${tone} ${isCustomCard ? 'text-sm' : 'text-5xl'}`}>
          {centerLabel}
          {isCustomCard && subLabel && (
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{subLabel}</div>
          )}
        </div>

        <div className="flex items-end justify-end">
          <div className="flex flex-col items-end">
            <div className={`${isCustomCard ? 'max-w-[4.25rem] truncate text-[10px]' : 'text-lg'} font-black leading-none rotate-180 ${tone}`}>{cornerLabel}</div>
            <div className={`text-sm leading-none rotate-180 ${tone}`}>{suitIcon}</div>
          </div>
        </div>
      </button>
    );
  };

  const renderPlayStackCard = (card: Card) => {
    const tone = cardTone(card);
    const suitIcon = SUIT_SYMBOLS[card.suit];
    const cornerLabel = getCardCornerLabel(card);
    const centerLabel = getCardCenterLabel(card);
    const isCustomCard = Boolean(card.title);

    return (
      <div
        key={card.id}
        className="relative w-16 h-24 rounded-[0.4rem] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.2)] border border-slate-300 flex flex-col justify-between p-1.5"
        style={{ zIndex: 10 }}
      >
        <div className="flex items-start">
          <div className="flex flex-col items-start">
            <div className={`max-w-12 truncate text-xs font-black leading-none ${tone}`}>{cornerLabel}</div>
            <div className={`text-[9px] leading-none ${tone}`}>{suitIcon}</div>
          </div>
        </div>
        {isCustomCard && (
          <div className={`px-1 text-center text-[10px] font-black leading-tight ${tone}`}>{centerLabel}</div>
        )}
        <div className="flex items-end justify-end">
          <div className="flex flex-col items-end">
            <div className={`max-w-12 truncate text-xs font-black leading-none rotate-180 ${tone}`}>{cornerLabel}</div>
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
  const targetActionPlayer = targetActionPlayerId && activeGameState ? activeGameState.players[targetActionPlayerId] : null;
  const handOverlap = displayHand.length >= 25 ? -72 : displayHand.length >= 20 ? -64 : displayHand.length >= 14 ? -52 : -24;

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
                    if (!isPreview && !activeGameSettings.allowDrawFromOthers) return;
                    if (navigator.vibrate) navigator.vibrate(15);
                    playDrawSound();

                    if (isPreview) {
                      previewCardIdRef.current += 1;
                      const newCard: Card = { id: `mock-stolen-${previewCardIdRef.current}`, suit: 'none', rank: 'JOKER' };
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
                      setLocalEventLog(prev => [...prev, { timestamp: eventTimestamp(), type: 'DRAW_FROM_OTHER', playerName, count: 1, targetPlayerName: targetPlayer.name }]);
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

      {activePendingConfirmation && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-cyan-300/20 bg-slate-900 p-5 shadow-2xl">
            <div className="text-center">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-cyan-200">{t(locale, dict, 'client.confirmRequest')}</div>
              <div className="mb-5 text-base font-black leading-relaxed text-white">{pendingConfirmationText()}</div>
              <div className="flex gap-3">
                <button
                  onClick={() => respondToPendingAction(activePendingConfirmation.id, false)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white active:scale-[0.98] transition-all"
                >
                  {t(locale, dict, 'client.reject')}
                </button>
                <button
                  onClick={() => respondToPendingAction(activePendingConfirmation.id, true)}
                  className="flex-1 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 active:scale-[0.98] transition-all"
                >
                  {t(locale, dict, 'client.approve')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {targetActionPlayer && (
        <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="text-center">
              <div className="mb-1 text-xs font-black uppercase tracking-[0.22em] text-sky-200">{targetActionPlayer.name}</div>
              <div className="mb-5 text-base font-black text-white">{t(locale, dict, 'client.choosePlayerAction')}</div>
              <div className="grid gap-3">
                <button
                  onClick={() => {
                    setViewOther(targetActionPlayer.id);
                    setTargetActionPlayerId(null);
                  }}
                  disabled={!isPreview && !activeGameSettings.allowDrawFromOthers}
                  className="rounded-xl border border-sky-300/20 bg-sky-400/15 px-4 py-3 text-sm font-black text-sky-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
                >
                  {t(locale, dict, 'client.requestDrawFromPlayer')}
                </button>
                <button
                  onClick={() => handleGiveSelected(targetActionPlayer.id)}
                  disabled={selectedCards.length === 0}
                  className="rounded-xl border border-emerald-300/20 bg-emerald-400/15 px-4 py-3 text-sm font-black text-emerald-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
                >
                  {t(locale, dict, 'client.offerSelectedCards', { n: String(selectedCards.length) })}
                </button>
                <button
                  onClick={() => setTargetActionPlayerId(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white/75 active:scale-[0.98] transition-all"
                >
                  {t(locale, dict, 'client.cancel')}
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
                : activeGameSettings.allowPlayerUndo && undoableActionCount > 0) && (
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
                  {totalStackCards > 0 && (isPreview || activeGameSettings.allowClientClearTable) && (
                    <button
                      onClick={() => {
                        if (isPreview) {
                          const flattened = activeGameState.playStack.flat();
                          setLocalGameState(prev => ({
                            ...prev,
                            playStack: [],
                            discardPile: [...prev.discardPile, ...flattened],
                          }));
                          setLocalEventLog(prev => [...prev, { timestamp: eventTimestamp(), type: 'HOST_CLEAR_TABLE' as const, cards: flattened }]);
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
              <div className="flex shrink-0 gap-1.5 overflow-x-auto scrollbar-none px-1 pb-1 touch-pan-x">
                {Object.values(activeGameState.players)
                  .filter(player => player.id !== peerId)
                  .map(player => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setTargetActionPlayerId(player.id)}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/8 bg-slate-950/60 px-2.5 py-1 text-left shadow-lg active:scale-[0.98] transition-all"
                    >
                      <div className="text-xs font-black text-white truncate max-w-[5rem]">{player.name}</div>
                      <div className="text-[10px] text-slate-400">{player.handCount}{t(locale, dict, 'client.cards')}</div>
                      <div className="text-[8px] font-black uppercase tracking-[0.2em] text-sky-300">{t(locale, dict, 'client.playerActions')}</div>
                    </button>
                  ))}
              </div>
            )}
          </>
        )}

        {/* Deck & discard pile row */}
        {activeGameState && (
          <div ref={deckAreaRef} className="shrink-0 flex items-center gap-3 px-2">
            <div
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-4 py-2.5 shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 ${
                dragActive && dragOverReturnTopArea
                  ? 'border-amber-400/60 bg-amber-500/20 shadow-[0_0_40px_rgba(251,191,36,0.2)]'
                  : 'border-white/8 bg-slate-950/60'
              }`}
            >
              <button
                onClick={handleDrawAction}
                disabled={isDrawing}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <div className="text-xs font-black text-white">{t(locale, dict, 'client.drawFromDeck')}</div>
                <div className="rounded-md bg-white/10 px-2 py-0.5 text-sm font-black text-white">{activeGameState.deckCount}</div>
              </button>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 5].map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setDrawCount(count)}
                    className={`min-w-7 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                      drawCount === count ? 'bg-amber-300 text-slate-950' : 'bg-white/8 text-white/65'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/75">
                {dragActive ? t(locale, dict, 'client.releaseReturnTop') : t(locale, dict, 'client.dragReturnTop')}
              </div>
            </div>
            <div
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-4 py-2.5 shadow-lg transition-all ${
                dragActive && dragOverReturnBottomArea
                  ? 'border-amber-400/60 bg-amber-500/20 shadow-[0_0_40px_rgba(251,191,36,0.2)]'
                  : 'border-white/8 bg-slate-950/60'
              }`}
            >
              <div className="text-xs font-black text-white">{t(locale, dict, 'client.returnToBottomZone')}</div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/75">
                {dragActive ? t(locale, dict, 'client.releaseReturnBottom') : t(locale, dict, 'client.dragReturnBottom')}
              </div>
            </div>
            <div className="flex min-w-16 flex-col items-center justify-center rounded-xl border border-white/8 bg-slate-950/50 px-3 py-2 text-center">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">{t(locale, dict, 'tableConfig.discard')}</div>
              <div className="text-sm font-black text-white/80">{activeGameState.discardPile.length}</div>
            </div>
          </div>
        )}

        <div
          className="min-h-0 flex-none h-[15.5rem] flex flex-col overflow-visible"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1">
            <div>
              <div className="text-xs text-white/60">{t(locale, dict, 'client.yourHand')}</div>
              {(selectedCards.length > 0 || multiSelectActive) && (
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/80">
                  {selectedCards.length} {t(locale, dict, 'client.selected')}
                </div>
              )}
            </div>
            <div className="flex max-w-[75%] flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => sortHand('suit')}
                className="rounded-md border border-white/8 bg-slate-950/55 px-2 py-1 text-[10px] font-bold text-white/70 active:scale-95"
              >
                {t(locale, dict, 'client.sortSuit')}
              </button>
              <button
                type="button"
                onClick={() => sortHand('rank')}
                className="rounded-md border border-white/8 bg-slate-950/55 px-2 py-1 text-[10px] font-bold text-white/70 active:scale-95"
              >
                {t(locale, dict, 'client.sortRank')}
              </button>
              <button
                type="button"
                onClick={() => sortHand('drawn')}
                className="rounded-md border border-white/8 bg-slate-950/55 px-2 py-1 text-[10px] font-bold text-white/70 active:scale-95"
              >
                {t(locale, dict, 'client.sortDrawn')}
              </button>
              {selectedCards.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => moveSelectedCards(-1)}
                    className="rounded-md border border-amber-300/20 bg-amber-400/15 px-2 py-1 text-[10px] font-black text-amber-200 active:scale-95"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedCards(1)}
                    className="rounded-md border border-amber-300/20 bg-amber-400/15 px-2 py-1 text-[10px] font-black text-amber-200 active:scale-95"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCards([])}
                    className="rounded-md border border-white/8 bg-slate-950/55 px-2 py-1 text-[10px] font-bold text-white/70 active:scale-95"
                  >
                    {t(locale, dict, 'client.clearSelection')}
                  </button>
                </>
              )}
              <div className="rounded-full border border-white/8 bg-slate-950/40 px-2.5 py-1 text-[10px] font-black text-white/85">
                {hand.length} {t(locale, dict, 'client.cards')}
              </div>
            </div>
          </div>

          {hand.length > 0 ? (
            <div ref={handScrollerRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-visible scrollbar-none touch-pan-x">
              <div className="flex h-full min-w-max items-end gap-0 px-4 pb-5 pt-7">
                {displayHand.map((card, index) => (
                  <div
                    key={card.id}
                    className="first:ml-0 first:pl-0"
                    style={{ marginLeft: index === 0 ? 0 : handOverlap, zIndex: index + 1 }}
                  >
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
        <div className="absolute inset-0 z-[80] flex flex-col bg-slate-950/98 backdrop-blur-md animate-in fade-in duration-200">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/8 bg-slate-950/95 px-4 pb-3 pt-3 shadow-[0_12px_30px_rgba(0,0,0,0.22)]" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
            <div className="text-sm font-black text-white">{t(locale, dict, 'event.modalTitle')}</div>
            <button
              onClick={() => setShowEventModal(false)}
              aria-label={t(locale, dict, 'event.close')}
              className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white active:scale-[0.95] transition-all"
            >
              <span aria-hidden="true" className="text-base leading-none">X</span>
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
          <div className="shrink-0 border-t border-white/8 bg-slate-950/95 px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
            <button
              onClick={() => setShowEventModal(false)}
              className="w-full rounded-xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-black text-white active:scale-[0.98] transition-all"
            >
              {t(locale, dict, 'event.close')}
            </button>
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
