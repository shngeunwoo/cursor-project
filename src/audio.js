export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ac() {
    if (muted) return null;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, delay = 0, endFreq = null) {
    const c = ac();
    if (!c || !master) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), t);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    }
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, gain) {
    const c = ac();
    if (!c || !master) return;
    const length = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 700;
    const amp = c.createGain();
    amp.gain.value = gain;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start();
  }

  return {
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      if (!muted) ac();
      return muted;
    },
    unlock() {
      ac();
    },
    jump() {
      tone(420, 0.12, 'square', 0.1, 0, 760);
    },
    swing() {
      noise(0.08, 0.16);
      tone(520, 0.09, 'sawtooth', 0.05, 0, 160);
    },
    hit() {
      tone(210, 0.08, 'square', 0.12, 0, 70);
      noise(0.05, 0.1);
    },
    block() {
      tone(860, 0.07, 'square', 0.09);
      tone(1280, 0.06, 'square', 0.05, 0.02);
    },
    dash() {
      noise(0.12, 0.15);
      tone(180, 0.14, 'sawtooth', 0.07, 0, 80);
    },
    hurt() {
      tone(130, 0.2, 'sawtooth', 0.14, 0, 48);
    },
    reflect() {
      tone(640, 0.12, 'square', 0.09);
      tone(400, 0.16, 'square', 0.07, 0.04);
    },
    shoot() {
      tone(300, 0.07, 'square', 0.07, 0, 120);
    },
    pickup() {
      tone(520, 0.08, 'sine', 0.09);
      tone(780, 0.12, 'sine', 0.07, 0.07);
    },
    level() {
      tone(523, 0.1, 'square', 0.09);
      tone(659, 0.1, 'square', 0.09, 0.08);
      tone(784, 0.18, 'square', 0.09, 0.16);
    },
    die() {
      tone(196, 0.45, 'sawtooth', 0.12, 0, 42);
    },
  };
}
