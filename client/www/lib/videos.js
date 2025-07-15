/**
 * Video extension for marked.js
 *
 * Usage:
 * [!video](https://www.youtube.com/watch?v=video-id "Video Title")
 * [!video](https://stream.mux.com/video-id "Video Title")
 */
import { marked } from 'marked';

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
  youtube: (id, title) => `
    <div class=${containerClass}>
      <iframe
        width="100%"
        src="https://www.youtube.com/embed/${id}?${youtubeParams}"
        title="${title}"
        allow="autoplay; picture-in-picture"
        allowfullscreen>
      </iframe>
    </div>`,

  mux: (id, title) => `
    <div class=${containerClass}>
      <iframe
        width="100%"
        src="https://stream.mux.com/${id}"
        title="${title}"
        allowfullscreen>
      </iframe>
    </div>`,
};

const videos = {
  link(href, title, text) {
    if (text !== '!video') {
      return marked.Renderer.prototype.link.call(this, href, title, text);
    }

    const youtubeMatch = href.match(youtubePattern);
    if (youtubeMatch) {
      return videoTemplate.youtube(youtubeMatch[1], title);
    }

    const muxMatch = href.match(muxPattern);
    if (muxMatch) {
      return videoTemplate.mux(muxMatch[1], title);
    }

    return marked.Renderer.prototype.link.call(this, href, title, text);
  },
};

export default videos;
