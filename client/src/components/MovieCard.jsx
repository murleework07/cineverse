import { Link } from 'react-router-dom';
import Poster from './Poster';

export default function MovieCard({ movie, extra }) {
  return (
    <Link to={`/movies/${movie.id}`} className="movie-card">
      <Poster movie={movie} />
      <div className="movie-card-body">
        <div className="movie-card-title">{movie.title}</div>
        <div className="movie-card-meta">
          <span className="rating-pill">★ {movie.reviewCount ? movie.avgRating.toFixed(1) : '–'}</span>
          <span className="muted">{movie.releaseYear}</span>
        </div>
        {extra && <div className="movie-card-extra">{extra}</div>}
      </div>
    </Link>
  );
}

export function MovieRow({ title, subtitle, movies, renderExtra }) {
  if (!movies?.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      <div className="movie-row">
        {movies.map((m) => <MovieCard key={m.id} movie={m} extra={renderExtra?.(m)} />)}
      </div>
    </section>
  );
}
