// Audio sources and licenses
//
// Hungarian Dance No. 5 (CC0 1.0, Samuel J. Bellardo, piano):
//   https://archive.org/details/SamuelJBellardoPerformanceofJohannesBrahmsHungarianDance_Book15
//
// Por Una Cabeza (CC BY 2.5, Quatuor Quatre Saisons, string quartet):
//   https://archive.org/details/QuartetdeQuatreSaisonsPorUnaCabeza
//
// Habanera from Carmen (CC BY 4.0, Kevin MacLeod / incompetech.com):
//   https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100806
//
// La lisonjera, Op. 50 (CC BY-SA 4.0, Luis Kolodin, piano):
//   https://imslp.org/wiki/La_lisonjera,_Op.50_(Chaminade,_C%C3%A9cile)
//
// Romance in E Minor, S. 169 (CC BY-SA 4.0, German Kitkin, piano):
//   https://imslp.org/wiki/Romance,_S.169_(Liszt,_Franz)

export const tracks = [
  {
    title: 'Hungarian Dance No. 5',
    artist: 'Johannes Brahms',
    previewUrl: '/audio/hungarian-dance-no-5.mp3',
  },
  {
    title: 'Por Una Cabeza',
    artist: 'Carlos Gardel',
    previewUrl: '/audio/por-una-cabeza.mp3',
    sourceUrl: 'https://archive.org/details/QuartetdeQuatreSaisonsPorUnaCabeza',
    license: 'CC BY 2.5',
  },
  {
    title: 'Habanera',
    artist: 'Georges Bizet',
    previewUrl: '/audio/habanera.mp3',
    sourceUrl:
      'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100806',
    license: 'CC BY 4.0',
  },
  {
    title: 'La lisonjera, Op. 50',
    artist: 'Cécile Chaminade',
    previewUrl: '/audio/la-lisonjera.mp3',
    sourceUrl:
      'https://imslp.org/wiki/La_lisonjera,_Op.50_(Chaminade,_C%C3%A9cile)',
    license: 'CC BY-SA 4.0',
  },
  {
    title: 'Romance in E Minor',
    artist: 'Franz Liszt',
    previewUrl: '/audio/romance-e-minor.mp3',
    sourceUrl: 'https://imslp.org/wiki/Romance,_S.169_(Liszt,_Franz)',
    license: 'CC BY-SA 4.0',
  },
];

export class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentTrack = -1;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  onTrackEnd: (() => void) | null = null;

  get activeTrack(): number {
    return this.currentTrack;
  }

  /** Returns 3 values 0-1 representing low, mid, high frequency energy */
  getFrequencyBars(): [number, number, number] {
    if (!this.analyser || !this.freqData) return [0, 0, 0];
    this.analyser.getByteFrequencyData(this.freqData);
    const len = this.freqData.length;
    // Focus on the lower ~40% of bins where piano/orchestral energy lives,
    // split into 3 sub-bands so all bars move independently
    const usable = Math.floor(len * 0.4);
    const bandSize = Math.floor(usable / 3);
    const bands: [number, number, number] = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      let peak = 0;
      for (let i = b * bandSize; i < (b + 1) * bandSize; i++) {
        if (this.freqData[i] > peak) peak = this.freqData[i];
      }
      bands[b] = Math.pow(peak / 255, 0.5);
    }
    return bands;
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.6;
      this.freqData = new Uint8Array(
        new ArrayBuffer(this.analyser.frequencyBinCount),
      );
      this.analyser.connect(this.audioContext.destination);
    }
  }

  play(trackIndex: number) {
    const url = tracks[trackIndex].previewUrl;
    // Resume if same track is paused
    if (trackIndex === this.currentTrack && this.audio?.paused) {
      this.audioContext?.resume();
      this.audio.play();
      return;
    }
    // Start a new track
    this.stopAudio();
    this.currentTrack = trackIndex;
    if (!url) return;
    this.ensureAudioContext();
    this.audio = new Audio(url);
    this.source = this.audioContext!.createMediaElementSource(this.audio);
    this.source.connect(this.analyser!);
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
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
  }
}
