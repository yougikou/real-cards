import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useClient } from '../hooks/useClient';
import type { Card } from '../types';

export default function Client() {
  const { hostId } = useParams<{ hostId: string }>();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name') || 'Player';

  const {
    connected,
    gameState,
    hand,
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

  const handleReturnSelected = () => {
    const cardsToReturn = hand.filter(c => selectedCards.includes(c.id));
    if (cardsToReturn.length > 0) {
      returnCards(cardsToReturn, false);
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

  const handleSwipeDownDrawReturn = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const dragY = touchEndY - touchStartY;

    // Swiped DOWN
    if (dragY > 50) {
      if (selectedCards.length > 0) {
        handleReturnSelected();
      } else {
        drawCard(1);
      }
    }
  };


  if (!connected) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-900 text-white">
        <div className="animate-pulse text-2xl font-bold mb-4">Connecting to Host...</div>
        <div className="text-gray-400">Room ID: {hostId}</div>
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

      <div className="flex gap-2 mb-4 justify-end">
         <button
            onClick={handleTakeBack}
            disabled={!gameState || gameState.playStack.length === 0}
            className={`font-bold py-2 px-4 rounded-lg transition-colors active:scale-95 ${
              !gameState || gameState.playStack.length === 0
                ? 'bg-gray-700 text-gray-500'
                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
            }`}
          >
            TAKE BACK (Undo)
          </button>
      </div>

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
      <div
        className="mt-4 h-20 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center bg-gray-800/50 cursor-pointer"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleSwipeDownDrawReturn}
      >
        <span className="text-gray-500 font-bold uppercase tracking-widest text-center text-sm pointer-events-none">
          ↓ Swipe down to
          <br />
          {selectedCards.length > 0 ? `RETURN (${selectedCards.length})` : 'DRAW (1)'}
        </span>
      </div>

      {/* Other Players Area */}
      {gameState && Object.keys(gameState.players).length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <h2 className="text-sm font-bold text-gray-400 mb-2 uppercase tracking-wider">Other Players</h2>
          <div className="flex overflow-x-auto gap-3 pb-2">
            {Object.values(gameState.players).map(p => {
              // Note: client doesn't know its own Peer ID here directly,
              // but we filter by name mismatch for simplicity or just show all for demo.
              // A better way is to pass peerId to client from hook.
              if (p.name === playerName) return null;

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
