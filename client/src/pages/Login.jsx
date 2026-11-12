import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';

export default function Login({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await (isRegister ? register(form) : login({ email: form.email, password: form.password }));
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{isRegister ? 'Join CineVerse' : 'Welcome back'}</h1>
        {isRegister && <input placeholder="Username" value={form.username} onChange={set('username')} autoComplete="username" required />}
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} autoComplete="email" required />
        <input type="password" placeholder="Password" value={form.password} onChange={set('password')} autoComplete={isRegister ? 'new-password' : 'current-password'} required />
        {isRegister && <p className="muted xs">At least 8 characters, with an uppercase letter and a number.</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn lg" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}</button>
        <p className="muted center">
          {isRegister ? <>Already have an account? <Link to="/login" className="accent">Log in</Link></> : <>New here? <Link to="/register" className="accent">Create an account</Link></>}
        </p>
        {!isRegister && (
          <div className="demo-box">
            <span className="muted xs">Demo accounts</span>
            <button type="button" className="btn ghost sm" onClick={() => setForm({ ...form, email: 'demo@cineverse.dev', password: 'Demo@1234' })}>User</button>
            <button type="button" className="btn ghost sm" onClick={() => setForm({ ...form, email: 'admin@cineverse.dev', password: 'Admin@1234' })}>Admin</button>
          </div>
        )}
      </form>
    </div>
  );
}
