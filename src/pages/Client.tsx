import React, { useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../hooks/useClient';
import type { Card, Suit, Rank } from '../types';

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

export default function Client() {
  const { hostId } = useParams<{ hostId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const playerName = searchParams.get('name') || 'Player';
  const isPreview = searchParams.get('preview') === 'true';

  const {
    status: realStatus,
    error,
    retry,
    gameState,
    hand: realHand,
    peerId,
    drawCard,
    playCards,
    returnCards,
    takeBackCards,
    drawFromOther
  } = useClient(hostId!, playerName);

  const status = isPreview ? 'connected' : realStatus;
  const hand = isPreview ? MOCK_HAND : realHand;

  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewOther, setViewOther] = useState<string | null>(null);

  // Gesture state
  const [touchStartY, setTouchStartY] = useState(0);

  const [sortMode, setSortMode] = useState<SortMode>('draw');
  const [customOrder, setCustomOrder] = useState<string[]>([]);

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
      playCards(cardsToPlay);
      setSelectedCards([]);
    }
  };

  const handleReturnSelected = (toTop: boolean) => {
    const cardsToReturn = displayHand.filter(c => selectedCards.includes(c.id));
    if (cardsToReturn.length > 0) {
      returnCards(cardsToReturn, toTop);
      setSelectedCards([]);
    }
  };

  const handleTakeBack = () => {
    if (gameState && gameState.playStack.length > 0) {
      const topBatch = gameState.playStack[gameState.playStack.length - 1];
      takeBackCards(topBatch);
    }
  };

  const renderCard = (card: Card, index: number = -1) => {
    const isSelected = selectedCards.includes(card.id);
    const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black';

    return (
      <div
        key={card.id}
        onClick={() => toggleSelect(card.id)}
        className={`
          relative aspect-[2/3] bg-white rounded-lg shadow-md flex flex-col justify-between p-2 cursor-pointer transition-all duration-200
          ${isSelected ? 'ring-4 ring-blue-500 -translate-y-2' : 'hover:-translate-y-1'}
        `}
      >
        {isSelected && (
          <div className="absolute top-1 right-1 bg-blue-500 rounded-full w-5 h-5 flex items-center justify-center text-xs text-white z-10">
            ✓
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
            <div className="flex gap-2">
              <button
                onClick={(e) => moveCard(e, index, 'left')}
                disabled={index === 0}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded px-2 py-1 text-xs font-bold disabled:opacity-50"
              >
                &lt;
              </button>
              <button
                onClick={(e) => moveCard(e, index, 'right')}
                disabled={index === customOrder.length - 1}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 rounded px-2 py-1 text-xs font-bold disabled:opacity-50"
              >
                &gt;
              </button>
            </div>
          ) : (
            <div />
          )}
          <div className={`text-lg font-bold rotate-180 ${color}`}>{card.rank}</div>
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

  const handleSwipeDownDrawReturn = (e: React.TouchEvent, toTop: boolean = false) => {
    const touchEndY = e.changedTouches[0].clientY;
    const dragY = touchEndY - touchStartY;

    // Swiped DOWN
    if (dragY > 50) {
      if (selectedCards.length > 0) {
        handleReturnSelected(toTop);
      } else {
        drawCard(1);
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
  const targetPlayer = viewOther && gameState ? gameState.players[viewOther] : null;

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
                // In a real app we'd need to know the hidden card ID,
                // but since we only have count on client, we need a way for host to pick random.
                // For simplicity in this demo, since client doesn't have IDs of other's cards,
                // let's pass an empty string and let Host pick a random one if ID is empty.
                drawFromOther(viewOther, '');
                setViewOther(null);
              }}
              className="group relative aspect-[2/3] bg-blue-800 rounded-lg border-2 border-white/20 flex items-center justify-center cursor-pointer hover:bg-blue-600 hover:border-yellow-400 hover:-translate-y-1 transition-all shadow-md overflow-hidden"
            >
              <div className="text-white/30 font-black text-3xl group-hover:opacity-0 transition-opacity">?</div>
              <div className="absolute inset-0 bg-yellow-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-yellow-500 text-gray-900 font-bold text-xs uppercase px-2 py-1 rounded shadow-lg transform -rotate-12">
                  Steal
                </span>
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
      {/* Top Play/Take Back Zone Indicator */}
      <div
        className="h-24 border-2 border-dashed border-gray-700 rounded-xl flex items-center justify-center mb-4 bg-gray-800/50 cursor-pointer"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleSwipeUpPlay}
      >
        <span className="text-gray-500 font-bold uppercase tracking-widest text-center pointer-events-none">
          {selectedCards.length > 0 ? `↑ Swipe up to PLAY (${selectedCards.length})` : 'Play Zone (Select cards first)'}
        </span>
      </div>

      {gameState && gameState.playStack.length > 0 && (
        <div className="mb-4 bg-gray-800 rounded-xl p-3 border border-gray-700 flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Latest Play (Top of Stack)</span>
            <button
              onClick={handleTakeBack}
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors active:scale-95 shadow-md"
            >
              TAKE BACK (Undo)
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {gameState.playStack[gameState.playStack.length - 1].map((card: Card) => {
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
      )}

      {/* Hand Area */}
      <div className="flex-grow flex flex-col">
        <div className="mb-2">
          <h2 className="text-lg font-bold flex justify-between items-center mb-2">
            <span>Your Hand ({hand.length})</span>
            {selectedCards.length > 0 && (
              <button
                 onClick={() => setSelectedCards([])}
                 className="text-sm text-blue-400 bg-gray-800 px-3 py-1 rounded"
              >
                 Clear Selection
              </button>
            )}
          </h2>
          <div className="flex gap-2">
            <span className="text-xs text-gray-400 self-center uppercase tracking-wider font-bold">Sort (Local Only):</span>
            <button
              onClick={() => setSortMode('draw')}
              className={`text-xs px-2 py-1 rounded font-bold transition-colors ${sortMode === 'draw' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              DRAW
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
        </div>

        <div className="flex-grow overflow-y-auto pr-2 pb-4">
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
        </div>
      </div>

      {/* Bottom Draw/Return Zone Indicator */}
      {selectedCards.length === 0 ? (
        <div
          className="mt-4 min-h-20 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center bg-gray-800/50 cursor-pointer px-3 py-3"
          onTouchStart={handleTouchStart}
          onTouchEnd={(e) => handleSwipeDownDrawReturn(e)}
        >
          <span className="text-gray-500 font-bold uppercase tracking-widest text-center text-sm pointer-events-none">
            ↓ Swipe down to
            <br />
            DRAW (1)
          </span>
        </div>
      ) : (
        <div className="mt-4 flex gap-2 w-full">
          <div
            className="flex-1 min-h-20 border-2 border-dashed border-blue-600 rounded-xl flex flex-col items-center justify-center bg-blue-900/30 cursor-pointer px-2 py-3"
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => handleSwipeDownDrawReturn(e, true)}
          >
            <span className="text-blue-400 font-bold uppercase tracking-widest text-center text-xs pointer-events-none mb-2">
              ↓ Swipe down
            </span>
            <button
              onClick={() => handleReturnSelected(true)}
              className="w-full max-w-[150px] rounded-lg bg-blue-600 px-2 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700 active:scale-95 pointer-events-auto"
            >
              Return Top
            </button>
          </div>
          <div
            className="flex-1 min-h-20 border-2 border-dashed border-gray-500 rounded-xl flex flex-col items-center justify-center bg-gray-800/50 cursor-pointer px-2 py-3"
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => handleSwipeDownDrawReturn(e, false)}
          >
            <span className="text-gray-400 font-bold uppercase tracking-widest text-center text-xs pointer-events-none mb-2">
              ↓ Swipe down
            </span>
            <button
              onClick={() => handleReturnSelected(false)}
              className="w-full max-w-[150px] rounded-lg bg-gray-700 px-2 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-600 active:scale-95 pointer-events-auto"
            >
              Return Bottom
            </button>
          </div>
        </div>
      )}

      {/* Other Players Area */}
      {gameState && Object.keys(gameState.players).length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <h2 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Other Players (Tap to Inspect)</h2>
          <div className="flex overflow-x-auto gap-3 pb-2">
            {Object.values(gameState.players).map(p => {
              if (p.id === peerId) return null;

              return (
                <div
                  key={p.id}
                  onClick={() => setViewOther(p.id)}
                  className="flex-shrink-0 bg-gray-800 border border-gray-700 rounded-lg p-3 w-32 cursor-pointer hover:bg-gray-700 hover:border-blue-500 active:scale-95 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="font-bold truncate text-sm text-white group-hover:text-blue-400 transition-colors">{p.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{p.handCount} cards</div>
                  </div>
                  <div className="text-xs text-blue-500 mt-2 font-semibold uppercase tracking-widest opacity-80 group-hover:opacity-100 flex items-center gap-1">
                    <span>👁 Inspect</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
