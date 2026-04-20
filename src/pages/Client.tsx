import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../hooks/useClient';
import type { Card } from '../types';

export default function Client() {
  const { hostId } = useParams<{ hostId: string }>();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name') || 'Player';

  const {
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
    drawFromOther
  } = useClient(hostId!, playerName);

  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [viewOther, setViewOther] = useState<string | null>(null);

  // Gesture state
  const [touchStartY, setTouchStartY] = useState(0);

  const toggleSelect = (cardId: string) => {
    setSelectedCards(prev =>
      prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
    );
  };

  const handlePlaySelected = () => {
    const cardsToPlay = hand.filter(c => selectedCards.includes(c.id));
    if (cardsToPlay.length > 0) {
      playCards(cardsToPlay);
      setSelectedCards([]);
    }
  };

  const handleReturnSelected = (toTop: boolean) => {
    const cardsToReturn = hand.filter(c => selectedCards.includes(c.id));
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
      </div>
    );
  }

  // Draw From Other Mode
  const targetPlayer = viewOther && gameState ? gameState.players[viewOther] : null;

  if (viewOther && targetPlayer) {

    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col">
        <button
          onClick={() => setViewOther(null)}
          className="mb-4 text-blue-400 font-bold"
        >
          ← Back to Hand
        </button>

        <h2 className="text-2xl font-bold mb-8 text-center">{targetPlayer.name}'s Hand</h2>

        <div className="grid grid-cols-4 gap-4 flex-grow content-start">
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
              className="aspect-[2/3] bg-blue-800 rounded-lg border-2 border-white/20 flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors"
            >
              <div className="text-white/30 font-black text-2xl">?</div>
            </div>
          ))}
          {targetPlayer.handCount === 0 && (
            <div className="col-span-4 text-center text-gray-500 mt-10">
              No cards in hand.
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
        <h2 className="text-lg font-bold mb-2 flex justify-between items-center">
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

        <div className="flex-grow overflow-y-auto pr-2 pb-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {hand.map((card: Card) => {
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
                  <div className={`text-lg font-bold rotate-180 ${color}`}>{card.rank}</div>
                </div>
              );
            })}
          </div>
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
          <h2 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Other Players</h2>
          <div className="flex overflow-x-auto gap-3 pb-2">
            {Object.values(gameState.players).map(p => {
              if (p.id === peerId) return null;

              return (
                <div
                  key={p.id}
                  onClick={() => setViewOther(p.id)}
                  className="flex-shrink-0 bg-gray-800 rounded-lg p-3 w-32 cursor-pointer hover:bg-gray-700 active:scale-95 transition-all"
                >
                  <div className="font-bold truncate text-sm">{p.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{p.handCount} cards</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
