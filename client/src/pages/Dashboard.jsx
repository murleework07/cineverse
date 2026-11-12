import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api/client';

// Validated dark-surface palette (categorical slots 1–3); text never wears series colour.
const C = { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', neutral: '#6b6a64', grid: '#2a2a28', axis: '#8a897f' };
const axis = { stroke: C.axis, fontSize: 12, tickLine: false, axisLine: false };
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function ChartTooltip({ active, payload, label, unit = '', labelFmt = fmtDate }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="muted xs">{labelFmt(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row gap"><i className="dot" style={{ background: p.color || p.fill }} />{p.name}: <b>{p.value ?? '–'}{unit}</b></div>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="kpi card">
      <span className="muted xs">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="muted xs">{sub}</span>}
    </div>
  );
}

function Panel({ title, subtitle, children, className = '' }) {
  return (
    <section className={`card panel ${className}`}>
      <h3>{title}</h3>
      {subtitle && <p className="muted xs">{subtitle}</p>}
      {children}
    </section>
  );
}

function HBars({ rows, label, value, fmt = (v) => v, color = C.blue }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={label(r)} className="hbar-row" title={`${label(r)}: ${fmt(value(r))}`}>
          <span className="hbar-label">{label(r)}</span>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(value(r) / max) * 100}%`, background: color }} /></div>
          <span className="hbar-value">{fmt(value(r))}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const { data: d, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => api.get('/analytics/dashboard', { params: { days } }).then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="center muted">Crunching numbers…</div>;
  const o = d.overview;
  const s = d.sentiment.labels;
  const sTotal = s.positive + s.neutral + s.negative || 1;
  const f = d.engagement.funnel;

  return (
    <div className="section dashboard">
      <div className="section-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted xs">Updated {new Date(dataUpdatedAt).toLocaleTimeString()} · auto-refreshes every minute</p>
        </div>
        <div className="tabs" role="group" aria-label="Time range">
          {[7, 30, 90].map((n) => <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>{n}d</button>)}
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Total users" value={o.users} sub={`${o.mau} active (30d)`} />
        <Kpi label="DAU / WAU" value={`${o.dau} / ${o.wau}`} sub={`Stickiness ${o.stickiness}% (DAU/MAU)`} />
        <Kpi label={`Reviews (${days}d)`} value={o.reviewsInPeriod}
          sub={o.reviewGrowthPct == null ? '—' : `${o.reviewGrowthPct >= 0 ? '▲' : '▼'} ${Math.abs(o.reviewGrowthPct)}% vs previous ${days}d`} />
        <Kpi label="Avg rating" value={o.avgRating.toFixed(2)} sub={`${o.reviews} reviews total`} />
        <Kpi label="Engagement" value={o.likes + o.comments} sub={`${o.likes} likes · ${o.comments} comments`} />
      </div>

      <div className="dash-grid">
        <Panel title="Reviews per day">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={d.activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.blue} stopOpacity={0.35} /><stop offset="1" stopColor={C.blue} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="date" tickFormatter={fmtDate} {...axis} minTickGap={24} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: C.axis, strokeDasharray: 3 }} />
              <Area type="monotone" dataKey="reviews" name="Reviews" stroke={C.blue} strokeWidth={2} fill="url(#g1)" activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Daily active users">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="date" tickFormatter={fmtDate} {...axis} minTickGap={24} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: C.axis, strokeDasharray: 3 }} />
              <Line type="monotone" dataKey="activeUsers" name="Active users" stroke={C.aqua} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Rating distribution" subtitle="All reviews, 1–10">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.ratingDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="rating" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip content={<ChartTooltip labelFmt={(l) => `${l} / 10`} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" name="Reviews" fill={C.blue} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Review sentiment" subtitle="NLP sentiment of review text vs. star rating">
          <div className="hero-number">
            <span className="big">{d.sentiment.ratingSentimentCorrelation ?? '–'}</span>
            <span className="muted xs">Pearson r between rating and text sentiment</span>
          </div>
          <div className="stacked">
            {[['positive', C.aqua], ['neutral', C.neutral], ['negative', C.orange]].map(([k, color]) => (
              <div key={k} style={{ width: `${(s[k] / sTotal) * 100}%`, background: color }} title={`${k}: ${s[k]}`} />
            ))}
          </div>
          <div className="sentiment-legend">
            {[['positive', C.aqua], ['neutral', C.neutral], ['negative', C.orange]].map(([k, color]) => (
              <span key={k}><i className="dot" style={{ background: color }} />{k} {Math.round((s[k] / sTotal) * 100)}% ({s[k]})</span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={d.activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" hide />
              <YAxis domain={[-1, 1]} {...axis} ticks={[-1, 0, 1]} />
              <CartesianGrid vertical={false} stroke={C.grid} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="avgSentiment" name="Avg sentiment" stroke={C.aqua} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Genres by review volume" subtitle="Avg rating shown per genre">
          <HBars rows={d.genres.slice(0, 10)} label={(g) => g.genre} value={(g) => g.reviews} fmt={(v) => v} />
          <table className="mini-table">
            <thead><tr><th>Genre</th><th>Avg ★</th><th>Sentiment</th><th>Reviewers</th></tr></thead>
            <tbody>{d.genres.slice(0, 6).map((g) => <tr key={g.genre}><td>{g.genre}</td><td>{g.avgRating}</td><td>{g.avgSentiment}</td><td>{g.reviewers}</td></tr>)}</tbody>
          </table>
        </Panel>

        <Panel title={`Engagement funnel (${days}d)`} subtitle="Distinct users at each step">
          <HBars
            rows={[{ k: 'Viewed a movie', v: f.viewed }, { k: 'Added to watchlist', v: f.watchlisted }, { k: 'Wrote a review', v: f.reviewed }]}
            label={(r) => r.k} value={(r) => r.v}
            fmt={(v) => `${v} (${f.viewed ? Math.round((v / f.viewed) * 100) : 0}%)`} color={C.aqua}
          />
          <h4>Top searches</h4>
          <div className="chips">{d.engagement.topSearches.map((t) => <span key={t.term} className="chip">{t.term} <b>{t.count}</b></span>)}</div>
        </Panel>

        <Panel title="Top rated" subtitle="Bayesian weighted (m = 5)">
          <table className="mini-table">
            <thead><tr><th>Movie</th><th>Weighted</th><th>Avg</th><th>n</th></tr></thead>
            <tbody>{d.movies.topRated.map((m) => <tr key={m.id}><td><Link to={`/movies/${m.id}`}>{m.title}</Link></td><td>{m.weightedRating}</td><td>{m.avgRating}</td><td>{m.reviewCount}</td></tr>)}</tbody>
          </table>
        </Panel>

        <Panel title="Most divisive" subtitle="Highest rating standard deviation (≥ 4 reviews)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart layout="vertical" data={d.movies.controversial} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="title" width={130} {...axis} />
              <Tooltip content={<ChartTooltip labelFmt={(l) => l} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="stddev" name="Std. dev" radius={[0, 4, 4, 0]} barSize={14}>
                {d.movies.controversial.map((m) => <Cell key={m.id} fill={C.orange} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Rating / text mismatches" subtitle="Possible sarcasm, mis-clicks or spam: worth a moderator's look" className="wide">
          {d.sentiment.mismatches.length === 0 && <p className="muted">None found.</p>}
          {d.sentiment.mismatches.map((m) => (
            <div key={m.id} className="mismatch">
              <span className="badge">{m.rating}/10</span>
              <span className="badge sentiment-negative">sentiment {m.sentimentScore}</span>
              <span className="strong">{m.movie}</span>
              <p className="muted">“{m.excerpt}…”</p>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
