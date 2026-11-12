import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import MovieCard from '../components/MovieCard';

export default function Watchlist() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['watchlist'], queryFn: () => api.get('/watchlist').then((r) => r.data.data) });
  const mark = useMutation({
    mutationFn: ({ id, watched }) => api.put(`/watchlist/${id}`, { watched }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/watchlist/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  if (isLoading) return <div className="center muted">Loading…</div>;
  const toWatch = data.filter((m) => !m.watched);
  const watched = data.filter((m) => m.watched);

  const renderGroup = (list) => (
    <div className="grid">
      {list.map((m) => (
        <div key={m.id} className="wl-item">
          <MovieCard movie={m} />
          <div className="row gap">
            <button className="btn ghost sm" onClick={() => mark.mutate({ id: m.id, watched: !m.watched })}>{m.watched ? 'Unwatch' : '✓ Watched'}</button>
            <button className="btn ghost sm" onClick={() => remove.mutate(m.id)} aria-label={`Remove ${m.title}`}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="section">
      <h1>Watchlist</h1>
      {data.length === 0 && <p className="muted">Nothing here yet. <Link to="/browse" className="accent">Find something to watch.</Link></p>}
      {toWatch.length > 0 && <><h2>To watch ({toWatch.length})</h2>{renderGroup(toWatch)}</>}
      {watched.length > 0 && <><h2>Watched ({watched.length})</h2>{renderGroup(watched)}</>}
    </div>
  );
}
