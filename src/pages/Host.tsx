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
