import { HashRouter as Router, Routes, Route } from 'react-router-dom';
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
        <Route path="/phaser" element={<PhaserTable />} />
      </Routes>
    </Router>
  );
}

export default App;
