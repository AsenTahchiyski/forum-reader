import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/Spinner';
import { getClient } from '../forum/connection';
import { useAsync } from '../hooks/useAsync';

/**
 * Resolves a quote's post link (/f/:forumId/p/:postId) to the topic holding
 * the post and its position, then forwards to the Thread screen landing on
 * that post. A separate route because the quoted post may live on another
 * page — or in another topic — than the quote.
 */
export function PostJump() {
  const { forumId, postId } = useParams();
  const navigate = useNavigate();

  const { data, error, reload } = useAsync(async () => {
    const client = await getClient(Number(forumId));
    return client.locatePost(postId!);
  }, [forumId, postId]);

  useEffect(() => {
    if (!data?.topicId) return;
    navigate(`/f/${forumId}/t/${data.topicId}`, {
      replace: true,
      state: {
        title: data.title || undefined,
        jumpTo: data.position > 0 ? data.position : undefined
      }
    });
  }, [data, forumId, navigate]);

  const failed =
    error || (data && !data.topicId ? 'The forum could not locate the quoted post.' : null);

  return (
    <div>
      <Header title="Quoted post" back />
      {failed ? (
        <ErrorBanner message={failed} onRetry={reload} />
      ) : (
        <LoadingScreen label="Locating post…" />
      )}
    </div>
  );
}
