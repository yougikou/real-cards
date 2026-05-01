import React, { useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../hooks/useClient';
import type { Card, Suit, Rank } from '../types';
import { playDrawSound } from '../utils/audio/draw';

const SUIT_ORDER: Record<Suit, number> = {
  hearts: 1,
  diamonds: 2,
  clubs: 3,
  spades: 4,
  none: 5,
};

const RANK_ORDER: Record<Rank, number> = {
  'JOKER': 1,
  '2': 2,
  'A': 3,
  'K': 4,
  'Q': 5,
  'J': 6,
  '10': 7,
  '9': 8,
  '8': 9,
  '7': 10,
  '6': 11,
  '5': 12,
  '4': 13,
  '3': 14,
};

type SortMode = 'draw' | 'suit' | 'rank' | 'free';

const MOCK_HAND: Card[] = [
  { id: 'mock-1', suit: 'spades', rank: 'A' },
  { id: 'mock-2', suit: 'hearts', rank: 'K' },
  { id: 'mock-3', suit: 'spades', rank: '2' },
  { id: 'mock-4', suit: 'diamonds', rank: '10' },
  { id: 'mock-5', suit: 'clubs', rank: 'A' },
  { id: 'mock-6', suit: 'hearts', rank: '10' },
  { id: 'mock-7', suit: 'none', rank: 'JOKER' },
];

import type { GameState } from '../types';

const MOCK_GAME_STATE: GameState = {
  deckCount: 42,
  discardPile: [],
  playStack: [
    [
      { id: 'mock-history-0', suit: 'spades', rank: '2' }
    ],
    [
      { id: 'mock-history-1', suit: 'hearts', rank: '3' },
      { id: 'mock-history-2', suit: 'diamonds', rank: '3' }
    ]
  ],
  players: {
    'mock-peer-1': { id: 'mock-peer-1', name: 'Alice', handCount: 5 },
    'mock-peer-2': { id: 'mock-peer-2', name: 'Bob', handCount: 3 }
  }
};

export default function Client() {
  const { hostId } = useParams<{ hostId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const playerName = searchParams.get('name') || 'Player';
  const isPreview = searchParams.get('preview') === 'true' || window.location.href.includes('preview=true');

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
    drawFromOther
  } = useClient(hostId!, playerName);

  const [localHand, setLocalHand] = useState<Card[]>(MOCK_HAND);
  const [localGameState, setLocalGameState] = useState<GameState>(MOCK_GAME_STATE);

  const status = isPreview ? 'connected' : realStatus;
  const hand = isPreview ? localHand : realHand;
  const activeGameState = isPreview ? localGameState : realGameState;

  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewOther, setViewOther] = useState<string | null>(null);

  // Draw feedback state
  const [isDrawing, setIsDrawing] = useState(false);
  const [recentlyDrawnCardIds, setRecentlyDrawnCardIds] = useState<string[]>([]);

  // Gesture state
  const [touchStartY, setTouchStartY] = useState(0);

  const [sortMode, setSortMode] = useState<SortMode>('draw');
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  // Track newly drawn cards to apply visual highlights
  const previousHandRef = React.useRef<Card[]>(hand);
  React.useEffect(() => {
    const previousHand = previousHandRef.current;

    // Find newly added cards (cards in current hand that were not in previous hand)
    const newCards = hand.filter(card => !previousHand.some(prev => prev.id === card.id));

    if (newCards.length > 0) {
      const newCardIds = newCards.map(c => c.id);
      setRecentlyDrawnCardIds(prev => [...prev, ...newCardIds]);

      // Clear highlight after 800ms
      setTimeout(() => {
        setRecentlyDrawnCardIds(prev => prev.filter(id => !newCardIds.includes(id)));
      }, 800);
    }

    previousHandRef.current = hand;
  }, [hand]);

  // Update custom order when hand changes but do not cause cascading renders
  React.useEffect(() => {
    setCustomOrder(prev => {
      const newOrder = prev.filter(id => hand.some(c => c.id === id));
      const missingIds = hand.filter(c => !newOrder.includes(c.id)).map(c => c.id);
      if (newOrder.length === prev.length && missingIds.length === 0) {
         return prev; // no changes
      }
      return [...newOrder, ...missingIds];
    });
  }, [hand]);

  const displayHand = useMemo(() => {
    if (sortMode === 'draw') return hand;

    if (sortMode === 'free') {
      return customOrder.map(id => hand.find(c => c.id === id)).filter(Boolean) as Card[];
    }

    return [...hand].sort((a, b) => {
      if (sortMode === 'suit') {
        const suitDiff = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
        if (suitDiff !== 0) return suitDiff;
        return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
      } else {
        const rankDiff = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
        if (rankDiff !== 0) return rankDiff;
        return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
      }
    });
  }, [hand, sortMode, customOrder]);

  const groupedHand = useMemo(() => {
    if (sortMode === 'draw' || sortMode === 'free') return null;

    return displayHand.reduce((acc, card) => {
      let key = '';
      if (sortMode === 'suit') {
        key = card.suit === 'none' ? 'JOKERS' : card.suit.toUpperCase();
      } else if (sortMode === 'rank') {
        key = `RANK: ${card.rank}`;
      }

      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(card);
      return acc;
    }, {} as Record<string, Card[]>);
  }, [displayHand, sortMode]);

  const toggleSelect = (cardId: string) => {
    setSelectedCards(prev =>
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    );
  };

  const moveCard = (e: React.MouseEvent, index: number, direction: 'left' | 'right') => {
    e.stopPropagation();
    setCustomOrder(prev => {
      const newOrder = [...prev];
      if (direction === 'left' && index > 0) {
        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      } else if (direction === 'right' && index < newOrder.length - 1) {
        [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
      }
      return newOrder;
    });
  };

  const handlePlaySelected = () => {
    const cardsToPlay = displayHand.filter(c => selectedCards.includes(c.id));
    if (cardsToPlay.length > 0) {
      if (isPreview) {
        setLocalHand(prev => prev.filter(c => !cardsToPlay.map(sc => sc.id).includes(c.id)));
        setLocalGameState(prev => ({
          ...prev,
          playStack: [...prev.playStack, cardsToPlay]
        }));
      } else {
        playCards(cardsToPlay);
      }
      setSelectedCards([]);
    }
  };

  const handleReturnSelected = (toTop: boolean) => {
    const cardsToReturn = displayHand.filter(c => selectedCards.includes(c.id));
    if (cardsToReturn.length > 0) {
      if (isPreview) {
        setLocalHand(prev => prev.filter(c => !cardsToReturn.map(sc => sc.id).includes(c.id)));
        setLocalGameState(prev => ({
          ...prev,
          deckCount: prev.deckCount + cardsToReturn.length
        }));
        window.alert(`Mock: ${cardsToReturn.length} card(s) returned to ${toTop ? 'TOP' : 'BOTTOM'} of deck.`);
      } else {
        returnCards(cardsToReturn, toTop);
      }
      setSelectedCards([]);
    }
  };

  const handleTakeBack = () => {
    if (activeGameState && activeGameState.playStack.length > 0) {
      const topBatch = activeGameState.playStack[activeGameState.playStack.length - 1];
      if (isPreview) {
        setLocalGameState(prev => ({
          ...prev,
          playStack: prev.playStack.slice(0, -1)
        }));
        setLocalHand(prev => [...prev, ...topBatch]);
      } else {
        takeBackCards(topBatch);
      }
    }
  };

  const renderCard = (card: Card, index: number = -1) => {
    const isSelected = selectedCards.includes(card.id);
    const hasSelection = selectedCards.length > 0;
    const isRecentlyDrawn = recentlyDrawnCardIds.includes(card.id);
    const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black';

    let cardClasses = 'bg-white hover:-translate-y-1';
    if (isSelected) {
      cardClasses = 'bg-yellow-100 ring-8 ring-yellow-400 -translate-y-8 scale-110 shadow-[0_0_30px_rgba(250,204,21,0.6)] z-30';
    } else if (hasSelection) {
      cardClasses = 'bg-white opacity-40 saturate-50 scale-95';
    } else if (isRecentlyDrawn) {
      cardClasses = 'bg-green-50 ring-4 ring-green-400 scale-105 shadow-[0_0_20px_rgba(74,222,128,0.5)] z-20 -translate-y-2';
    }

    return (
      <div
        key={card.id}
        onClick={() => toggleSelect(card.id)}
        className={`relative aspect-[2/3] rounded-lg shadow-md flex flex-col justify-between p-2 cursor-pointer transition-all duration-200 ${cardClasses}`}
      >
        {isSelected && (
          <div className="absolute -top-4 -right-4 bg-yellow-400 border-4 border-gray-900 rounded-full w-12 h-12 flex items-center justify-center text-2xl font-black text-gray-900 z-30 shadow-2xl">
            {selectedCards.indexOf(card.id) + 1}
          </div>
        )}
        <div className={`text-lg font-bold ${color}`}>{card.rank}</div>
        <div className={`text-3xl self-center ${color}`}>
          {card.suit === 'hearts' && '♥'}
          {card.suit === 'diamonds' && '♦'}
          {card.suit === 'clubs' && '♣'}
          {card.suit === 'spades' && '♠'}
          {card.suit === 'none' && '🃏'}
        </div>
        <div className="flex justify-between items-end">
          {sortMode === 'free' && index !== -1 ? (
            <div className="flex gap-1">
              <button
                onClick={(e) => moveCard(e, index, 'left')}
                disabled={index === 0}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-1.5 py-1 text-[10px] font-bold disabled:opacity-30 flex items-center shadow-sm"
                title="Move Left"
              >
                ◀ L
              </button>
              <button
                onClick={(e) => moveCard(e, index, 'right')}
                disabled={index === customOrder.length - 1}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-1.5 py-1 text-[10px] font-bold disabled:opacity-30 flex items-center shadow-sm"
                title="Move Right"
              >
                R ▶
              </button>
            </div>
          ) : (
            <div />
          )}
          <div className={`text-lg font-bold rotate-180 ${color} ml-1`}>{card.rank}</div>
        </div>
      </div>
    );
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleSwipeUpPlay = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const dragY = touchEndY - touchStartY;

    // Swiped UP
    if (dragY < -50) {
      handlePlaySelected();
    }
  };

  const handleDrawAction = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (isDrawing) return;

    setIsDrawing(true);
    setTimeout(() => setIsDrawing(false), 300);

    // Haptic and audio feedback
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
    playDrawSound();

    if (isPreview) {
      if (localGameState.deckCount > 0) {
        const newCard: Card = { id: `mock-drawn-${Date.now()}`, suit: 'spades', rank: '7' };
        setLocalHand(prev => [...prev, newCard]);
        setLocalGameState(prev => ({ ...prev, deckCount: prev.deckCount - 1 }));
        window.alert("Mock: 1 card drawn from deck.");
      } else {
        window.alert("Mock: Deck is empty.");
      }
    } else {
      drawCard(1);
    }
  };

  const handleSwipeDownDrawReturn = (e: React.TouchEvent, toTop: boolean = false) => {
    const touchEndY = e.changedTouches[0].clientY;
    const dragY = touchEndY - touchStartY;

    // Swiped DOWN
    if (dragY > 50) {
      if (selectedCards.length > 0) {
        handleReturnSelected(toTop);
      } else {
        handleDrawAction();
      }
    }
  };


  if (status !== 'connected') {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white p-4">
        {status === 'failed' ? (
          <div className="text-center">
            <div className="text-red-500 text-2xl font-bold mb-4">Connection Failed</div>
            <div className="text-gray-300 mb-6">{error}</div>
            <button
              onClick={retry}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg active:scale-95 transition-all"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="text-center">
            <div className="animate-pulse text-2xl font-bold mb-4">
              {status === 'retrying' ? 'Retrying connection...' : status === 'reconnecting' ? 'Reconnecting to server...' : 'Connecting to Host...'}
            </div>
            <div className="text-gray-400">Room ID: {hostId}</div>
          </div>
        )}
        <div className="mt-12 w-full max-w-sm">
          <div className="bg-gray-800/80 p-4 rounded-xl border border-gray-700/50 text-center shadow-lg">
            <div className="text-gray-300 font-bold mb-2">Want to look around without a host?</div>
            <p className="text-xs text-gray-400 mb-4">
              Explore the Client interface, test gestures, and organize a mock hand offline.
            </p>
            <button
              onClick={() => setSearchParams((prev) => { prev.set('preview', 'true'); return prev; })}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded shadow active:scale-95 transition-all"
            >
              Enter UI Preview Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Draw From Other Mode
  const targetPlayer = viewOther && activeGameState ? activeGameState.players[viewOther] : null;

  if (viewOther && targetPlayer) {

    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col">
        <div className="flex items-center mb-6">
          <button
            onClick={() => setViewOther(null)}
            className="text-blue-400 font-bold flex items-center gap-1 bg-gray-800 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            ← Back
          </button>
          <div className="flex-1 text-center font-bold text-lg mr-12 text-gray-300">
            Inspection Mode
          </div>
        </div>

        <div className="bg-blue-900/40 border border-blue-500/50 rounded-xl p-4 mb-8 text-center">
          <h2 className="text-2xl font-black text-white mb-2">{targetPlayer.name}'s Hidden Hand</h2>
          <p className="text-sm text-blue-200">
            You are secretly viewing this player's cards.<br/>
            <span className="font-bold text-yellow-400">Tap a card to steal it into your hand!</span>
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 flex-grow content-start">
          {Array.from({ length: targetPlayer.handCount }).map((_, i) => (
            <div
              key={i}
              onClick={() => {
                if (isPreview) {
                  const newCard: Card = { id: `mock-stolen-${Date.now()}`, suit: 'none', rank: 'JOKER' };
                  setLocalHand(prev => [...prev, newCard]);
                  setLocalGameState(prev => {
                    const newPlayers = { ...prev.players };
                    if (newPlayers[viewOther]) {
                      newPlayers[viewOther] = { ...newPlayers[viewOther], handCount: Math.max(0, newPlayers[viewOther].handCount - 1) };
                    }
                    return { ...prev, players: newPlayers };
                  });
                  window.alert("Mock: 1 card stolen from opponent's hand.");
                } else {
                  // In a real app we'd need to know the hidden card ID,
                  // but since we only have count on client, we need a way for host to pick random.
                  // For simplicity in this demo, since client doesn't have IDs of other's cards,
                  // let's pass an empty string and let Host pick a random one if ID is empty.
                  drawFromOther(viewOther, '');
                }
                setViewOther(null);
              }}
              className="group relative aspect-[2/3] bg-blue-800 rounded-lg border-2 border-white/20 flex items-center justify-center cursor-pointer hover:bg-blue-600 hover:border-yellow-400 hover:-translate-y-1 transition-all shadow-md overflow-hidden"
            >
              <div className="flex flex-col items-center justify-center pointer-events-none">
                <div className="text-white/30 font-black text-3xl mb-1">?</div>
                <div className="text-yellow-400 font-bold text-[10px] uppercase tracking-wider bg-black/40 px-2 py-0.5 rounded">Tap to Draw</div>
              </div>
            </div>
          ))}
          {targetPlayer.handCount === 0 && (
            <div className="col-span-3 sm:col-span-4 text-center text-gray-500 mt-10">
              No cards in hand to steal.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col">
      {isPreview && (
        <div className="bg-purple-900/40 border-2 border-purple-500 border-dashed rounded-lg p-3 mb-4 flex justify-between items-center shadow-lg">
          <div className="flex flex-col">
            <span className="text-purple-300 font-bold text-sm">Preview Harness</span>
            <span className="text-purple-400/80 text-xs">Test dark-card interactions</span>
          </div>
          <button
            onClick={() => setViewOther('mock-peer-1')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-4 rounded shadow transition-colors active:scale-95 text-sm"
          >
            Inspect Alice
          </button>
        </div>
      )}

      {/* Read-Only Table Info Banner */}
      {activeGameState && (
        <div className="flex justify-between items-center bg-gray-800 border border-gray-700 rounded-lg p-2 mb-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
          <div>Deck: <span className="text-white">{activeGameState.deckCount}</span></div>
          <div className="flex items-center gap-1">
            Discard: <span className="text-white">{activeGameState.discardPile.length}</span>
            {activeGameState.discardPile.length > 0 && (
              <span className={`px-1 py-0.5 rounded ml-1 bg-white leading-none flex items-center ${activeGameState.discardPile[activeGameState.discardPile.length - 1].suit === 'hearts' || activeGameState.discardPile[activeGameState.discardPile.length - 1].suit === 'diamonds' ? 'text-red-600' : 'text-black'}`}>
                {activeGameState.discardPile[activeGameState.discardPile.length - 1].rank}
                {activeGameState.discardPile[activeGameState.discardPile.length - 1].suit === 'hearts' && '♥'}
                {activeGameState.discardPile[activeGameState.discardPile.length - 1].suit === 'diamonds' && '♦'}
                {activeGameState.discardPile[activeGameState.discardPile.length - 1].suit === 'clubs' && '♣'}
                {activeGameState.discardPile[activeGameState.discardPile.length - 1].suit === 'spades' && '♠'}
                {activeGameState.discardPile[activeGameState.discardPile.length - 1].suit === 'none' && '🃏'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top Play Zone Indicator */}
      <div
        className="min-h-20 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center mb-4 bg-gray-800/50 cursor-pointer px-3 py-3"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleSwipeUpPlay}
      >
        <span className="text-gray-500 font-bold uppercase tracking-widest text-center text-sm pointer-events-none mb-1">
          Play Zone
        </span>
        <span className="text-gray-600 text-xs text-center pointer-events-none">
          Select cards to Play (or play to discard)
        </span>
      </div>

      {activeGameState && activeGameState.playStack.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {activeGameState.playStack.slice(-2).reverse().map((batch, idx) => {
            const isTopBatch = idx === 0;
            return (
              <div key={idx} className={`bg-gray-800 rounded-xl p-3 border border-gray-700 flex flex-col ${isTopBatch ? '' : 'opacity-50 grayscale-[50%]'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${isTopBatch ? 'text-yellow-500' : 'text-gray-500'}`}>
                    {isTopBatch ? 'Latest Play (Top of Stack)' : 'Previous Play'}
                  </span>
                  {isTopBatch && (
                    <button
                      onClick={handleTakeBack}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors active:scale-95 shadow-md"
                    >
                      TAKE BACK (Undo)
                    </button>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {batch.map((card: Card) => {
                    const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black';
                    return (
                      <div key={card.id} className="w-12 h-16 bg-white rounded shadow flex flex-col justify-between p-1 flex-shrink-0">
                        <div className={`text-xs font-bold leading-none ${color}`}>{card.rank}</div>
                        <div className={`text-lg self-center leading-none ${color}`}>
                          {card.suit === 'hearts' && '♥'}
                          {card.suit === 'diamonds' && '♦'}
                          {card.suit === 'clubs' && '♣'}
                          {card.suit === 'spades' && '♠'}
                          {card.suit === 'none' && '🃏'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hand Area */}
      <div className="flex-grow flex flex-col">
        <div className="mb-2">
          <h2 className="text-lg font-bold flex justify-between items-center mb-2">
            <span>Your Hand ({hand.length})</span>
            {selectedCards.length > 0 ? (
              <div className="flex items-center">
                <button
                   onClick={() => setSelectedCards([])}
                   className="text-sm text-blue-400 bg-gray-800 px-3 py-1 rounded"
                >
                   Clear Selection
                </button>
                <span className="text-xs text-yellow-400 font-bold animate-pulse ml-2">↓ CHOOSE ACTION BELOW ↓</span>
              </div>
            ) : (
              <span className="text-xs text-gray-500 font-normal">Tap cards to select &amp; act</span>
            )}
          </h2>
          <div className="flex gap-2">
            <span className="text-xs text-gray-400 self-center uppercase tracking-wider font-bold">Sort (Local Only):</span>
            <button
              onClick={() => setSortMode('draw')}
              className={`text-xs px-2 py-1 rounded font-bold transition-colors ${sortMode === 'draw' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              TIME
            </button>
            <button
              onClick={() => setSortMode('suit')}
              className={`text-xs px-2 py-1 rounded font-bold transition-colors ${sortMode === 'suit' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              SUIT
            </button>
            <button
              onClick={() => setSortMode('rank')}
              className={`text-xs px-2 py-1 rounded font-bold transition-colors ${sortMode === 'rank' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              RANK
            </button>
            <button
              onClick={() => setSortMode('free')}
              className={`text-xs px-2 py-1 rounded font-bold transition-colors ${sortMode === 'free' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              FREE
            </button>
          </div>
          {sortMode === 'free' && (
            <div className="text-[10px] text-gray-400 mt-1.5 italic">
              Use the ◀ L / R ▶ buttons on each card to arrange your hand.
            </div>
          )}
        </div>

        <div className="flex-grow overflow-y-auto pr-2 pb-4 pt-12 px-4">
          {sortMode === 'draw' || sortMode === 'free' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {displayHand.map((card, idx) => renderCard(card, idx))}
            </div>
          ) : (
            groupedHand && Object.entries(groupedHand).map(([groupName, cards]) => (
              <div key={groupName} className="mb-6">
                <div className="text-xs font-bold text-gray-500 mb-2 border-b border-gray-700 pb-1 uppercase tracking-wider">
                  {groupName} ({cards.length})
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {cards.map((card, idx) => renderCard(card, idx))}
                </div>
              </div>
            ))
          )}
          {hand.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-500 mt-10">
              No cards in hand. Swipe down to draw!
            </div>
          )}
          {/* Spacer inside scroll container for action bar */}
          {selectedCards.length > 0 && <div className="h-48 flex-shrink-0" />}

        </div>
      </div>

      {/* Bottom Draw/Return Zone Indicator */}
      <div
        className="mt-4 min-h-20 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center bg-gray-800/50 cursor-pointer px-3 py-3"
        onTouchStart={handleTouchStart}
        onTouchEnd={(e) => handleSwipeDownDrawReturn(e)}
      >
        <button
          onClick={handleDrawAction}
          disabled={isDrawing}
          className={`rounded-lg px-6 py-3 text-lg font-bold text-white transition-all shadow-lg mb-1 pointer-events-auto flex items-center justify-center gap-2 ${
            isDrawing ? 'bg-blue-800 scale-95 opacity-80 cursor-wait' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
          }`}
        >
          {isDrawing ? <span>DRAWING...</span> : <span>DRAW 1 FROM DECK</span>}
        </button>
        <span className="text-gray-500 font-bold uppercase tracking-widest text-center text-[10px] pointer-events-none">
          ↓ (OR SWIPE DOWN)
        </span>
      </div>

      {selectedCards.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gray-900/95 border-t-2 border-yellow-400 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-50 flex flex-col gap-3 pb-safe">
          <div className="text-yellow-400 text-xs font-bold uppercase tracking-wider text-center -mb-1 animate-pulse">
            <span>↓ Actions for {selectedCards.length} selected card{selectedCards.length > 1 ? 's' : ''} ↓</span>
          </div>
          <div
            className="w-full border-2 border-green-500 rounded-xl flex flex-col items-center justify-center bg-green-900/40 shadow-[0_0_20px_rgba(34,197,94,0.3)] cursor-pointer px-3 py-3"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleSwipeUpPlay}
          >
            <button
              onClick={handlePlaySelected}
              className="w-full rounded-xl bg-green-600 px-6 py-3 text-xl font-black text-white transition-all hover:bg-green-500 active:scale-[0.98] shadow-lg mb-1 pointer-events-auto flex items-center justify-center gap-2"
            >
              <span>⬆️</span>
              <span>PLAY {selectedCards.length} TO TABLE</span>
              <span>⬆️</span>
            </button>
            <span className="text-green-400 font-bold uppercase tracking-widest text-center text-[10px] pointer-events-none opacity-80">
              TAP ABOVE OR SWIPE UP TO PLAY (OR DISCARD)
            </span>
          </div>

          <div className="flex gap-2 w-full">
            <div
              className="flex-1 border border-blue-600 rounded-xl flex flex-col items-center justify-center bg-blue-900/30 cursor-pointer px-2 py-2"
              onTouchStart={handleTouchStart}
              onTouchEnd={(e) => handleSwipeDownDrawReturn(e, true)}
            >
              <button
                onClick={() => handleReturnSelected(true)}
                className="w-full rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700 active:scale-95 pointer-events-auto mb-1 flex flex-col items-center"
              >
                <span>⏫ RETURN {selectedCards.length} TO DECK TOP</span>
                <span className="text-[9px] opacity-80 font-normal mt-0.5">(Next to be drawn)</span>
              </button>
              <span className="text-blue-400 font-bold uppercase tracking-widest text-center text-[9px] pointer-events-none">
                ↓ SWIPE DOWN
              </span>
            </div>
            <div
              className="flex-1 border border-gray-500 rounded-xl flex flex-col items-center justify-center bg-gray-800/50 cursor-pointer px-2 py-2"
              onTouchStart={handleTouchStart}
              onTouchEnd={(e) => handleSwipeDownDrawReturn(e, false)}
            >
               <button
                onClick={() => handleReturnSelected(false)}
                className="w-full rounded-lg bg-gray-700 px-2 py-1.5 text-xs font-bold text-white transition-colors hover:bg-gray-600 active:scale-95 pointer-events-auto mb-1 flex flex-col items-center"
              >
                <span>⏬ RETURN {selectedCards.length} TO DECK BOTTOM</span>
                <span className="text-[9px] opacity-80 font-normal mt-0.5">(Bury under deck)</span>
              </button>
              <span className="text-gray-400 font-bold uppercase tracking-widest text-center text-[9px] pointer-events-none">
                ↓ SWIPE DOWN
              </span>
            </div>
          </div>
        </div>
      )}



      {/* Other Players Area */}
      {activeGameState && Object.keys(activeGameState.players).length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <h2 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Other Players (Peek & Draw)</h2>
          <div className="flex overflow-x-auto gap-3 pb-2">
            {Object.values(activeGameState.players).map(p => {
              if (p.id === peerId) return null;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setViewOther(p.id)}
                  className="flex-shrink-0 text-left bg-gray-800 border border-gray-700 rounded-lg p-3 w-32 cursor-pointer hover:bg-gray-700 hover:border-blue-500 active:scale-95 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="font-bold truncate text-sm text-white group-hover:text-blue-400 transition-colors">{p.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{p.handCount} cards</div>
                  </div>
                  <div className="text-xs text-blue-500 mt-2 font-semibold uppercase tracking-widest opacity-80 group-hover:opacity-100 flex items-center gap-1">
                    <span>👁 Peek & Draw</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
