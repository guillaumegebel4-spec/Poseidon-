// ============================================================
// POSEIDON — AUDIO ENGINE
// Web Audio API — procedural synthesis of music and SFX.
// No audio file assets required — everything is synthesized.
// ============================================================

import { getAudioContext } from '../main.js';

// ─── HELPERS ─────────────────────────────────────────────────────

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function noteToFreq(note) {
  // note format: 'A4', 'C#3', 'Bb5', etc.
  const notes = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const match = note.match(/^([A-G]#?b?)(\d)$/);
  if (!match) return 440;
  const semitone = notes[match[1]] ?? 9;
  const octave = parseInt(match[2]);
  return 440 * Math.pow(2, (semitone - 9 + (octave - 4) * 12) / 12);
}

// ─────────────────────────────────────────────────────────────────
export class AudioEngine {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._musicGain = null;
    this._sfxGain = null;

    this._musicPlaying = false;
    this._currentTrack = null;
    this._trackNodes = [];    // nodes to stop when track changes
    this._scheduledIds = [];  // setInterval IDs for music loops

    this._masterVolume = 0.8;
    this._musicVolume = 0.55;
    this._sfxVolume = 0.75;

    this._muted = false;
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALISATION
  // ═══════════════════════════════════════════════════════════════

  init() {
    try {
      this._ctx = getAudioContext();
    } catch (e) {
      console.warn('AudioEngine: could not get AudioContext', e);
      return;
    }

    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._masterVolume;
    this._masterGain.connect(this._ctx.destination);

    this._musicGain = this._ctx.createGain();
    this._musicGain.gain.value = this._musicVolume;
    this._musicGain.connect(this._masterGain);

    this._sfxGain = this._ctx.createGain();
    this._sfxGain.gain.value = this._sfxVolume;
    this._sfxGain.connect(this._masterGain);

    // Compressor for clean mix
    const comp = this._ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 6;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this._masterGain.disconnect();
    this._masterGain.connect(comp);
    comp.connect(this._ctx.destination);
  }

  resume() {
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VOLUME CONTROL
  // ═══════════════════════════════════════════════════════════════

  setMasterVolume(v) {
    this._masterVolume = clamp(v, 0, 1);
    if (this._masterGain) this._masterGain.gain.setTargetAtTime(this._masterVolume, this._ctx.currentTime, 0.05);
  }

  setMusicVolume(v) {
    this._musicVolume = clamp(v, 0, 1);
    if (this._musicGain) this._musicGain.gain.setTargetAtTime(this._musicVolume, this._ctx.currentTime, 0.05);
  }

  setSfxVolume(v) {
    this._sfxVolume = clamp(v, 0, 1);
    if (this._sfxGain) this._sfxGain.gain.setTargetAtTime(this._sfxVolume, this._ctx.currentTime, 0.05);
  }

  mute()   { this._muted = true;  if (this._masterGain) this._masterGain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.05); }
  unmute() { this._muted = false; if (this._masterGain) this._masterGain.gain.setTargetAtTime(this._masterVolume, this._ctx.currentTime, 0.05); }

  // ═══════════════════════════════════════════════════════════════
  // MUSIC TRACKS
  // ═══════════════════════════════════════════════════════════════

  playMusic(trackId) {
    if (!this._ctx) return;
    if (this._currentTrack === trackId && this._musicPlaying) return;

    this.stopMusic();
    this._currentTrack = trackId;
    this._musicPlaying = true;

    switch (trackId) {
      case 'menu':     this._playMenuTheme();    break;
      case 'forest':   this._playForestTheme();  break;
      case 'volcanic': this._playVolcanicTheme();break;
      case 'cyber':    this._playCyberTheme();   break;
      case 'ruins':    this._playRuinsTheme();   break;
      case 'combat':   this._playCombatTheme();  break;
      case 'boss':     this._playBossTheme();    break;
      case 'victory':  this._playVictoryStinger();break;
      case 'gameover': this._playGameOverStinger();break;
      default:         this._playMenuTheme();    break;
    }
  }

  stopMusic(fadeDuration = 1.5) {
    this._musicPlaying = false;
    this._currentTrack = null;

    // Cancel scheduled loops
    this._scheduledIds.forEach(id => clearInterval(id));
    this._scheduledIds = [];

    // Fade out & stop all music nodes
    if (this._musicGain && this._ctx) {
      const now = this._ctx.currentTime;
      this._musicGain.gain.setTargetAtTime(0, now, fadeDuration / 4);
      setTimeout(() => {
        this._trackNodes.forEach(n => { try { n.stop(); } catch (_) {} });
        this._trackNodes = [];
        if (this._musicGain) {
          this._musicGain.gain.setTargetAtTime(this._musicVolume, this._ctx.currentTime, 0.1);
        }
      }, fadeDuration * 1000);
    }
  }

  // ─── MENU THEME ──────────────────────────────────────────────
  _playMenuTheme() {
    // Ambient pads + arpeggiated melody — atmospheric & mysterious
    const bpm = 72;
    const beat = 60 / bpm;

    // Pad chord (Am pentatonic)
    const chords = [
      ['A3', 'C4', 'E4', 'G4'],
      ['G3', 'B3', 'D4', 'F#4'],
      ['F3', 'A3', 'C4', 'E4'],
      ['E3', 'G3', 'B3', 'D4'],
    ];

    let chordIdx = 0;
    const playChord = () => {
      if (!this._musicPlaying) return;
      const chord = chords[chordIdx % chords.length];
      chord.forEach((note, i) => {
        this._synthPad(note, beat * 7, 0.06, i * 0.08);
      });
      chordIdx++;
    };

    // Arpeggio melody
    const arpNotes = ['A4', 'C5', 'E5', 'G5', 'A5', 'G5', 'E5', 'C5'];
    let arpIdx = 0;
    const playArp = () => {
      if (!this._musicPlaying) return;
      this._synthBell(arpNotes[arpIdx % arpNotes.length], beat * 0.5, 0.04);
      arpIdx++;
    };

    // Bass drone
    this._synthDrone('A2', 0.08);

    playChord();
    const chordId = setInterval(playChord, beat * 8 * 1000);
    const arpId   = setInterval(playArp,   beat * 0.5 * 1000);
    this._scheduledIds.push(chordId, arpId);
  }

  // ─── FOREST THEME ────────────────────────────────────────────
  _playForestTheme() {
    const bpm = 80;
    const beat = 60 / bpm;

    // Nature-inspired melody — major pentatonic in G
    const melody = ['G4','B4','D5','G5','D5','B4','A4','G4','E5','D5','B4','G4'];
    let mIdx = 0;

    const playMelody = () => {
      if (!this._musicPlaying) return;
      this._synthFlute(melody[mIdx % melody.length], beat * 0.75, 0.07);
      mIdx++;
    };

    const bass = ['G2', 'D3', 'G2', 'C3'];
    let bIdx = 0;
    const playBass = () => {
      if (!this._musicPlaying) return;
      this._synthBass(bass[bIdx % bass.length], beat * 2, 0.06);
      bIdx++;
    };

    // Bird chirp sfx loop
    const birdLoop = () => {
      if (!this._musicPlaying) return;
      if (Math.random() < 0.4) this._synthBird();
    };

    playMelody();
    playBass();
    const mId   = setInterval(playMelody, beat * 0.75 * 1000);
    const bId   = setInterval(playBass,   beat * 2 * 1000);
    const birdId = setInterval(birdLoop,  2000 + Math.random() * 3000);
    this._scheduledIds.push(mId, bId, birdId);
  }

  // ─── VOLCANIC THEME ──────────────────────────────────────────
  _playVolcanicTheme() {
    const bpm = 100;
    const beat = 60 / bpm;

    // Dark & intense — phrygian dominant
    const melody = ['E4','F4','G#4','A4','B4','A4','G#4','F4','E4','D#4'];
    let mIdx = 0;
    const playMelody = () => {
      if (!this._musicPlaying) return;
      this._synthSaw(melody[mIdx % melody.length], beat * 0.4, 0.05);
      mIdx++;
    };

    // Heavy drum pattern
    const pattern = [1, 0, 0, 1, 0, 1, 0, 0]; // kick pattern
    let pIdx = 0;
    const playDrum = () => {
      if (!this._musicPlaying) return;
      if (pattern[pIdx % pattern.length]) this._synthKick(0.09);
      if (pIdx % 4 === 2) this._synthSnare(0.05);
      pIdx++;
    };

    playMelody();
    playDrum();
    const mId = setInterval(playMelody, beat * 0.5 * 1000);
    const dId = setInterval(playDrum,   beat * 0.5 * 1000);
    this._scheduledIds.push(mId, dId);
  }

  // ─── CYBER THEME ─────────────────────────────────────────────
  _playCyberTheme() {
    const bpm = 120;
    const beat = 60 / bpm;

    // Synthwave / cyberpunk — minor pentatonic with 16th arp
    const arpNotes = ['C4','Eb4','G4','Bb4','C5','Bb4','G4','Eb4','C4','Eb4','F4','Ab4'];
    let aIdx = 0;
    const playArp = () => {
      if (!this._musicPlaying) return;
      this._synthSquare(arpNotes[aIdx % arpNotes.length], beat * 0.25, 0.05);
      aIdx++;
    };

    // Beat
    let bIdx = 0;
    const playBeat = () => {
      if (!this._musicPlaying) return;
      if (bIdx % 4 === 0) this._synthKick(0.1);
      if (bIdx % 4 === 2) this._synthSnare(0.06);
      if (bIdx % 2 === 0) this._synthHihat(0.03);
      bIdx++;
    };

    // Bass pulse
    const bassNotes = ['C2','C2','Eb2','G2'];
    let bassIdx = 0;
    const playBass = () => {
      if (!this._musicPlaying) return;
      this._synthPulseBass(bassNotes[bassIdx % bassNotes.length], beat, 0.08);
      bassIdx++;
    };

    playArp();
    playBeat();
    playBass();
    const aId  = setInterval(playArp,  beat * 0.25 * 1000);
    const dId  = setInterval(playBeat, beat * 0.5 * 1000);
    const bId  = setInterval(playBass, beat * 1000);
    this._scheduledIds.push(aId, dId, bId);
  }

  // ─── RUINS THEME ─────────────────────────────────────────────
  _playRuinsTheme() {
    const bpm = 60;
    const beat = 60 / bpm;

    // Ancient, mysterious — dorian mode
    const melody = ['D4','E4','F4','A4','B4','A4','F4','E4','D4','C4','D4'];
    let mIdx = 0;
    const playMelody = () => {
      if (!this._musicPlaying) return;
      this._synthBell(melody[mIdx % melody.length], beat, 0.06);
      mIdx++;
    };

    // Low drone
    this._synthDrone('D2', 0.05);

    playMelody();
    const mId = setInterval(playMelody, beat * 1000);
    this._scheduledIds.push(mId);
  }

  // ─── COMBAT THEME ────────────────────────────────────────────
  _playCombatTheme() {
    const bpm = 140;
    const beat = 60 / bpm;

    // Intense combat — aggressive rhythm + power chords
    let bIdx = 0;
    const playDrum = () => {
      if (!this._musicPlaying) return;
      if (bIdx % 2 === 0) this._synthKick(0.11);
      if (bIdx % 4 === 2) this._synthSnare(0.07);
      if (bIdx % 1 === 0) this._synthHihat(0.02);
      bIdx++;
    };

    const powerChords = [['A3','E4'],['G3','D4'],['F3','C4'],['E3','B3']];
    let cIdx = 0;
    const playChord = () => {
      if (!this._musicPlaying) return;
      const chord = powerChords[cIdx % powerChords.length];
      chord.forEach(n => this._synthSaw(n, beat * 1.8, 0.05));
      cIdx++;
    };

    const lead = ['A5','G5','E5','D5','F5','E5','C5','A4'];
    let lIdx = 0;
    const playLead = () => {
      if (!this._musicPlaying) return;
      this._synthSaw(lead[lIdx % lead.length], beat * 0.5, 0.04);
      lIdx++;
    };

    playDrum();
    playChord();
    playLead();
    const dId = setInterval(playDrum,  beat * 0.5 * 1000);
    const cId = setInterval(playChord, beat * 2 * 1000);
    const lId = setInterval(playLead,  beat * 0.5 * 1000);
    this._scheduledIds.push(dId, cId, lId);
  }

  // ─── BOSS THEME ──────────────────────────────────────────────
  _playBossTheme() {
    const bpm = 160;
    const beat = 60 / bpm;

    let bIdx = 0;
    const playDrum = () => {
      if (!this._musicPlaying) return;
      this._synthKick(0.12);
      if (bIdx % 4 === 1 || bIdx % 4 === 3) this._synthSnare(0.08);
      if (bIdx % 2 === 0) this._synthHihat(0.025);
      bIdx++;
    };

    const bass = ['E2','E2','F2','G2','F2','E2','D2','E2'];
    let bassIdx = 0;
    const playBass = () => {
      if (!this._musicPlaying) return;
      this._synthBass(bass[bassIdx % bass.length], beat * 0.5, 0.1);
      bassIdx++;
    };

    const lead = ['E5','D5','C5','B4','A4','G4','F4','E4'];
    let lIdx = 0;
    const playLead = () => {
      if (!this._musicPlaying) return;
      this._synthSaw(lead[lIdx % lead.length], beat * 0.4, 0.045);
      lIdx++;
    };

    playDrum();
    playBass();
    playLead();
    const dId = setInterval(playDrum,  beat * 0.5 * 1000);
    const bId = setInterval(playBass,  beat * 0.5 * 1000);
    const lId = setInterval(playLead,  beat * 0.5 * 1000);
    this._scheduledIds.push(dId, bId, lId);
  }

  // ─── STINGERS ────────────────────────────────────────────────
  _playVictoryStinger() {
    const notes = ['C5','E5','G5','C6'];
    notes.forEach((n, i) => {
      setTimeout(() => this._synthBell(n, 0.4, 0.1), i * 120);
    });
  }

  _playGameOverStinger() {
    const notes = ['C4','B3','Bb3','A3','Ab3'];
    notes.forEach((n, i) => {
      setTimeout(() => this._synthPad(n, 0.6, 0.08, 0), i * 200);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SFX
  // ═══════════════════════════════════════════════════════════════

  playSfx(id, options = {}) {
    if (!this._ctx) return;
    this.resume();
    switch (id) {
      case 'attack_swing':  this._sfxSwing(options);    break;
      case 'attack_hit':    this._sfxHit(options);      break;
      case 'attack_crit':   this._sfxCrit(options);     break;
      case 'player_hurt':   this._sfxHurt(options);     break;
      case 'player_dodge':  this._sfxDodge(options);    break;
      case 'player_die':    this._sfxDeath(options);    break;
      case 'enemy_die':     this._sfxEnemyDeath(options);break;
      case 'pickup_item':   this._sfxPickup(options);   break;
      case 'pickup_xp':     this._sfxXP(options);       break;
      case 'level_up':      this._sfxLevelUp(options);  break;
      case 'ability_cast':  this._sfxAbility(options);  break;
      case 'ability_fire':  this._sfxFire(options);     break;
      case 'ability_ice':   this._sfxIce(options);      break;
      case 'ability_magic': this._sfxMagic(options);    break;
      case 'footstep':      this._sfxFootstep(options); break;
      case 'door_open':     this._sfxDoor(options);     break;
      case 'portal':        this._sfxPortal(options);   break;
      case 'menu_confirm':  this._sfxConfirm(options);  break;
      case 'menu_cancel':   this._sfxCancel(options);   break;
      case 'menu_hover':    this._sfxHover(options);    break;
      case 'chest_open':    this._sfxChest(options);    break;
      case 'lava_sizzle':   this._sfxLava(options);     break;
      case 'crystal_ping':  this._sfxCrystal(options);  break;
    }
  }

  // ─── SFX implementations ─────────────────────────────────────

  _sfxSwing(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(gain);
    gain.connect(this._sfxGain);
    src.start(t);
  }

  _sfxHit(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    // Low thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
    // White noise burst
    this._noiseShot(t, 0.06, 0.12);
  }

  _sfxCrit(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    // High impact + metallic ping
    this._sfxHit(opts);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(880, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.15);
    gain.gain.setValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t + 0.02);
    osc.stop(t + 0.25);
  }

  _sfxHurt(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(150, t + 0.12);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  _sfxDodge(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
    this._noiseShot(t, 0.02, 0.08);
  }

  _sfxDeath(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.8);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.9);
    this._noiseShot(t, 0.2, 0.5);
  }

  _sfxEnemyDeath(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.4);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.5);
    this._noiseShot(t, 0.1, 0.3);
  }

  _sfxPickup(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    [0, 50, 100].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const gain = ctx.createGain();
      osc.frequency.value = 660 + i * 220;
      gain.gain.setValueAtTime(0.15, t + delay / 1000);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay / 1000 + 0.1);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(t + delay / 1000);
      osc.stop(t + delay / 1000 + 0.1);
    });
  }

  _sfxXP(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.linearRampToValueAtTime(1320, t + 0.08);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  _sfxLevelUp(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const fanfare = ['C5','E5','G5','C6','E6'];
    fanfare.forEach((note, i) => {
      const delay = i * 0.08;
      const freq = noteToFreq(note);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(t + delay);
      osc.stop(t + delay + 0.35);
    });
  }

  _sfxAbility(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  _sfxFire(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    this._noiseShot(t, 0.25, 0.35, true);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  _sfxIce(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
    this._noiseShot(t, 0.05, 0.15);
  }

  _sfxMagic(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    [0, 0.05, 0.1].forEach((d, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(440 + i * 220, t + d);
      osc.frequency.exponentialRampToValueAtTime(880 + i * 440, t + d + 0.25);
      gain.gain.setValueAtTime(0.1, t + d);
      gain.gain.exponentialRampToValueAtTime(0.001, t + d + 0.3);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(t + d);
      osc.stop(t + d + 0.3);
    });
  }

  _sfxFootstep(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    this._noiseShot(t, 0.03, 0.06);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.06);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  _sfxDoor(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    this._noiseShot(t, 0.1, 0.4);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.4);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  _sfxPortal(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.5);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.7);
    this._noiseShot(t + 0.1, 0.1, 0.4);
  }

  _sfxConfirm(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    ['C5','E5'].forEach((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      osc.frequency.value = noteToFreq(note);
      gain.gain.setValueAtTime(0.15, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.12);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.12);
    });
  }

  _sfxCancel(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.linearRampToValueAtTime(250, t + 0.1);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  _sfxHover(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this._sfxGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  _sfxChest(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    this._noiseShot(t, 0.05, 0.2);
    ['C4','E4','G4','C5'].forEach((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      osc.frequency.value = noteToFreq(note);
      gain.gain.setValueAtTime(0.12, t + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.2);
      osc.connect(gain);
      gain.connect(this._sfxGain);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.2);
    });
  }

  _sfxLava(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    this._noiseShot(t, 0.15, 0.4, true);
  }

  _sfxCrystal(opts) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    this._synthBell('A6', 0.4, 0.12);
  }

  _sfxBird() { this._synthBird(); }

  // ═══════════════════════════════════════════════════════════════
  // OSCILLATOR PRIMITIVES
  // ═══════════════════════════════════════════════════════════════

  _synthPad(note, duration, volume, delay = 0) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime + delay;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Second detuned for chorus effect
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = freq * 1.005;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.3);
    gain.gain.setValueAtTime(volume, t + duration - 0.4);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this._musicGain);

    osc.start(t);  osc2.start(t);
    osc.stop(t + duration);  osc2.stop(t + duration);

    this._trackNodes.push(osc, osc2);
  }

  _synthBell(note, duration, volume) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Harmonic partial
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.756; // inharmonic partial

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(volume * 0.3, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.6);

    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(this._musicGain);
    gain2.connect(this._musicGain);

    osc.start(t);  osc2.start(t);
    osc.stop(t + duration);  osc2.stop(t + duration);
    this._trackNodes.push(osc, osc2);
  }

  _synthFlute(note, duration, volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq * 1.006, t + duration * 0.5);
    osc.frequency.linearRampToValueAtTime(freq, t + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.05);
    gain.gain.setValueAtTime(volume, t + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    osc.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);
    osc.stop(t + duration);
    this._trackNodes.push(osc);
  }

  _synthBass(note, duration, volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(volume * 0.6, t + duration * 0.8);
    gain.gain.linearRampToValueAtTime(0, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);
    osc.stop(t + duration);
    this._trackNodes.push(osc);
  }

  _synthSaw(note, duration, volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    filter.Q.value = 1.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);
    osc.stop(t + duration);
    this._trackNodes.push(osc);
  }

  _synthSquare(note, duration, volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);
    osc.stop(t + duration);
    this._trackNodes.push(osc);
  }

  _synthPulseBass(note, duration, volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + duration * 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);
    osc.stop(t + duration);
    this._trackNodes.push(osc);
  }

  _synthDrone(note, volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const freq = noteToFreq(note);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    osc.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);

    // Drone doesn't auto-stop — stored for cleanup
    this._trackNodes.push(osc);
  }

  _synthKick(volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);
    osc.stop(t + 0.12);
    this._trackNodes.push(osc);
  }

  _synthSnare(volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;

    const bufSize = Math.floor(ctx.sampleRate * 0.1);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 200;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    const gain2 = ctx.createGain();
    gain2.gain.value = volume * 0.7;

    src.connect(gain2);
    osc.connect(gain);
    gain.connect(this._musicGain);
    gain2.connect(this._musicGain);

    src.start(t);
    osc.start(t);
    osc.stop(t + 0.12);
    this._trackNodes.push(osc, src);
  }

  _synthHihat(volume) {
    if (!this._ctx || !this._musicPlaying) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const bufSize = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._musicGain);
    src.start(t);
    this._trackNodes.push(src);
  }

  _synthBird() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const baseFreq = 800 + Math.random() * 400;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.5, t + 0.05);
    osc.frequency.linearRampToValueAtTime(baseFreq, t + 0.1);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.3, t + 0.15);
    osc.frequency.linearRampToValueAtTime(baseFreq, t + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this._musicGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  /** White noise shot */
  _noiseShot(t, volume, duration, lowpass = false) {
    const ctx = this._ctx;
    const bufSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 1.2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      src.connect(filter);
      filter.connect(gain);
    } else {
      src.connect(gain);
    }

    gain.connect(this._sfxGain);
    src.start(t);
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
