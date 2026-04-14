import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import PhaserTable from './PhaserTable';

export default function Host() {
  const { status, error, retry, peerId, gameState } = useHost();

  const joinUrl = `${window.location.origin}${window.location.pathname}#/client/${peerId}`;

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div className="fixed inset-0 z-0">
        <PhaserTable />
      </div>

      {status === 'starting' && (
        <div className="absolute inset-0 z-50 bg-black/80 flex justify-center items-center text-white">
          Initializing Host...
        </div>
      )}

      {status === 'failed' && (
        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col justify-center items-center space-y-4 p-4 text-center text-white">
          <div className="text-red-500 font-bold text-xl">Host Error</div>
          <p>{error}</p>
          <button
            onClick={retry}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry Host
          </button>
        </div>
      )}

      {status === 'reconnecting' && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-yellow-500 text-black text-center py-2 font-bold shadow-md flex justify-center items-center space-x-4">
          <span>Reconnecting to signaling server...</span>
          <button
            onClick={retry}
            className="px-3 py-1 bg-black text-white text-sm rounded hover:bg-gray-800"
          >
            Force Retry
          </button>
        </div>
      )}

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col p-4 text-white">
        <div className="absolute top-4 left-4 bg-white/10 p-4 rounded-lg flex gap-4 items-center mt-8">
          <div className="bg-white p-2 rounded">
            <QRCodeSVG value={joinUrl} size={100} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Scan to Join</h2>
            <p className="text-sm opacity-80 mt-1">Room ID: {peerId}</p>
          </div>
        </div>

        <div className="flex-grow flex items-center justify-center pointer-events-none">
          {/* Play Area Overlay (mostly invisible to allow interaction with Phaser) */}
        </div>

        <div className="absolute top-4 right-4 flex gap-4 pointer-events-auto">
          {/* Deck */}
          <div className="w-32 h-48 bg-blue-900 rounded-xl shadow-lg border-2 border-white/50 flex items-center justify-center cursor-pointer hover:-translate-y-2 transition-transform">
            <div className="text-center">
              <div className="text-white/80 font-bold mb-2">Deck</div>
              <div className="text-3xl font-black">{gameState.deckCount}</div>
            </div>
          </div>

          {/* Discard */}
          <div className="w-32 h-48 bg-gray-800 rounded-xl shadow-lg border-2 border-white/30 flex items-center justify-center cursor-pointer">
             <div className="text-white/50 font-bold">Discard</div>
          </div>
        </div>

        {/* Players Ring */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-around pointer-events-none">
          {Object.values(gameState.players).map(player => (
            <div key={player.id} className="bg-black/50 p-4 rounded-xl text-center w-48 border border-white/20">
              <h3 className="font-bold text-lg truncate">{player.name}</h3>
              <div className="text-3xl font-black text-yellow-400 mt-2">{player.handCount}</div>
              <div className="text-sm opacity-70 mt-1">Cards</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
