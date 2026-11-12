import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    navigate(`/browse?q=${encodeURIComponent(q)}&sort=relevance`);
    setOpen(false);
  };

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link to="/" className="logo">Cine<span>Verse</span></Link>
        <button className="nav-toggle" aria-label="Menu" onClick={() => setOpen(!open)}>☰</button>
        <nav className={`nav-links ${open ? 'open' : ''}`} onClick={(e) => e.target.tagName === 'A' && setOpen(false)}>
          <NavLink to="/browse">Browse</NavLink>
          {user && <NavLink to="/feed">Feed</NavLink>}
          {user && <NavLink to="/watchlist">Watchlist</NavLink>}
          {isAdmin && <NavLink to="/admin">Dashboard</NavLink>}
          <form onSubmit={submit} className="nav-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search movies, directors…" aria-label="Search" />
          </form>
          {user ? (
            <>
              <NavLink to={`/u/${user.username}`} className="avatar-link">
                <span className="avatar sm">{user.username[0].toUpperCase()}</span>{user.username}
              </NavLink>
              <button className="btn ghost sm" onClick={() => logout().then(() => navigate('/'))}>Log out</button>
            </>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <Link to="/register" className="btn sm">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
