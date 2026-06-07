import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useLocale, t } from '../i18n/LocaleProvider';
import dict from '../i18n/translations';
import type { Locale } from '../i18n/LocaleProvider';
import heroImage from '../assets/hero.png';

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
    const cleanRoom = roomId.trim();
    const cleanName = playerName.trim();
    if (cleanRoom && cleanName) {
      navigate(`/client/${cleanRoom}?name=${encodeURIComponent(cleanName)}`);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.18),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(14,165,233,0.14),transparent_28%),linear-gradient(145deg,#07111f_0%,#0f172a_48%,#111827_100%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl content-center gap-8 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="max-w-2xl">
          <div className="mb-4 inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
            {t(locale, dict, 'home.sandboxLabel')}
          </div>
          <h1 className="max-w-xl text-5xl font-black leading-tight text-white sm:text-6xl">
            {t(locale, dict, 'app.title')}
          </h1>
          <p className="mt-5 max-w-xl text-base font-medium leading-7 text-slate-300">
            {t(locale, dict, 'home.valueProp')}
          </p>

          <div className="mt-6 max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
            <img src={heroImage} alt="" className="aspect-[343/361] w-full object-contain" />
          </div>

          <div className="mt-7 grid max-w-xl grid-cols-3 gap-2">
            {[t(locale, dict, 'home.signalHost'), t(locale, dict, 'home.signalClient'), t(locale, dict, 'home.signalSandbox')].map(item => (
              <div key={item} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs font-bold text-white/80">
                {item}
              </div>
            ))}
          </div>
        </section>

        <main className="w-full rounded-[1.5rem] border border-white/12 bg-slate-950/80 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-xl">
          {message && (
            <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-center text-sm font-semibold text-amber-100">
              {message}
            </div>
          )}

          <button
            onClick={handleCreateRoom}
            className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-400 px-4 py-4 text-left text-slate-950 shadow-[0_18px_44px_rgba(16,185,129,0.24)] transition-transform active:scale-[0.99]"
          >
            <div className="text-xs font-black uppercase tracking-[0.24em] opacity-70">{t(locale, dict, 'home.hostGame')}</div>
            <div className="mt-1 text-2xl font-black">{t(locale, dict, 'home.createTable')}</div>
            <div className="mt-2 text-sm font-bold opacity-75">{t(locale, dict, 'home.createHint')}</div>
          </button>

          <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-white/35">
            <div className="h-px flex-1 bg-white/10" />
            {t(locale, dict, 'home.or')}
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-base font-black text-white">{t(locale, dict, 'home.joinGame')}</h2>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-bold text-slate-300">
                {t(locale, dict, 'home.yourName')}
                <input
                  type="text"
                  placeholder={t(locale, dict, 'home.yourName')}
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-base font-bold text-white outline-none ring-emerald-400/0 transition focus:ring-2"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </label>

              <label className="grid gap-1 text-xs font-bold text-slate-300">
                {t(locale, dict, 'home.roomCode')}
                <input
                  type="text"
                  placeholder={t(locale, dict, 'home.roomCodeHint')}
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 font-mono text-base font-bold text-white outline-none ring-emerald-400/0 transition focus:ring-2"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinRoom();
                  }}
                />
              </label>

              <button
                onClick={handleJoinRoom}
                disabled={!roomId.trim() || !playerName.trim()}
                className="rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {t(locale, dict, 'home.join')}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <Link
              to="/client/preview_room?name=Previewer&preview=true"
              className="rounded-xl border border-violet-300/20 bg-violet-400/10 px-4 py-3 text-center text-sm font-black text-violet-100 transition active:scale-[0.98]"
            >
              {t(locale, dict, 'home.preview')}
            </Link>
            <div className="flex items-center justify-center gap-2">
              {LOCALES.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => setLocale(code)}
                  className={`rounded px-2.5 py-1 text-xs font-bold transition-colors ${
                    locale === code
                      ? 'bg-white text-slate-950'
                      : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
