import { useState } from 'react';

export default function RatingInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="rating-input" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating out of 10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} out of 10`}
          className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}>★</button>
      ))}
      <span className="rating-input-value">{shown ? `${shown}/10` : 'Rate'}</span>
    </div>
  );
}
