import { youtubePattern, youtubeParams } from '@/lib/videos';

export function YouTube({
  src,
  title = 'YouTube video',
}: {
  src: string;
  title?: string;
}) {
  const match = src.match(youtubePattern);
  const videoId = match ? match[1] : null;

  if (!videoId) return null;

  return (
    <span className="md-video-container block">
      <iframe
        width="100%"
        src={`https://www.youtube.com/embed/${videoId}?${youtubeParams}`}
        title={title}
        allow="autoplay; picture-in-picture"
        allowFullScreen
      />
    </span>
  );
}
