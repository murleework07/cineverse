import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MovieRow } from '../components/MovieCard';
import ReviewList from '../components/ReviewList';

export default function Home() {
  const { user } = useAuth();
  const trending = useQuery({ queryKey: ['trending'], queryFn: () => api.get('/movies/trending', { params: { limit: 12 } }).then((r) => r.data.data) });
  const topRated = useQuery({ queryKey: ['movies', 'top'], queryFn: () => api.get('/movies', { params: { sort: 'top_rated', limit: 12 } }).then((r) => r.data.data) });
  const recs = useQuery({
    queryKey: ['recommendations', user?.id],
    queryFn: () => api.get('/recommendations', { params: { limit: 12 } }).then((r) => r.data),
    enabled: !!user,
  });

  return (
    <>
      {!user && (
        <section className="hero">
          <h1>Every film. Every opinion.<br /><span className="accent">Your next favourite.</span></h1>
          <p className="muted">Rate and review movies, follow people whose taste you trust, and get recommendations built from what you actually like.</p>
          <div className="hero-cta">
            <Link to="/register" className="btn lg">Create free account</Link>
            <Link to="/browse" className="btn ghost lg">Browse movies</Link>
          </div>
        </section>
      )}
      {user && recs.data && (
        <MovieRow
          title={`Recommended for ${user.username}`}
          subtitle={recs.data.meta.strategy === 'popularity' ? 'Rate a few movies to personalise this' : `Based on your ${recs.data.meta.basedOn} ratings`}
          movies={recs.data.data}
          renderExtra={(m) => <span className="reason">{m.reason}</span>}
        />
      )}
      <MovieRow title="Trending this week" movies={trending.data} />
      <MovieRow title="Top rated" subtitle="Bayesian-weighted" movies={topRated.data} />
      <section className="section narrow">
        <div className="section-head"><h2>Latest reviews</h2></div>
        <ReviewList queryKey={['reviews', 'recent']} url="/reviews/recent" showMovie />
      </section>
    </>
  );
}
