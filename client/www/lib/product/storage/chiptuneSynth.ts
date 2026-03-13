// 30-second preview clips from the iTunes Search API (public, no auth)

export const tracks = [
  {
    title: 'Sun & Moon',
    artist: 'Above & Beyond',
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/5e/4a/ca/5e4acac5-8899-fa76-384a-177a551e81dc/mzaf_3672348872110225259.plus.aac.p.m4a',
  },
  {
    title: 'Tell Me',
    artist: 'Clear View & Tiesto',
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/f3/31/ce/f331ce7f-e45e-f084-7d01-439dc54795b5/mzaf_7844572189463479406.plus.aac.p.m4a',
  },
  {
    title: "Way I'm Feeling",
    artist: 'Chicane',
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/06/ef/c0/06efc006-bddb-1f67-a541-f27d2cd3b453/mzaf_9500688281588377187.plus.aac.p.m4a',
  },
  {
    title: "L'Amour Toujours",
    artist: "Gigi D'Agostino",
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/11/3b/ed/113bed77-9069-1218-adf8-09c194ce9eff/mzaf_7154197784246025254.plus.aac.p.m4a',
  },
  {
    title: 'Sandstorm',
    artist: 'Darude',
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/b2/c3/b6/b2c3b692-4c6e-96b4-0b80-a9f2fceee842/mzaf_15150202186372680773.plus.aac.p.m4a',
  },
  {
    title: 'Empty Streets',
    artist: 'Late Night Alumni',
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/35/55/88/35558875-d83b-ab5f-1e07-0ac769cea8d9/mzaf_7267698421149156294.plus.aac.p.m4a',
  },
  {
    title: 'Colour My Eyes',
    artist: 'Mark Norman & Celine',
    previewUrl:
      'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/f4/23/8c/f4238c44-89d1-4c1d-544d-51576447f127/mzaf_12542609431176284794.plus.aac.p.m4a',
  },
];

export class ChiptunePlayer {
  private audio: HTMLAudioElement | null = null;
  private currentTrack = -1;

  onTrackEnd: (() => void) | null = null;

  get activeTrack(): number {
    return this.currentTrack;
  }

  play(trackIndex: number) {
    // Resume if same track is paused
    if (trackIndex === this.currentTrack && this.audio?.paused) {
      this.audio.play();
      return;
    }
    // Start a new track
    this.stopAudio();
    this.currentTrack = trackIndex;
    this.audio = new Audio(tracks[trackIndex].previewUrl);
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
