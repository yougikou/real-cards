import { QRCodeSVG } from 'qrcode.react';
import { useHost } from '../hooks/useHost';
import PhaserTable from './PhaserTable';

export default function Host() {
  const { peerId, gameState } = useHost();

  if (!peerId) {
    return <div className="flex justify-center items-center h-screen">Initializing Host...</div>;
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}#/client/${peerId}`;

  return (
    <div className="min-h-screen bg-green-800 p-4 text-white relative flex flex-col overflow-hidden">
      <div className="absolute inset-0 z-0">
        <PhaserTable />
      </div>

      <div className="absolute top-4 left-4 bg-white/10 p-4 rounded-lg flex gap-4 items-center z-10 pointer-events-none">
        <div className="bg-white p-2 rounded">
          <QRCodeSVG value={joinUrl} size={100} />
        </div>
        <div>
          <h2 className="text-xl font-bold">Scan to Join</h2>
          <p className="text-sm opacity-80 mt-1">Room ID: {peerId}</p>
        </div>
      </div>

      {/* Players Ring */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-around z-10 pointer-events-none">
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
