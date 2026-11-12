import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import ReviewCard from './ReviewCard';

/** Infinite, cursor-paginated review list driven by an IntersectionObserver sentinel. */
export default function ReviewList({ queryKey, url, params = {}, showMovie = false, empty = 'No reviews yet.' }) {
  const sentinel = useRef(null);
  const q = useInfiniteQuery({
    queryKey: [...queryKey, params],
    queryFn: ({ pageParam }) => api.get(url, { params: { ...params, cursor: pageParam } }).then((r) => r.data),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage, q.fetchNextPage]);

  if (q.isLoading) return <div className="skeleton-list">{[1, 2, 3].map((i) => <div key={i} className="skeleton review" />)}</div>;
  const reviews = q.data?.pages.flatMap((p) => p.data) ?? [];
  if (!reviews.length) return <p className="muted">{empty}</p>;
  return (
    <div className="review-list">
      {reviews.map((r) => <ReviewCard key={r.id} review={r} showMovie={showMovie} />)}
      <div ref={sentinel} />
      {q.isFetchingNextPage && <p className="muted center">Loading more…</p>}
    </div>
  );
}
