/**
 * Video extension for marked.js v16+
 *
 * Usage:
 * [!video](https://www.youtube.com/watch?v=video-id "Video Title")
 * [!video](https://stream.mux.com/video-id "Video Title")
 */
import type { MarkedExtension } from 'marked';

const containerClass = 'md-video-container';
export const youtubePattern =
  /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
export const muxPattern = /stream\.mux\.com\/([A-Za-z0-9]+)/;

export const youtubeParams = [
  'rel=0', // Don't show related videos
  'modestbranding=1', // Reduce YouTube branding
  'playsinline=1', // Play inline on mobile
  'autoplay=0', // Don't autoplay
  'cc_load_policy=1', // Show closed captions if available
].join('&');

const videoTemplate = {
  youtube: (id: string, title: string) => `<div class="${containerClass}">
  <iframe
    width="100%"
    src="https://www.youtube.com/embed/${id}?${youtubeParams}"
    title="${title}"
    allow="autoplay; picture-in-picture"
    allowfullscreen
  ></iframe>
</div>`,
  mux: (id: string, title: string) => `<div class="${containerClass}">
  <iframe
    width="100%"
    src="https://stream.mux.com/${id}"
    title="${title}"
    allow="autoplay; picture-in-picture"
    allowfullscreen
  ></iframe>
</div>`,
};

const videosExtension: MarkedExtension = {
  renderer: {
    link(token) {
      if (token.text !== '!video') {
        // Not a video link, use default renderer
        return false;
      }

      const ytMatch = token.href.match(youtubePattern);
      if (ytMatch) {
        return videoTemplate.youtube(
          ytMatch[1],
          token.title || 'YouTube video',
        );
      }

      const muxMatch = token.href.match(muxPattern);
      if (muxMatch) {
        return videoTemplate.mux(muxMatch[1], token.title || 'Video');
      }

      // Not a recognized video URL, use default renderer
      return false;
    },
  },
};

export default videosExtension;
