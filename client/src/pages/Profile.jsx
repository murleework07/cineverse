import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ReviewList from '../components/ReviewList';

function TasteMatches() {
  const { data } = useQuery({ queryKey: ['taste-matches'], queryFn: () => api.get('/users/me/taste-matches').then((r) => r.data.data) });
  if (!data?.length) return null;
  return (
    <div className="card">
      <h3>People with your taste</h3>
      <p className="muted xs">Pearson correlation of ratings on movies you’ve both reviewed</p>
      {data.map((m) => (
        <Link key={m.username} to={`/u/${m.username}`} className="match-row">
          <span className="avatar sm">{m.username[0].toUpperCase()}</span>
          <span className="grow">{m.username}</span>
          <span className="badge">{Math.round(m.correlation * 100)}% match</span>
        </Link>
      ))}
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['profile', username, user?.id], queryFn: () => api.get(`/users/${username}`).then((r) => r.data.data) });
  const follow = useMutation({
    mutationFn: (on) => (on ? api.put(`/users/${username}/follow`) : api.delete(`/users/${username}/follow`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile', username] }); qc.invalidateQueries({ queryKey: ['reviews', 'feed'] }); },
  });

  if (isLoading) return <div className="skeleton hero-skeleton" />;
  if (error) return <div className="center"><h2>User not found</h2></div>;
  const isMe = user?.id === p.id;

  return (
    <div className="profile-layout">
      <aside>
        <div className="card profile-card">
          <span className="avatar xl">{p.username[0].toUpperCase()}</span>
          <h2>{p.username}</h2>
          {p.bio && <p className="muted">{p.bio}</p>}
          {user && !isMe && (
            <button className={`btn ${p.isFollowing ? 'ghost' : ''}`} disabled={follow.isPending} onClick={() => follow.mutate(!p.isFollowing)}>
              {p.isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
          <div className="stat-grid">
            <div><b>{p.stats.reviewCount}</b><span>reviews</span></div>
            <div><b>{p.stats.avgRatingGiven ?? '–'}</b><span>avg rating</span></div>
            <div><b>{p.stats.followers}</b><span>followers</span></div>
            <div><b>{p.stats.following}</b><span>following</span></div>
            <div><b>{p.stats.likesReceived}</b><span>likes</span></div>
          </div>
        </div>
        {p.topGenres.length > 0 && (
          <div className="card">
            <h3>Favourite genres</h3>
            {p.topGenres.map((g) => (
              <div key={g.name} className="genre-row">
                <span>{g.name}</span>
                <span className="muted xs">{g.count} reviews · ★ {g.avgRating}</span>
              </div>
            ))}
          </div>
        )}
        {isMe && <TasteMatches />}
      </aside>
      <section>
        <h2>Reviews</h2>
        <ReviewList queryKey={['reviews', 'user', username]} url={`/users/${username}/reviews`} showMovie empty="No reviews yet." />
      </section>
    </div>
  );
}
