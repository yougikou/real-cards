import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import PhaserTable from './PhaserTable';
import { playShuffleSound } from '../utils/audio/shuffle';

export default function Host() {
  const { status, error, retry, peerId, gameState, resetGame } = useHost();

  const joinUrl = `${window.location.origin}${window.location.pathname}#/client/${peerId}`;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('players-updated', { detail: { players: gameState.players } }));
  }, [gameState.players]);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div className="fixed inset-0 z-0">
        <PhaserTable />
      </div>

      {/* Connection Status Indicator */}
      <div className="absolute top-4 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className={`pointer-events-auto flex items-center space-x-3 px-4 py-2 rounded-full shadow-lg border text-sm font-medium ${
          status === 'ready' ? 'bg-green-900/80 border-green-500 text-green-100' :
          status === 'starting' ? 'bg-blue-900/80 border-blue-500 text-blue-100' :
          status === 'reconnecting' ? 'bg-yellow-900/80 border-yellow-500 text-yellow-100' :
          'bg-red-900/80 border-red-500 text-red-100'
        }`}>
          <span className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${
              status === 'ready' ? 'bg-green-400' :
              status === 'starting' ? 'bg-blue-400 animate-pulse' :
              status === 'reconnecting' ? 'bg-yellow-400 animate-pulse' :
              'bg-red-400'
            }`} />
            <span>
              {status === 'ready' && 'Host Connected'}
              {status === 'starting' && 'Starting Host...'}
              {status === 'reconnecting' && 'Reconnecting...'}
              {status === 'failed' && `Connection Failed: ${error || 'Unknown error'}`}
            </span>
          </span>
          {status !== 'ready' && (
            <button
              onClick={retry}
              className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col p-4 text-white">
        {status === 'ready' && peerId ? (
          <div className="absolute top-4 left-4 bg-white/10 p-4 rounded-lg flex gap-4 items-center mt-8">
            <div className="bg-white p-2 rounded">
              <QRCodeSVG value={joinUrl} size={100} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Scan to Join</h2>
              <p className="text-sm opacity-80 mt-1">Room ID: {peerId}</p>
            </div>
          </div>
        ) : (
          <div className="absolute top-4 left-4 bg-black/60 border border-white/20 p-4 rounded-lg flex gap-4 items-center mt-8 pointer-events-auto">
            <div className="flex flex-col">
              <h2 className={`text-xl font-bold ${status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                {status === 'failed' ? 'Connection Failed' : 'Host Not Ready'}
              </h2>
              <p className="text-sm opacity-80 mt-1 max-w-xs break-words">
                {status === 'failed' && error ? error : 'Waiting for connection...'}
              </p>
              {status === 'failed' && (
                <button
                  onClick={retry}
                  className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg active:scale-95 transition-all"
                >
                  Retry Connection
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-grow flex items-center justify-center pointer-events-none relative">
          {/* Play Area Overlay */}
          <div className="relative w-64 h-64 flex items-center justify-center">
            {gameState.playStack.map((batch, batchIndex) => {
              // Offset each batch slightly so we can see the stack
              const offsetX = batchIndex * 10;
              const offsetY = batchIndex * -10;
              const rotation = (batchIndex % 3 - 1) * 5; // slight rotation -5, 0, 5
              const isTopBatch = batchIndex === gameState.playStack.length - 1;

              return (
                <div
                  key={batchIndex}
                  className={`absolute transition-all duration-300 pointer-events-auto ${isTopBatch ? 'ring-4 ring-yellow-400 scale-105 rounded-xl z-50' : 'shadow-2xl opacity-60'}`}
                  style={{
                    transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
                    zIndex: isTopBatch ? 100 : batchIndex,
                  }}
                >
                  {isTopBatch && (
                    <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-1 z-50">
                      <div className="bg-yellow-400 text-black text-xs font-black px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                        LATEST BATCH
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('host-return-batch', { detail: { toTop: true } }));
                          }}
                          className="bg-black/80 hover:bg-black text-white text-[10px] px-2 py-0.5 rounded border border-white/30 transition-colors whitespace-nowrap"
                        >
                          ↑ Return to Deck Top
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('host-return-batch', { detail: { toTop: false } }));
                          }}
                          className="bg-black/80 hover:bg-black text-white text-[10px] px-2 py-0.5 rounded border border-white/30 transition-colors whitespace-nowrap"
                        >
                          ↓ Return to Deck Bottom
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex -space-x-12">
                    {batch.map((card, cardIndex) => {
                      const color = card.suit === 'hearts' || card.suit === 'diamonds' ? 'text-red-600' : 'text-black';
                      return (
                        <div
                          key={card.id}
                          className="w-24 h-36 bg-white rounded-lg shadow-md border border-gray-300 flex flex-col justify-between p-2 relative"
                          style={{ zIndex: cardIndex }}
                        >
                          <div className={`text-sm font-bold ${color}`}>{card.rank}</div>
                          <div className={`text-2xl self-center ${color}`}>
                            {card.suit === 'hearts' && '♥'}
                            {card.suit === 'diamonds' && '♦'}
                            {card.suit === 'clubs' && '♣'}
                            {card.suit === 'spades' && '♠'}
                            {card.suit === 'none' && '🃏'}
                          </div>
                          <div className={`text-sm font-bold rotate-180 ${color}`}>{card.rank}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {gameState.playStack.length === 0 && (
              <div className="text-white/20 font-bold text-2xl uppercase tracking-widest border-2 border-dashed border-white/20 p-8 rounded-xl">
                Play Area
              </div>
            )}
            {gameState.playStack.length > 0 && (
              <div className="absolute -bottom-16 text-center z-10 pointer-events-none flex flex-col items-center">
                <div className="text-white/50 font-bold text-sm uppercase tracking-widest">
                  Public Play History
                </div>
                <div className="text-white/40 text-xs font-medium mt-1 mb-2">
                  {gameState.playStack.reduce((acc, batch) => acc + batch.length, 0)} cards in stack
                </div>
                <button
                  onClick={() => window.dispatchEvent(new Event('host-clear-table'))}
                  className="pointer-events-auto bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-1.5 rounded-full border border-gray-600 text-xs uppercase tracking-wider font-bold transition-colors shadow-lg active:scale-95"
                >
                  Clear to Discard ↓
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="absolute top-4 right-4 flex gap-4 pointer-events-auto">
          {/* Discard Pile */}
          <div
            className={`w-32 h-48 bg-gray-800 rounded-xl shadow-lg border-2 border-gray-600 flex flex-col items-center justify-center transition-opacity ${gameState.discardPile.length > 0 ? 'opacity-100' : 'opacity-50'}`}
          >
            <div className="text-gray-400 font-bold mb-2 text-sm uppercase tracking-widest">Discard</div>
            <div className="text-2xl font-black text-gray-500">{gameState.discardPile.length}</div>

            {gameState.discardPile.length > 0 && (
              <div className="mt-3 bg-white w-16 h-20 rounded shadow flex flex-col items-center justify-center p-1 transform rotate-6">
                <span className={`text-sm font-bold ${gameState.discardPile[gameState.discardPile.length - 1].suit === 'hearts' || gameState.discardPile[gameState.discardPile.length - 1].suit === 'diamonds' ? 'text-red-600' : 'text-black'}`}>
                  {gameState.discardPile[gameState.discardPile.length - 1].rank}
                </span>
                <span className={`text-xl ${gameState.discardPile[gameState.discardPile.length - 1].suit === 'hearts' || gameState.discardPile[gameState.discardPile.length - 1].suit === 'diamonds' ? 'text-red-600' : 'text-black'}`}>
                  {gameState.discardPile[gameState.discardPile.length - 1].suit === 'hearts' && '♥'}
                  {gameState.discardPile[gameState.discardPile.length - 1].suit === 'diamonds' && '♦'}
                  {gameState.discardPile[gameState.discardPile.length - 1].suit === 'clubs' && '♣'}
                  {gameState.discardPile[gameState.discardPile.length - 1].suit === 'spades' && '♠'}
                  {gameState.discardPile[gameState.discardPile.length - 1].suit === 'none' && '🃏'}
                </span>
              </div>
            )}
            {gameState.discardPile.length === 0 && <div className="text-gray-600 text-xs mt-2">(Empty)</div>}
          </div>

          {/* Deck */}
          <div
            onClick={() => {
              if (gameState.deckCount > 0) {
                window.dispatchEvent(new Event('host-draw-to-table'));
              }
            }}
            className={`w-32 h-48 bg-blue-900 rounded-xl shadow-lg border-2 border-white/50 flex flex-col items-center justify-center transition-colors ${gameState.deckCount > 0 ? 'cursor-pointer hover:bg-blue-800 active:scale-95' : 'opacity-50'}`}
          >
            <div className="text-white/80 font-bold mb-2">Deck</div>
            <div className="text-3xl font-black">{gameState.deckCount}</div>
            {gameState.deckCount > 0 && <div className="text-white/60 text-xs mt-2">Tap to draw</div>}
          </div>

          {/* Reset & Shuffle (Discard) */}
          <div
            onClick={() => {
              resetGame();
              playShuffleSound();
            }}
            className="w-32 h-48 bg-red-900/80 hover:bg-red-800 rounded-xl shadow-lg border-2 border-white/50 flex flex-col items-center justify-center cursor-pointer transition-colors active:scale-95"
          >
             <div className="text-white font-bold mb-2 text-center px-2">Reset & Shuffle</div>
             <div className="text-xl">↺</div>
          </div>
        </div>

        {/* Navigation Affordance / Controls */}
        <div className="absolute bottom-4 left-4 bg-black/60 border border-white/20 p-3 rounded-lg text-white/90 text-sm flex gap-4 pointer-events-auto backdrop-blur-sm shadow-lg">
          <span className="flex items-center gap-2 text-yellow-300 font-bold border border-yellow-500/50 bg-yellow-900/30 px-2 py-0.5 rounded">🃏 Drag cards to seats to deal</span>
          <span className="flex items-center gap-2">🖐️ Drag to pan</span>
          <span className="flex items-center gap-2">🔍 Scroll to zoom</span>
          <button
            onClick={() => window.dispatchEvent(new Event('table-recenter'))}
            className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded transition-colors active:scale-95"
          >
            Recenter View
          </button>
        </div>
      </div>
    </div>
  );
}
