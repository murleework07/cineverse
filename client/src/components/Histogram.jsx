export default function Histogram({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="histogram" aria-label="Rating distribution">
      {data.map((d) => (
        <div key={d.rating} className="histogram-col" title={`${d.rating}★: ${d.count}`}>
          <div className="histogram-bar" style={{ height: `${(d.count / max) * 100}%` }} />
          <span>{d.rating}</span>
        </div>
      ))}
    </div>
  );
}

export function SentimentBar({ sentiment }) {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative;
  if (!total) return null;
  const pct = (n) => `${((n / total) * 100).toFixed(0)}%`;
  return (
    <div>
      <div className="sentiment-bar">
        <div className="pos" style={{ width: pct(sentiment.positive) }} />
        <div className="neu" style={{ width: pct(sentiment.neutral) }} />
        <div className="neg" style={{ width: pct(sentiment.negative) }} />
      </div>
      <div className="sentiment-legend">
        <span><i className="dot pos" />Positive {pct(sentiment.positive)}</span>
        <span><i className="dot neu" />Neutral {pct(sentiment.neutral)}</span>
        <span><i className="dot neg" />Negative {pct(sentiment.negative)}</span>
      </div>
    </div>
  );
}
