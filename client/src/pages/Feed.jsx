import { Link } from 'react-router-dom';
import ReviewList from '../components/ReviewList';

export default function Feed() {
  return (
    <section className="section narrow">
      <h1>Your feed</h1>
      <p className="muted">Latest reviews from people you follow.</p>
      <ReviewList
        queryKey={['reviews', 'feed']}
        url="/reviews/feed"
        showMovie
        empty={<>Your feed is empty. Find people to follow on <Link to="/" className="accent">the home page</Link> or from your profile’s taste matches.</>}
      />
    </section>
  );
}
