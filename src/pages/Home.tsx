import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const message = (location.state as { message?: string })?.message;

  useEffect(() => {
    const windowSearch = new URLSearchParams(window.location.search);
    const hashSearch = new URLSearchParams(location.search);
    if (windowSearch.get('preview') === 'true' || hashSearch.get('preview') === 'true') {
      navigate('/client/preview_room?name=Previewer&preview=true', { replace: true });
    }
  }, [location, navigate]);

  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleCreateRoom = () => {
    navigate('/host');
  };

  const handleJoinRoom = () => {
    if (roomId && playerName) {
      navigate(`/client/${roomId}?name=${encodeURIComponent(playerName)}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      {message && (
        <div className="mb-6 p-4 bg-orange-100 border border-orange-400 text-orange-700 rounded-lg shadow-sm w-full max-w-md text-center font-medium">
          {message}
        </div>
      )}

      <h1 className="text-4xl font-bold mb-8">Real Cards Sandbox</h1>

      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">Host a Game</h2>
          <button
            onClick={handleCreateRoom}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors"
          >
            Create Table (Tablet)
          </button>
        </div>

        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink-0 mx-4 text-gray-400">OR</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4 text-center">Join a Game</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Code</label>
              <input
                type="text"
                placeholder="Scan QR or enter code"
                className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={!roomId || !playerName}
              className={`w-full font-bold py-3 px-4 rounded transition-colors ${
                !roomId || !playerName
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              Join (Phone)
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-center text-gray-700">Explore UI</h2>
          <Link
            to="/client/preview_room?name=Previewer&preview=true"
            className="block text-center w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded transition-colors shadow-sm"
          >
            Try Client Preview Mode
          </Link>
          <p className="text-xs text-gray-500 text-center mt-2">
            Test the hand UI locally without needing a Host connection.
          </p>
        </div>
      </div>
    </div>
  );
}
