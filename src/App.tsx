import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  return (
    <Router>
      <LocaleProvider>
        <AppRoutes />
      </LocaleProvider>
    </Router>
  );
}

export default App;
