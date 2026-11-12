import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Poster from '../components/Poster';
import Histogram, { SentimentBar } from '../components/Histogram';
import RatingInput from '../components/RatingInput';
import ReviewList from '../components/ReviewList';
import { MovieRow } from '../components/MovieCard';

function ReviewForm({ movieId, existing, onDone }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(existing?.rating || 0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spoilers, setSpoilers] = useState(false);
  const save = useMutation({
    mutationFn: () => api.post(`/movies/${movieId}/reviews`, { rating, title: title || undefined, body, containsSpoilers: spoilers }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movie', movieId] });
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['recommendations'] });
      onDone();
    },
  });
  return (
    <form className="card review-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <RatingInput value={rating} onChange={setRating} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline (optional)" maxLength={150} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="What did you think? (min 10 characters)" maxLength={10000} />
      <label className="check"><input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} /> Contains spoilers</label>
      {save.isError && <p className="error">{errorMessage(save.error)}</p>}
      <div className="row gap">
        <button className="btn" disabled={!rating || body.trim().length < 10 || save.isPending}>{save.isPending ? 'Posting…' : 'Post review'}</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export default function MovieDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [writing, setWriting] = useState(false);
  const [sort, setSort] = useState('top');

  const { data: movie, isLoading, error } = useQuery({ queryKey: ['movie', id, user?.id], queryFn: () => api.get(`/movies/${id}`).then((r) => r.data.data) });
  const similar = useQuery({ queryKey: ['similar', id], queryFn: () => api.get(`/movies/${id}/similar`).then((r) => r.data.data) });

  const watchlist = useMutation({
    mutationFn: (add) => (add ? api.put(`/watchlist/${id}`, {}) : api.delete(`/watchlist/${id}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['movie', id] }); qc.invalidateQueries({ queryKey: ['watchlist'] }); },
  });

  if (isLoading) return <div className="skeleton hero-skeleton" />;
  if (error) return <div className="center"><h2>Movie not found</h2><Link to="/browse">Back to browse</Link></div>;

  return (
    <>
      <section className="movie-hero">
        <Poster movie={movie} size="lg" />
        <div className="movie-info">
          <h1>{movie.title} <span className="muted light">({movie.releaseYear})</span></h1>
          <p className="muted">{movie.director} · {movie.runtimeMin} min</p>
          <div className="chips">{movie.genres.map((g) => <Link key={g} to={`/browse?genre=${g}`} className="chip">{g}</Link>)}</div>
          <p className="overview">{movie.overview}</p>
          <div className="movie-stats">
            <div className="big-rating">
              <span className="big">{movie.reviewCount ? movie.avgRating.toFixed(1) : '–'}</span>
              <span className="muted">/10 · {movie.reviewCount} reviews</span>
            </div>
            <Histogram data={movie.ratingHistogram} />
          </div>
          <SentimentBar sentiment={movie.sentiment} />
          {user ? (
            <div className="row gap wrap actions">
              {movie.viewer?.reviewId
                ? <span className="badge big">You rated this {movie.viewer.rating}/10</span>
                : <button className="btn" onClick={() => setWriting(true)}>✎ Write a review</button>}
              <button className="btn ghost" disabled={watchlist.isPending} onClick={() => watchlist.mutate(!movie.viewer?.inWatchlist)}>
                {movie.viewer?.inWatchlist ? '✓ In watchlist' : '+ Watchlist'}
              </button>
            </div>
          ) : (
            <p className="muted"><Link to="/login" className="accent">Log in</Link> to review or add to your watchlist.</p>
          )}
        </div>
      </section>

      {writing && <ReviewForm movieId={id} onDone={() => setWriting(false)} />}

      <section className="section narrow">
        <div className="section-head">
          <h2>Reviews</h2>
          <div className="tabs">
            <button className={sort === 'top' ? 'active' : ''} onClick={() => setSort('top')}>Top</button>
            <button className={sort === 'recent' ? 'active' : ''} onClick={() => setSort('recent')}>Recent</button>
          </div>
        </div>
        <ReviewList queryKey={['reviews', 'movie', id]} url={`/movies/${id}/reviews`} params={{ sort }} empty="No reviews yet. Be the first!" />
      </section>

      <MovieRow title="More like this" movies={similar.data} />
    </>
  );
}
