import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useLocale, t } from '../i18n/LocaleProvider';
import dict from '../i18n/translations';
import type { Locale } from '../i18n/LocaleProvider';

const LOCALES: { code: Locale; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
];

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, setLocale } = useLocale();
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

      <h1 className="text-4xl font-bold mb-8">{t(locale, dict, 'app.title')}</h1>

      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">{t(locale, dict, 'home.hostGame')}</h2>
          <button
            onClick={handleCreateRoom}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors"
          >
            {t(locale, dict, 'home.createTable')}
          </button>
        </div>

        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink-0 mx-4 text-gray-400">{t(locale, dict, 'home.or')}</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4 text-center">{t(locale, dict, 'home.joinGame')}</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t(locale, dict, 'home.yourName')}</label>
              <input
                type="text"
                placeholder={t(locale, dict, 'home.yourName')}
                className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t(locale, dict, 'home.roomCode')}</label>
              <input
                type="text"
                placeholder={t(locale, dict, 'home.roomCodeHint')}
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
              {t(locale, dict, 'home.join')}
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-center text-gray-700">{t(locale, dict, 'home.explore')}</h2>
          <Link
            to="/client/preview_room?name=Previewer&preview=true"
            className="block text-center w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded transition-colors shadow-sm"
          >
            {t(locale, dict, 'home.preview')}
          </Link>
          <p className="text-xs text-gray-500 text-center mt-2">
            {t(locale, dict, 'home.previewHint')}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        {LOCALES.map(({ code, label }) => (
          <button
            key={code}
            onClick={() => setLocale(code)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              locale === code
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
