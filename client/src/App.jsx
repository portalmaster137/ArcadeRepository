import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import NavBar from './components/NavBar';
import HomePage from './pages/HomePage';
import QueuePage from './pages/QueuePage';
import GroupQueuePage from './pages/GroupQueuePage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
          <NavBar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/queue/group/:groupId" element={<GroupQueuePage />} />
            <Route path="/queue/:gameId" element={<QueuePage />} />
          </Routes>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
