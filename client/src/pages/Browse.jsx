import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import MovieCard from '../components/MovieCard';
import useDebounce from '../hooks/useDebounce';

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debouncedQ = useDebounce(q, 350);

  const filters = {
    q: params.get('q') || undefined,
    genre: params.get('genre') || undefined,
    yearFrom: params.get('yearFrom') || undefined,
    minRating: params.get('minRating') || undefined,
    sort: params.get('sort') || 'popular',
    page: Number(params.get('page') || 1),
    limit: 24,
  };

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => { setQ(params.get('q') || ''); }, [params.get('q')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (debouncedQ !== (params.get('q') || '')) update({ q: debouncedQ, sort: debouncedQ ? 'relevance' : filters.sort === 'relevance' ? 'popular' : filters.sort });
  }, [debouncedQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const genres = useQuery({ queryKey: ['genres'], queryFn: () => api.get('/movies/genres').then((r) => r.data.data), staleTime: Infinity });
  const movies = useQuery({
    queryKey: ['movies', filters],
    queryFn: () => api.get('/movies', { params: filters }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="section">
      <h1>Browse</h1>
      <div className="filters">
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, overview or director…" aria-label="Search" />
        <select value={filters.genre || ''} onChange={(e) => update({ genre: e.target.value })} aria-label="Genre">
          <option value="">All genres</option>
          {genres.data?.map((g) => <option key={g.name} value={g.name}>{g.name} ({g.movieCount})</option>)}
        </select>
        <select value={filters.yearFrom || ''} onChange={(e) => update({ yearFrom: e.target.value })} aria-label="Released after">
          <option value="">Any year</option>
          {[2020, 2010, 2000, 1990].map((y) => <option key={y} value={y}>{y}+</option>)}
        </select>
        <select value={filters.minRating || ''} onChange={(e) => update({ minRating: e.target.value })} aria-label="Minimum rating">
          <option value="">Any rating</option>
          {[8, 7, 6].map((r) => <option key={r} value={r}>★ {r}+</option>)}
        </select>
        <select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
          {filters.q && <option value="relevance">Relevance</option>}
          <option value="popular">Most reviewed</option>
          <option value="top_rated">Top rated</option>
          <option value="newest">Newest</option>
          <option value="title">A–Z</option>
        </select>
      </div>

      {movies.data && <p className="muted">{movies.data.meta.total} movies</p>}
      <div className={`grid ${movies.isPlaceholderData ? 'fading' : ''}`}>
        {movies.isLoading && Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton poster md" />)}
        {movies.data?.data.map((m) => <MovieCard key={m.id} movie={m} />)}
      </div>
      {movies.data?.data.length === 0 && <p className="muted center">No movies match those filters.</p>}

      {movies.data?.meta.totalPages > 1 && (
        <div className="pager">
          <button className="btn ghost sm" disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })}>← Prev</button>
          <span className="muted">Page {filters.page} of {movies.data.meta.totalPages}</span>
          <button className="btn ghost sm" disabled={filters.page >= movies.data.meta.totalPages} onClick={() => update({ page: filters.page + 1 })}>Next →</button>
        </div>
      )}
    </div>
  );
}
