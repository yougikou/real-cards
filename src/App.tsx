import { useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { LocaleProvider } from './i18n/LocaleProvider';
import dict from './i18n/translations';
import { useLocale, t } from './i18n/LocaleProvider';
import Home from './pages/Home';
import Host from './pages/Host';
import Client from './pages/Client';
import PhaserTable from './pages/PhaserTable';

function AppRoutes() {
  const { locale } = useLocale();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/host" element={<Host />} />
      <Route path="/client/:hostId" element={<Client />} />
      <Route path="/client" element={<Navigate to="/" state={{ message: t(locale, dict, 'app.joinPrompt') }} replace />} />
      <Route path="/phaser" element={<PhaserTable />} />
    </Routes>
  );
}

function PwaUpdatePrompt() {
  const { locale } = useLocale();
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    updateServiceWorkerRef.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-amber-300/30 bg-slate-950/95 p-3 text-white shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">{t(locale, dict, 'pwa.updateTitle')}</div>
        <div className="text-xs text-white/65">{t(locale, dict, 'pwa.updateBody')}</div>
      </div>
      <button
        type="button"
        onClick={() => updateServiceWorkerRef.current?.(true)}
        className="shrink-0 rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950 active:scale-[0.98]"
      >
        {t(locale, dict, 'pwa.updateNow')}
      </button>
    </div>
  );
}

function App() {
  return (
    <Router>
      <LocaleProvider>
        <AppRoutes />
        <PwaUpdatePrompt />
      </LocaleProvider>
    </Router>
  );
}

export default App;
