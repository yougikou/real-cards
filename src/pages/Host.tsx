import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import type { Card } from '../types';

export default function Host() {
  const { peerId, gameState } = useHost();

  const currentPlayBatch = gameState.playStack.length > 0
    ? gameState.playStack[gameState.playStack.length - 1]
    : [];

  if (!peerId) {
    return <div className="flex justify-center items-center h-screen">Initializing Host...</div>;
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}#/client/${peerId}`;

  return (
    <div className="min-h-screen bg-green-800 p-4 text-white relative flex flex-col">
      <div className="absolute top-4 left-4 bg-white/10 p-4 rounded-lg flex gap-4 items-center">
        <div className="bg-white p-2 rounded">
          <QRCodeSVG value={joinUrl} size={100} />
        </div>
        <div>
          <h2 className="text-xl font-bold">Scan to Join</h2>
          <p className="text-sm opacity-80 mt-1">Room ID: {peerId}</p>
        </div>
      </div>

      <div className="flex-grow flex items-center justify-center pointer-events-none">
        {/* Play Area */}
        <div className="border-4 border-dashed border-white/30 rounded-3xl w-2/3 h-2/3 flex items-center justify-center relative bg-white/5">
          {currentPlayBatch.length > 0 ? (
            <div className="flex -space-x-8">
              {currentPlayBatch.map((card: Card, index: number) => (
                <div
                  key={card.id}
                  className="w-32 h-48 bg-white rounded-xl shadow-2xl flex flex-col justify-between p-2 border border-gray-200 transform transition-transform"
                  style={{
                    color: card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black',
                    zIndex: index,
                    // Use id to seed pseudo-randomness for stable render
                    transform: `rotate(${(parseInt(card.id.substring(card.id.length-3), 36) % 10) - 5}deg) translateY(${(parseInt(card.id.substring(card.id.length-4, card.id.length-1), 36) % 10) - 5}px)`
                  }}
                >
                  <div className="text-2xl font-bold">{card.rank}</div>
                  <div className="text-4xl self-center">
                    {card.suit === 'hearts' && '♥'}
                    {card.suit === 'diamonds' && '♦'}
                    {card.suit === 'clubs' && '♣'}
                    {card.suit === 'spades' && '♠'}
                    {card.suit === 'none' && '🃏'}
                  </div>
                  <div className="text-2xl font-bold rotate-180">{card.rank}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-white/30 text-2xl font-bold">Play Area</div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 flex gap-4">
        {/* Deck */}
        <div className="w-32 h-48 bg-blue-900 rounded-xl shadow-lg border-2 border-white/50 flex items-center justify-center cursor-pointer hover:-translate-y-2 transition-transform">
          <div className="text-center">
            <div className="text-white/80 font-bold mb-2">Deck</div>
            <div className="text-3xl font-black">{gameState.deckCount}</div>
          </div>
        </div>

        {/* Discard - currently just decorative as RETURN goes to deck */}
        <div className="w-32 h-48 bg-gray-800 rounded-xl shadow-lg border-2 border-white/30 flex items-center justify-center">
           <div className="text-white/50 font-bold">Discard</div>
        </div>
      </div>

      {/* Players Ring */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-around">
        {Object.values(gameState.players).map(player => (
          <div key={player.id} className="bg-black/50 p-4 rounded-xl text-center w-48 border border-white/20">
            <h3 className="font-bold text-lg truncate">{player.name}</h3>
            <div className="text-3xl font-black text-yellow-400 mt-2">{player.handCount}</div>
            <div className="text-sm opacity-70 mt-1">Cards</div>
          </div>
        ))}
      </div>
    </div>
  );
}
