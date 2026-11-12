// Deterministic gradient poster for movies without artwork.
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function Poster({ movie, size = 'md' }) {
  if (movie.posterUrl) return <img className={`poster ${size}`} src={movie.posterUrl} alt={movie.title} loading="lazy" />;
  const h = hash(movie.title);
  const a = h % 360;
  const b = (a + 40 + (h % 80)) % 360;
  return (
    <div className={`poster ${size}`} style={{ background: `linear-gradient(160deg, hsl(${a} 55% 32%), hsl(${b} 60% 14%))` }} role="img" aria-label={movie.title}>
      <span className="poster-title">{movie.title}</span>
      {movie.releaseYear && <span className="poster-year">{movie.releaseYear}</span>}
    </div>
  );
}
