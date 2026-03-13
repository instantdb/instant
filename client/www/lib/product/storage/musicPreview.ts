// #todo: replace previewUrls with licensed/self-hosted audio clips
export const tracks = [
  { title: 'Sun & Moon', artist: 'Above & Beyond', previewUrl: '' },
  { title: 'Tell Me', artist: 'Clear View & Tiesto', previewUrl: '' },
  { title: "Way I'm Feeling", artist: 'Chicane', previewUrl: '' },
  { title: "L'Amour Toujours", artist: "Gigi D'Agostino", previewUrl: '' },
  { title: 'Sandstorm', artist: 'Darude', previewUrl: '' },
  { title: 'Empty Streets', artist: 'Late Night Alumni', previewUrl: '' },
  { title: 'Colour My Eyes', artist: 'Mark Norman & Celine', previewUrl: '' },
];

export class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentTrack = -1;

  onTrackEnd: (() => void) | null = null;

  get activeTrack(): number {
    return this.currentTrack;
  }

  play(trackIndex: number) {
    const url = tracks[trackIndex].previewUrl;
    // Resume if same track is paused
    if (trackIndex === this.currentTrack && this.audio?.paused) {
      this.audio.play();
      return;
    }
    // Start a new track
    this.stopAudio();
    this.currentTrack = trackIndex;
    if (!url) return;
    this.audio = new Audio(url);
    this.audio.addEventListener('ended', () => this.onTrackEnd?.());
    this.audio.play();
  }

  pause() {
    this.audio?.pause();
  }

  stop() {
    this.stopAudio();
    this.currentTrack = -1;
  }

  private stopAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }
}
