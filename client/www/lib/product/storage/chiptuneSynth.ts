// -- Note helpers ----------------------------------------------------------

type MelodyNote = { freq: number; dur: number };

const SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function noteFreq(note: string, octave: number): number {
  const s = SEMITONES[note];
  if (s === undefined) return 0;
  return 440 * Math.pow(2, (s - 9) / 12 + (octave - 4));
}

/** Note shorthand: n("C", 4, 200) => { freq: 261.63, dur: 200 } */
function n(note: string, oct: number, dur: number): MelodyNote {
  return { freq: noteFreq(note, oct), dur };
}

/** Rest shorthand */
function r(dur: number): MelodyNote {
  return { freq: 0, dur };
}

// -- Track metadata --------------------------------------------------------

export const tracks = [
  { title: 'Sun and Moon', artist: 'Above & Beyond' },
  { title: 'Tell Me', artist: 'Clear View & Tiesto' },
  { title: "Way I'm Feeling", artist: 'Chicane' },
  { title: "L'Amour Toujours", artist: "Gigi D'Agostino" },
  { title: 'Sandstorm', artist: 'Darude' },
  { title: 'Empty Streets', artist: 'Late Night Alumni' },
  { title: 'Color My Eyes', artist: 'Tiesto' },
];

// -- Melodies (chiptune transcriptions of each song's hook) ----------------
// Keys and intervals derived from librosa pyin pitch detection on YouTube audio

// 1. Sun and Moon - Above & Beyond (C# minor, ~138 BPM)
// Soaring vocal chorus — pyin confirmed C#4/E4/F#4 center
const sunAndMoon: MelodyNote[] = [
  n('C#', 4, 430), n('E', 4, 220), n('F#', 4, 430), n('G#', 4, 430),
  n('A', 4, 220), n('G#', 4, 220),
  n('F#', 4, 430), n('E', 4, 430), r(220),
  n('E', 4, 220), n('F#', 4, 220), n('G#', 4, 430), n('A', 4, 220),
  n('B', 4, 220),
  n('A', 4, 430), n('G#', 4, 220), n('F#', 4, 220), n('E', 4, 860),
  r(430),
];

// 2. Tell Me - Clear View & Tiesto (C major, ~132 BPM)
// Trance hook — pyin showed C4 root, E4-F4-G4 melody, F#4-G4 oscillation
const tellMe: MelodyNote[] = [
  n('C', 4, 230), n('E', 4, 230), n('G', 4, 460),
  n('F', 4, 230), n('E', 4, 230),
  n('D', 4, 460), n('C', 4, 230), n('D', 4, 230),
  n('E', 4, 460), n('G', 4, 230), n('F', 4, 230),
  n('E', 4, 460), n('D', 4, 230), n('C', 4, 460), r(230),
  n('C', 4, 230), n('D', 4, 230), n('E', 4, 230), n('F', 4, 230),
  n('G', 4, 690), n('F', 4, 230), n('E', 4, 460),
  n('D', 4, 460), n('C', 4, 690), r(460),
];

// 3. Way I'm Feeling - Chicane (F# minor, ~130 BPM)
// Dreamy Balearic trance — pyin showed F#4 sustained (1137ms), G#4/5 peaks
const wayImFeeling: MelodyNote[] = [
  n('F#', 4, 460), n('G#', 4, 230), n('A', 4, 460), n('B', 4, 230),
  n('C#', 5, 460), n('B', 4, 230), n('A', 4, 690), r(230),
  n('A', 4, 460), n('G#', 4, 230), n('F#', 4, 460), n('E', 4, 230),
  n('F#', 4, 460), n('G#', 4, 230),
  n('A', 4, 460), n('G#', 4, 230), n('F#', 4, 920), r(460),
];

// 4. L'Amour Toujours - Gigi D'Agostino (C minor, ~138 BPM)
// "I still believe" chorus — pyin confirmed G4-Ab4 oscillation (5th-b6 of Cm)
const lamourToujours: MelodyNote[] = [
  n('Eb', 4, 220), n('F', 4, 220), n('G', 4, 430), n('G', 4, 220),
  n('Bb', 4, 220),
  n('Ab', 4, 430), n('G', 4, 220), n('F', 4, 650),
  n('Eb', 4, 220), n('F', 4, 220), n('G', 4, 430), n('Bb', 4, 220),
  n('C', 5, 220),
  n('Bb', 4, 430), n('Ab', 4, 220), n('G', 4, 650),
  n('F', 4, 220), n('Eb', 4, 860), r(430),
];

// 5. Sandstorm - Darude (B minor, ~136 BPM)
// The legendary synth riff — pyin confirmed B4 tonic, E5/D5/C#5 upper melody
const sandstorm: MelodyNote[] = [
  // Phrase 1: B staccato → E5 → D5 → C#5 → B4
  n('B', 4, 110), r(110), n('B', 4, 110), r(110),
  n('B', 4, 110), n('B', 4, 110), n('B', 4, 220), r(110),
  n('E', 5, 330), r(110), n('D', 5, 220), r(220),
  n('C#', 5, 330), r(110), n('B', 4, 220), r(440),
  // Phrase 2: B staccato → D5 → C#5 → B4 → A4
  n('B', 4, 110), r(110), n('B', 4, 110), r(110),
  n('B', 4, 110), n('B', 4, 110), n('B', 4, 220), r(110),
  n('D', 5, 330), r(110), n('C#', 5, 220), r(220),
  n('B', 4, 330), r(110), n('A', 4, 220), r(220),
  n('B', 4, 880), r(220),
];

// 6. Empty Streets - Late Night Alumni (F major, ~128 BPM)
// Haunting vocal melody — pyin showed F4 dominant (835ms, 1764ms), A4 peak, F-E oscillation
const emptyStreets: MelodyNote[] = [
  n('F', 4, 470), n('A', 4, 235), n('C', 5, 700),
  n('Bb', 4, 235), n('A', 4, 470),
  n('G', 4, 235), n('F', 4, 700), r(235),
  n('F', 4, 470), n('G', 4, 235), n('A', 4, 470),
  n('Bb', 4, 470), n('A', 4, 235),
  n('G', 4, 470), n('F', 4, 700), r(470),
];

// 7. Color My Eyes - Tiesto (C#/Db major, ~136 BPM)
// Melodic trance — pyin showed C#4/D#4/F4/G#4/A#4 center
const colorMyEyes: MelodyNote[] = [
  n('C#', 4, 220), n('D#', 4, 220), n('F', 4, 440),
  n('F#', 4, 220), n('G#', 4, 440),
  n('A#', 4, 220), n('G#', 4, 220),
  n('F#', 4, 440), n('F', 4, 220), n('D#', 4, 440),
  n('C#', 4, 660), r(220),
  n('G#', 4, 220), n('A#', 4, 220), n('C', 5, 440),
  n('A#', 4, 220), n('G#', 4, 440),
  n('F#', 4, 220), n('F', 4, 220), n('D#', 4, 440),
  n('C#', 4, 880), r(440),
];

const melodies: MelodyNote[][] = [
  sunAndMoon,
  tellMe,
  wayImFeeling,
  lamourToujours,
  sandstorm,
  emptyStreets,
  colorMyEyes,
];

// -- Player ----------------------------------------------------------------

const LOOPS_PER_TRACK = 3;
const MASTER_VOLUME = 0.15;

export class ChiptunePlayer {
  private ctx: AudioContext | null = null;
  private currentTrack = -1;
  private playing = false;
  private noteIndex = 0;
  private loopCount = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  onTrackEnd: (() => void) | null = null;

  get activeTrack(): number {
    return this.currentTrack;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  play(trackIndex: number) {
    // Resume if same track is paused mid-note
    if (trackIndex === this.currentTrack && !this.playing) {
      this.ensureContext();
      this.playing = true;
      this.scheduleNext();
      return;
    }
    // Start (or restart) a track
    this.clearSchedule();
    this.currentTrack = trackIndex;
    this.noteIndex = 0;
    this.loopCount = 0;
    this.ensureContext();
    this.playing = true;
    this.scheduleNext();
  }

  pause() {
    this.playing = false;
    this.clearSchedule();
  }

  stop() {
    this.pause();
    this.currentTrack = -1;
    this.noteIndex = 0;
    this.loopCount = 0;
  }

  private clearSchedule() {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private scheduleNext() {
    if (!this.playing) return;
    const melody = melodies[this.currentTrack];
    if (!melody) return;

    // End of melody — loop or advance
    if (this.noteIndex >= melody.length) {
      this.loopCount++;
      if (this.loopCount >= LOOPS_PER_TRACK) {
        this.playing = false;
        this.onTrackEnd?.();
        return;
      }
      this.noteIndex = 0;
    }

    const note = melody[this.noteIndex];
    if (note.freq > 0) {
      this.playNote(note.freq, note.dur);
    }

    this.noteIndex++;
    this.timeoutId = setTimeout(() => this.scheduleNext(), note.dur);
  }

  private playNote(frequency: number, duration: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = frequency;

    const now = ctx.currentTime;
    const durSec = duration / 1000;
    const attackEnd = Math.min(0.005, durSec * 0.3);
    const releaseStart = Math.max(attackEnd + 0.001, durSec - 0.02);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MASTER_VOLUME, now + attackEnd);
    gain.gain.setValueAtTime(MASTER_VOLUME, now + releaseStart);
    gain.gain.linearRampToValueAtTime(0, now + durSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durSec + 0.01);
  }
}
