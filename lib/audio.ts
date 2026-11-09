'use client';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('yor-audio-muted');
      this.isMuted = saved === 'true';
    }
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public get muted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('yor-audio-muted', String(this.isMuted));
    }
    if (!this.isMuted) {
      this.playChord([523.25, 659.25, 783.99], 0.2);
    }
    return this.isMuted;
  }

  public playBlip(freq = 440, duration = 0.05, type: OscillatorType = 'sine', gainLevel = 0.04) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, this.ctx.currentTime + duration);

      gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {}
  }

  public playHover() {
    this.playBlip(820, 0.025, 'sine', 0.015);
  }

  public playClick() {
    this.playBlip(980, 0.05, 'triangle', 0.04);
  }

  public playKeypress() {
    this.playBlip(1400 + Math.random() * 400, 0.018, 'sine', 0.01);
  }

  public playWarp() {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.4);

      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {}
  }

  public playThemeSwitch(themeIndex: number) {
    const scales = [
      [523.25, 659.25, 783.99, 1046.5], // Quantum Amethyst
      [440.0, 554.37, 659.25, 880.0],   // Solar Supernova
      [493.88, 622.25, 739.99, 987.77], // Cyber Emerald
      [392.0, 493.88, 587.33, 783.99],  // Nebula Hyperdrive
    ];
    this.playChord(scales[themeIndex % scales.length], 0.35);
  }

  public playChord(frequencies = [440, 554.37, 659.25], duration = 0.25) {
    if (this.isMuted) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      frequencies.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime + i * 0.025);

        gain.gain.setValueAtTime(0.03, this.ctx!.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime + i * 0.025);
        osc.stop(this.ctx!.currentTime + duration);
      });
    } catch {}
  }
}

export const sound = new SoundEngine();
