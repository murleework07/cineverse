import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Browse from './pages/Browse';
import MovieDetail from './pages/MovieDetail';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Feed from './pages/Feed';
import Watchlist from './pages/Watchlist';

// recharts is heavy; only admins need it, so code-split the dashboard
const Dashboard = lazy(() => import('./pages/Dashboard'));

function Protected({ children, admin = false }) {
  const { user, ready, isAdmin } = useAuth();
  if (!ready) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Suspense fallback={<div className="center muted">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/movies/:id" element={<MovieDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Login mode="register" />} />
            <Route path="/u/:username" element={<Profile />} />
            <Route path="/feed" element={<Protected><Feed /></Protected>} />
            <Route path="/watchlist" element={<Protected><Watchlist /></Protected>} />
            <Route path="/admin" element={<Protected admin><Dashboard /></Protected>} />
            <Route path="*" element={<div className="center"><h2>404</h2><p className="muted">That page doesn’t exist.</p></div>} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}
