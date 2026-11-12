import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

const timeAgo = (d) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  for (const [unit, secs] of [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]]) {
    if (s >= secs) return `${Math.floor(s / secs)}${unit} ago`;
  }
  return 'just now';
};

function Comments({ reviewId }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const { data } = useQuery({ queryKey: ['comments', reviewId], queryFn: () => api.get(`/reviews/${reviewId}/comments`).then((r) => r.data.data) });
  const add = useMutation({
    mutationFn: () => api.post(`/reviews/${reviewId}/comments`, { body }),
    onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['comments', reviewId] }); },
  });
  return (
    <div className="comments">
      {data?.map((c) => (
        <div key={c.id} className="comment">
          <Link to={`/u/${c.author.username}`} className="strong">{c.author.username}</Link> {c.body}
          <span className="muted xs"> · {timeAgo(c.createdAt)}</span>
        </div>
      ))}
      {user && (
        <form className="comment-form" onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(); }}>
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" maxLength={1000} />
          <button className="btn sm" disabled={add.isPending}>Post</button>
        </form>
      )}
      {add.isError && <p className="error">{errorMessage(add.error)}</p>}
    </div>
  );
}

export default function ReviewCard({ review, showMovie = false }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(review.likedByMe);
  const [likes, setLikes] = useState(review.likeCount);
  const [revealed, setRevealed] = useState(!review.containsSpoilers);
  const [showComments, setShowComments] = useState(false);

  // optimistic like toggle with rollback on failure
  const like = useMutation({
    mutationFn: (next) => (next ? api.put(`/reviews/${review.id}/like`) : api.delete(`/reviews/${review.id}/like`)),
    onMutate: (next) => { setLiked(next); setLikes((n) => n + (next ? 1 : -1)); },
    onError: (_e, next) => { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); },
    onSuccess: (res) => setLikes(res.data.likeCount),
  });

  return (
    <article className="review-card">
      <header className="review-head">
        <div className="review-author">
          <Link to={`/u/${review.author.username}`} className="avatar" aria-hidden="true" tabIndex={-1}>{review.author.username[0].toUpperCase()}</Link>
          <span>
            <Link to={`/u/${review.author.username}`} className="strong">{review.author.username}</Link>
            {showMovie && <> on <Link to={`/movies/${review.movie.id}`} className="accent">{review.movie.title}</Link></>}
            <span className="muted xs block">{timeAgo(review.createdAt)}</span>
          </span>
        </div>
        <div className="review-badges">
          <span className={`badge sentiment-${review.sentiment.label}`} title={`Sentiment score ${review.sentiment.score}`}>{review.sentiment.label}</span>
          <span className="score">{review.rating}<small>/10</small></span>
        </div>
      </header>
      {review.title && <h4>{review.title}</h4>}
      <div className={`review-body ${revealed ? '' : 'spoiler'}`}>
        <p>{review.body}</p>
        {!revealed && <button className="btn sm spoiler-btn" onClick={() => setRevealed(true)}>Contains spoilers — reveal</button>}
      </div>
      <footer className="review-actions">
        <button className={`icon-btn ${liked ? 'liked' : ''}`} disabled={!user || like.isPending} onClick={() => like.mutate(!liked)} aria-pressed={liked}>
          {liked ? '♥' : '♡'} {likes}
        </button>
        <button className="icon-btn" onClick={() => setShowComments((s) => !s)}>💬 {review.commentCount}</button>
      </footer>
      {showComments && <Comments reviewId={review.id} />}
    </article>
  );
}
