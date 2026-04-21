import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Host from './pages/Host';
import Client from './pages/Client';
import PhaserTable from './pages/PhaserTable';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<Host />} />
        <Route path="/client/:hostId" element={<Client />} />
        {/* Redirect /client to / to handle missing room IDs instead of showing a blank page */}
        <Route path="/client" element={<Navigate to="/" state={{ message: 'Please enter a room code to join a game.' }} replace />} />
        <Route path="/phaser" element={<PhaserTable />} />
      </Routes>
    </Router>
  );
}

export default App;
