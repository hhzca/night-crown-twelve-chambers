/* ---------------------------------------------------------------------------
 * 统一声音设置：音乐 / 环境 / 音效 / 总音量。
 * 这四档是唯一的总量控制入口，文件音乐（stage-music.js）也挂在这里，
 * 所以「静音」一定覆盖全部声音，而不是只覆盖程序化合成的那一层。
 * ------------------------------------------------------------------------- */
const AUDIO_SETTINGS_KEY = 'nightCrown.audioSettings.v1';
const AUDIO_SETTINGS_DEFAULT = { master: 0.92, music: 0.6, ambient: 1, fx: 0.85, muted: false };

function readAudioSettings() {
  const fallback = { ...AUDIO_SETTINGS_DEFAULT };
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const pick = (key, min, max) => {
      const value = Number(parsed?.[key]);
      return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback[key];
    };
    return {
      master: pick('master', 0, 1),
      music: pick('music', 0, 1),
      ambient: pick('ambient', 0, 1),
      fx: pick('fx', 0, 1),
      muted: Boolean(parsed?.muted)
    };
  } catch (_) {
    return fallback;
  }
}

function writeAudioSettings(settings) {
  try { localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
}

const clampAudio = (value, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
};

class AudioEngine {
  constructor() {
    const settings = readAudioSettings();
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.music = null;
    this.fileMusic = null;
    this.ambient = null;
    this.fx = null;
    this.reverb = null;
    this.reverbGain = null;
    this.fxPanners = [];
    this.ambientSlots = [null, null];
    this.roomIds = ['bedroom', null];
    this.room = 'bedroom';
    this.bgmTimer = null;
    this.drone = [];
    this.retireTimers = new Set();
    this.step = 0;
    this.muted = settings.muted;
    this.masterLevel = settings.master;
    this.busLevels = { music: settings.music, ambient: settings.ambient, fx: settings.fx };
    this.bgmRunning = false;
    this.urgency = 0;
    /* 环境声在对话 / 事件中被压低时的临时系数，音量滑块改动时不会把它冲掉。 */
    this.ambientDuck = 1;
    this.musicDuck = 1;
    this.onSettingsChange = null;
  }

  async start() {
    if (this.ctx && this.ctx.state !== 'closed') {
      await this.ctx.resume();
      return this.ctx.state === 'running';
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('当前浏览器不支持 Web Audio API');

    this.ctx = new AC();
    await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.compressor = this.ctx.createDynamicsCompressor();
    this.music = this.ctx.createGain();
    this.fileMusic = this.ctx.createGain();
    this.ambient = this.ctx.createGain();
    this.fx = this.ctx.createGain();
    this.reverb = this.ctx.createConvolver();
    this.reverbGain = this.ctx.createGain();

    this.master.gain.value = this.muted ? 0.0001 : this.masterLevel;
    this.music.gain.value = Math.max(0.0001, this.busLevels.music);
    this.fileMusic.gain.value = Math.max(0.0001, this.busLevels.music);
    this.ambient.gain.value = Math.max(0.0001, this.busLevels.ambient);
    this.fx.gain.value = Math.max(0.0001, this.busLevels.fx);
    this.reverbGain.gain.value = 0.13;
    this.reverb.buffer = this.makeImpulse(1.65, 2.8);

    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.28;

    this.music.connect(this.master);
    this.fileMusic.connect(this.master);
    this.ambient.connect(this.master);
    this.fx.connect(this.master);

    const ambientSend = this.ctx.createGain();
    const fxSend = this.ctx.createGain();
    ambientSend.gain.value = 0.2;
    fxSend.gain.value = 0.11;
    this.ambient.connect(ambientSend);
    this.fx.connect(fxSend);
    ambientSend.connect(this.reverb);
    fxSend.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.master.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    this.fxPanners = [-0.46, 0.46].map((pan) => {
      const node = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain();
      if (node.pan) node.pan.value = pan;
      node.connect(this.fx);
      return node;
    });

    if (this.bgmRunning) this.startBgm();
    this._syncRooms(true);
    return this.ctx.state === 'running';
  }

  /* ---------------------------------------------------------------------
   * 声音设置：四档独立音量 + 静音，全部落盘。
   * ------------------------------------------------------------------- */
  getSettings() {
    return {
      master: this.masterLevel,
      music: this.busLevels.music,
      ambient: this.busLevels.ambient,
      fx: this.busLevels.fx,
      muted: this.muted
    };
  }

  _persistSettings() {
    writeAudioSettings(this.getSettings());
    if (typeof this.onSettingsChange === 'function') this.onSettingsChange(this.getSettings());
  }

  _ramp(node, target, seconds = 0.08) {
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(Math.max(0.0001, node.gain.value), now);
    node.gain.setTargetAtTime(Math.max(0.0001, target), now, Math.max(0.01, seconds / 3));
  }

  _applyBusLevels() {
    if (!this.ctx) return;
    /* 程序化背景层没在用时，这条总线必须是 0，改音量滑块也不会把它抬起来。 */
    this._ramp(this.music, this.bgmRunning ? this.busLevels.music * this.musicDuck : 0);
    this._ramp(this.fileMusic, this.busLevels.music);
    this._ramp(this.ambient, this.busLevels.ambient * this.ambientDuck);
    this._ramp(this.fx, this.busLevels.fx);
  }

  setBusVolume(bus, value) {
    if (!(bus in this.busLevels)) return this.getSettings();
    const level = clampAudio(value, 0, 1);
    this.busLevels[bus] = level;
    this._applyBusLevels();
    this._persistSettings();
    return this.getSettings();
  }

  setMasterVolume(value) {
    this.masterLevel = clampAudio(value, 0, 1);
    if (this.ctx && this.master && !this.muted) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(Math.max(0.0001, this.masterLevel), this.ctx.currentTime, 0.03);
    }
    this._persistSettings();
    return this.getSettings();
  }

  setMuted(on) {
    const next = Boolean(on);
    if (next === this.muted) return this.muted;
    this.muted = next;
    if (this.ctx && this.master) {
      /* 线性短渐变：按下静音键应当几乎立刻安静，
         同时避免硬切造成爆音。setTargetAtTime 的指数尾巴太慢，
         会让「按钮已显示静音、声音还在响」重现。 */
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0.0001 : Math.max(0.0001, this.masterLevel), now + (this.muted ? 0.09 : 0.14));
      if (!this.muted && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    }
    this._persistSettings();
    return this.muted;
  }

  /* 文件音乐总线：让 stage-music.js 把 Web Audio 节点挂到这里。 */
  musicBus() {
    return this.fileMusic || this.master;
  }

  /* 阶段切换时把程序化背景层让出去（城堡之巅以后由文件音乐接管）。 */
  setBgmActive(on) {
    const active = Boolean(on);
    if (active === this.bgmRunning) {
      /* 状态没变也可能还没真正启动：例如声音尚未解锁时就被要求播音，
         那一刻没有 AudioContext，振荡器与音符计时器都建不出来。
         这里补一次启动，避免「music 总线开着但一直没声音」。 */
      if (active) this.startBgm();
      return active;
    }
    this.bgmRunning = active;
    /* 切回程序化层时要把合成器真正启动起来。
       只推音量滑块是不够的 —— bgmTimer 还是 null，就只剩一片安静。 */
    if (active) this.startBgm();
    if (this.ctx && this.music) {
      this._ramp(this.music, active ? this.busLevels.music * this.musicDuck : 0, active ? 1.2 : 0.9);
    }
    return active;
  }

  /* 转场时把程序化背景层压下去几秒再抬回来，不需要碰音量滑块。 */
  duckMusic(depth = 0.25, hold = 3) {
    if (!this.ctx || !this.music) return;
    const next = clampAudio(depth, 0, 1);
    this.musicDuck = next;
    this._ramp(this.music, this.bgmRunning ? this.busLevels.music * next : 0, 0.35);
    clearTimeout(this._musicDuckTimer);
    this._musicDuckTimer = setTimeout(() => {
      this.musicDuck = 1;
      this._ramp(this.music, this.bgmRunning ? this.busLevels.music : 0, 1.1);
    }, Math.max(200, hold * 1000));
  }

  makeImpulse(seconds = 1.4, decay = 2.5) {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return buffer;
  }

  tone(freq, dur = 0.25, type = 'sine', vol = 0.1, dest = this.fx, when = 0, slide = null) {
    if (!this.ctx || this.ctx.state === 'closed' || !dest) return;
    const start = this.ctx.currentTime + Math.max(0, when);
    const end = start + Math.max(0.025, dur);
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, freq), start);
    if (slide !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slide), end);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), start + Math.min(0.02, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(dest);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
  }

  noise(dur = 0.3, vol = 0.08, filter = 'lowpass', freq = 900, when = 0, dest = this.fx) {
    if (!this.ctx || this.ctx.state === 'closed' || !dest) return;
    const duration = Math.max(0.025, dur);
    const start = this.ctx.currentTime + Math.max(0, when);
    const length = Math.max(1, Math.ceil(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 0.7);

    const source = this.ctx.createBufferSource();
    const biquad = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    biquad.type = filter;
    biquad.frequency.value = Math.max(20, freq);
    biquad.Q.value = filter === 'bandpass' ? 2.2 : 0.7;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), start + Math.min(0.02, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(biquad);
    biquad.connect(gain);
    gain.connect(dest);
    source.start(start);
  }

  startBgm() {
    if (!this.ctx || this.bgmTimer) return;
    if (!this.exploreGain) {
      this.exploreGain = this.ctx.createGain();
      // Browser output measured against summit: +3 dB was still ~7 LU quieter.
      // This trim affects only synthesized exploration; the four user buses remain unchanged.
      this.exploreGain.gain.value = Math.pow(10, 10.5 / 20);
      this.exploreGain.connect(this.music);
    }
    // Keep the low drone, with quieter upper notes that small speakers can reproduce.
    [55, 82.41, 220, 329.64].forEach((frequency, index) => {
      const oscillator = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = [0.025, 0.017, 0.018, 0.009][index];
      lfo.frequency.value = 0.07 + index * 0.035;
      lfoGain.gain.value = [0.009, 0.006, 0.004, 0.002][index];
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      oscillator.connect(gain);
      gain.connect(this.exploreGain);
      oscillator.start();
      lfo.start();
      this.drone.push(oscillator, lfo);
    });

    const sequence = [110, 110, 123.47, 98, 110, 146.83, 123.47, 92.5];
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const frequency = sequence[this.step % sequence.length];
      this.step += 1;
			// 这两条是那条「电子鼓点」的骨架音；同样从 0.06 上下提到 0.115/0.125，
			// 让它和事件音效处在同一量级，不再被背景盖住。
			this.tone(frequency, 0.52, 'triangle', this.urgency ? 0.130 : 0.115, this.exploreGain);
			this.tone(frequency * 2, 0.42, 'triangle', this.urgency ? 0.140 : 0.125, this.exploreGain);
			// 电子鼓点原先只有 0.021，比事件音效小一个数量级，几乎听不见；提到与其他声音一致的量级。
			if (this.step % 2 === 0) this.noise(0.11, 0.052, 'lowpass', 150, 0, this.exploreGain);
      if (this.step % 4 === 0) this.tone(frequency * 4, 0.16, 'sine', 0.026, this.exploreGain, 0.16);
      if (this.urgency) {
        this.tone(55, .26, 'triangle', .056, this.exploreGain);
        setTimeout(() => {
          if (!this.muted && this.ctx?.state === 'running' && this.urgency)
            this.tone(82.41, .2, 'triangle', .047, this.exploreGain);
        }, 330);
      }
    }, 760);
  }

  setRoundProgress(round, maxRounds) {
    const urgent = Number(round) >= Math.floor(Number(maxRounds) * 2 / 3) + 1 ? 1 : 0;
    if (urgent === this.urgency) return;
    this.urgency = urgent;
    /* 只有程序化背景层在用时才调它的音量。
       否则一旦其他阶段进入「紧张」档，这里会把已经让出去的总线重新抬起来，
       文件音乐之上就会再叠一条合成旋律。 */
    if (this.ctx && this.music && this.bgmRunning) {
      this.music.gain.setTargetAtTime(urgent ? .7 : this.busLevels.music, this.ctx.currentTime, .8);
    }
  }

  normalizeRoom(room) {
    const aliases = {
      hallway: 'corridor', cellar: 'basement', tower: 'clock', prayer: 'chapel', jail: 'dungeon', prison: 'dungeon',
      mystery: 'reward', mysteryreward: 'reward', mystery_reward: 'reward', 'mystery-reward': 'reward',
      rewardroom: 'reward', reward_room: 'reward', 'reward-room': 'reward'
    };
    if (room === null || room === undefined || room === '') return null;
    const id = String(room).toLowerCase();
    return aliases[id] || id;
  }

  setRooms(roomIds) {
    const incoming = Array.isArray(roomIds) ? roomIds : [roomIds];
    this.roomIds = [this.normalizeRoom(incoming[0]), this.normalizeRoom(incoming[1])];
    this.room = this.roomIds[0] || 'bedroom';
    if (this.ctx && this.ctx.state !== 'closed') this._syncRooms(false);
  }

  setRoom(room, playerIndex = 0) {
    const index = playerIndex === 1 ? 1 : 0;
    const next = [...this.roomIds];
    next[index] = this.normalizeRoom(room);
    this.setRooms(next);
  }

  _syncRooms(immediate) {
    if (!this.ctx) return;
    for (let index = 0; index < 2; index += 1) {
      const room = this.roomIds[index];
      const current = this.ambientSlots[index];
      if (!current || current.room !== room) this._crossfadeRoom(index, room, immediate);
    }
    this._applyStereoMix(immediate);
  }

  _crossfadeRoom(playerIndex, room, immediate = false) {
    const oldLayer = this.ambientSlots[playerIndex];
    const now = this.ctx.currentTime;
    const fade = immediate ? 0.04 : 0.72;

    if (oldLayer) {
      oldLayer.stopped = true;
      clearTimeout(oldLayer.timer);
      oldLayer.gain.gain.cancelScheduledValues(now);
      oldLayer.gain.gain.setValueAtTime(Math.max(0.0001, oldLayer.gain.gain.value), now);
      oldLayer.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      const retirement = setTimeout(() => {
        try { oldLayer.gain.disconnect(); } catch (_) {}
        try { oldLayer.panner.disconnect(); } catch (_) {}
        this.retireTimers.delete(retirement);
      }, Math.ceil((fade + 0.2) * 1000));
      this.retireTimers.add(retirement);
    }

    if (!room) {
      this.ambientSlots[playerIndex] = null;
      return;
    }

    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.connect(panner);
    panner.connect(this.ambient);
    const layer = { room, gain, panner, timer: null, stopped: false, playerIndex };
    this.ambientSlots[playerIndex] = layer;
    this._scheduleAmbient(layer, true);
  }

  _applyStereoMix(immediate = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const active = this.roomIds.reduce((count, room) => count + (room ? 1 : 0), 0);
    const targetGain = active > 1 ? 0.2 : 0.31;
    this.ambientSlots.forEach((layer, index) => {
      if (!layer) return;
      const pan = active > 1 ? (index === 0 ? -0.16 : 0.16) : 0;
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), now);
      layer.gain.gain.exponentialRampToValueAtTime(targetGain, now + (immediate ? 0.04 : 0.72));
      if (layer.panner.pan) {
        layer.panner.pan.cancelScheduledValues(now);
        layer.panner.pan.setTargetAtTime(pan, now, immediate ? 0.01 : 0.18);
      }
    });
    this.fxPanners.forEach((panner, index) => {
      if (!panner.pan) return;
      const pan = active > 1 ? (index === 0 ? -0.18 : 0.18) : 0;
      panner.pan.cancelScheduledValues(now);
      panner.pan.setTargetAtTime(pan, now, immediate ? 0.01 : 0.18);
    });
  }

  _scheduleAmbient(layer, immediate = false) {
    if (!layer || layer.stopped || !this.ctx) return;
    if (!this.muted) this.ambientPulse(layer.room, layer.gain, layer.playerIndex);
    const gaps = {
      bedroom: 3200, corridor: 1900, hall: 2800, kitchen: 1500, library: 2500, basement: 2100, attic: 1800,
      secret: 2400, garden: 1300, clock: 900, storage: 2300, chapel: 3000, dungeon: 1700, reward: 1200
    };
    const base = gaps[layer.room] || 2200;
    const jitter = immediate ? 0.8 : 0.78 + Math.random() * 0.46;
    layer.timer = setTimeout(() => this._scheduleAmbient(layer, false), Math.round(base * jitter));
  }

  ambientPulse(room = this.room, dest = this.ambient) {
    if (this.muted || !this.ctx || !dest) return;
    const d = dest;
    switch (this.normalizeRoom(room)) {
      case 'bedroom':
        this.noise(1.2, 0.026, 'lowpass', 420, 0, d);
        this.tone(220, 0.5, 'sine', 0.015, d, 0.3, 180);
        this.tone(76, 0.28, 'sawtooth', 0.009, d, 0.72, 58);
        break;
      case 'corridor':
        [0, 0.22, 0.58].forEach((when, index) => {
          this.noise(0.09, 0.034 - index * 0.006, 'lowpass', 210, when, d);
          this.tone(250 - index * 28, 0.19, 'triangle', 0.016 - index * 0.003, d, when + 0.03, 170);
        });
        break;
      case 'hall':
        this.tone(164.8, 1.3, 'sine', 0.027, d, 0, 108);
        this.noise(0.85, 0.017, 'bandpass', 520, 0.2, d);
        break;
      case 'kitchen':
        this.tone(1180 + Math.random() * 180, 0.08, 'sine', 0.037, d, 0, 520);
        this.tone(510, 0.18, 'triangle', 0.021, d, 0.24, 430);
        this.noise(0.2, 0.027, 'bandpass', 1650, 0.45, d);
        break;
      case 'library':
        this.noise(0.58, 0.029, 'bandpass', 900, 0, d);
        this.noise(0.16, 0.018, 'highpass', 2100, 0.18, d);
        this.tone(92, 0.48, 'sawtooth', 0.011, d, 0.48, 57);
        break;
      case 'basement':
        this.tone(48, 1.45, 'sine', 0.052, d, 0, 42);
        this.tone(920, 0.07, 'sine', 0.028, d, 0.68, 490);
        this.noise(0.2, 0.014, 'highpass', 2300, 0.67, d);
        break;
      case 'attic':
        this.noise(1.5, 0.043, 'bandpass', 540, 0, d);
        this.tone(78, 0.36, 'sawtooth', 0.014, d, 0.63, 50);
        this.noise(0.12, 0.02, 'lowpass', 190, 0.88, d);
        break;
      case 'secret':
        this.tone(233, 0.8, 'sine', 0.018, d, 0, 226);
        this.tone(221, 0.92, 'sine', 0.016, d, 0.13, 218);
        this.tone(466, 0.2, 'triangle', 0.012, d, 0.46, 390);
        break;
      case 'garden':
        this.tone(1850 + Math.random() * 220, 0.055, 'sine', 0.019, d);
        this.tone(2380 + Math.random() * 240, 0.045, 'sine', 0.015, d, 0.18);
        this.noise(0.8, 0.017, 'highpass', 2050, 0.3, d);
        break;
      case 'clock':
        this.tone(660, 0.036, 'square', 0.034, d);
        this.tone(330, 0.075, 'triangle', 0.024, d, 0.42, 270);
        this.noise(0.1, 0.018, 'bandpass', 1100, 0.44, d);
        break;
      case 'storage':
        this.noise(0.44, 0.031, 'bandpass', 560, 0, d);
        this.tone(108, 0.28, 'sawtooth', 0.013, d, 0.44, 68);
        this.noise(0.1, 0.019, 'lowpass', 230, 0.72, d);
        break;
      case 'chapel':
        this.tone(196, 1.55, 'sine', 0.024, d);
        this.tone(293.7, 1.42, 'sine', 0.016, d, 0.08, 277);
        this.tone(98, 1.7, 'triangle', 0.01, d, 0.18, 82);
        break;
      case 'dungeon':
        this.tone(43, 1.55, 'sine', 0.056, d, 0, 36);
        this.tone(780 + Math.random() * 180, 0.06, 'square', 0.025, d, 0.36, 430);
        this.tone(510, 0.08, 'triangle', 0.018, d, 0.47, 330);
        this.noise(0.3, 0.022, 'bandpass', 720, 0.78, d);
        break;
      case 'reward':
        this.tone(146.83, 0.7, 'sine', 0.025, d, 0, 220);
        this.tone(293.66, 0.42, 'triangle', 0.022, d, 0.16, 440);
        this.tone(880 + Math.random() * 420, 0.11, 'sine', 0.018, d, 0.48, 1320);
        break;
      default:
        this.noise(0.8, 0.018, 'lowpass', 500, 0, d);
        this.tone(92, 0.55, 'sine', 0.012, d, 0.22, 70);
        break;
    }
  }

  _fxFor(playerIndex = 0) {
    if (!this.fxPanners.length) return this.fx;
    return this.fxPanners[playerIndex === 1 ? 1 : 0] || this.fx;
  }

  _duckAmbient(playerIndex, depth = 0.45, hold = 0.8) {
    if (!this.ctx) return;
    const layer = this.ambientSlots[playerIndex === 1 ? 1 : 0];
    if (!layer) return;
    const active = this.roomIds.filter(Boolean).length;
    const normal = active > 1 ? 0.2 : 0.31;
    const now = this.ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), now);
    layer.gain.gain.exponentialRampToValueAtTime(Math.max(0.012, normal * depth), now + 0.06);
    layer.gain.gain.exponentialRampToValueAtTime(normal, now + Math.max(0.2, hold));
  }

  transition(action, playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this._duckAmbient(playerIndex, 0.38, 1.15);
    this.noise(0.85, 0.105, 'bandpass', 720, 0, d);
    this.tone(action === 'down' ? 155 : 92, 0.68, 'sawtooth', 0.055, d, 0, action === 'up' ? 470 : 54);
    if (['open', 'close', 'push'].includes(action)) {
      this.noise(0.32, action === 'push' ? 0.18 : 0.14, 'lowpass', 310, 0.42, d);
      this.tone(66, 0.34, 'square', 0.055, d, 0.5, 39);
      this.tone(740, 0.05, 'triangle', 0.024, d, action === 'close' ? 0.77 : 0.26, 520);
    } else if (action === 'window') {
      this.noise(0.72, 0.14, 'highpass', 1700, 0.26, d);
      this.tone(1320, 0.09, 'triangle', 0.03, d, 0.33, 690);
    } else if (action === 'ladder') {
      for (let i = 0; i < 4; i += 1) this.tone(220 + i * 32, 0.06, 'square', 0.023, d, 0.2 + i * 0.19, 170);
    } else if (action === 'up' || action === 'down') {
      for (let i = 0; i < 4; i += 1) this.noise(0.08, 0.052, 'lowpass', 190, 0.18 + i * 0.17, d);
    } else if (action === 'run') {
      for (let i = 0; i < 5; i += 1) this.noise(0.075, 0.072, 'lowpass', 175, i * 0.115, d);
    } else if (action === 'sneak') {
      for (let i = 0; i < 3; i += 1) this.noise(0.06, 0.025, 'lowpass', 240, 0.18 + i * 0.25, d);
    }
  }

  action(kind, playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    switch (kind) {
      case 'search':
        this.noise(0.5, 0.06, 'bandpass', 1100, 0, d);
        this.tone(420, 0.1, 'triangle', 0.04, d, 0.3);
        break;
      case 'hide':
      case 'sneak':
        this.noise(0.7, 0.048, 'lowpass', 420, 0, d);
        this.tone(130, 0.08, 'triangle', 0.024, d, 0.25);
        break;
      case 'walk':
        [0, 0.26].forEach((when) => this.noise(0.08, 0.05, 'lowpass', 190, when, d));
        break;
      case 'lock':
        this.tone(920, 0.055, 'square', 0.04, d, 0, 610);
        this.noise(0.08, 0.045, 'bandpass', 1450, 0.055, d);
        this.tone(310, 0.12, 'triangle', 0.032, d, 0.08, 220);
        break;
      case 'run':
        for (let i = 0; i < 4; i += 1) this.noise(0.08, 0.075, 'lowpass', 180, i * 0.14, d);
        break;
      case 'attack':
      case 'steal':
        this.attack(playerIndex);
        break;
      case 'guard':
      case 'defend':
      case 'protect':
        this.guard(playerIndex);
        break;
      case 'hurt': this.hurt(playerIndex); break;
      case 'dungeon': this.dungeon(playerIndex); break;
      case 'reward': this.reward(playerIndex); break;
      case 'itemBreak':
      case 'break': this.itemBreak(playerIndex); break;
      case 'use':
      default:
        this.tone(380, 0.45, 'sine', 0.06, d, 0, 760);
        this.tone(570, 0.35, 'triangle', 0.04, d, 0.12);
        break;
    }
  }

  // 对话逐字打字音：极轻的本地合成短音，只作为节奏提示，不喧宾夺主。
  typeTick(playerIndex = 0) {
    if (!this.ctx || this.muted || this.ctx.state === 'closed') return;
    const d = this._fxFor(playerIndex);
    const base = 620 + Math.random() * 260;
    this.tone(base, 0.022, 'square', 0.028, d, 0, base * 0.82);
  }

  // 道具确认：一次短促的上行双音，表示“已确认使用”。
  itemConfirm(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this.tone(520, 0.1, 'triangle', 0.05, d, 0, 780);
    this.tone(880, 0.14, 'sine', 0.04, d, 0.07);
  }

  attack(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this._duckAmbient(playerIndex, 0.25, 1.1);
    [0, 0.18, 0.4].forEach((when, index) => {
      this.noise(0.12, 0.15 - index * 0.018, 'lowpass', 250 - index * 25, when, d);
      this.tone(68 - index * 7, 0.24, 'sine', 0.095 - index * 0.012, d, when, 38);
    });
    this.noise(0.42, 0.1, 'bandpass', 1250, 0.22, d);
    this.tone(920, 0.18, 'sawtooth', 0.055, d, 0.27, 270);
    this.tone(42, 0.85, 'sine', 0.12, d, 0.32, 28);
  }

  steal(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    for (let i = 0; i < 4; i += 1) {
      this.tone(55, 0.13, 'sine', 0.12, d, i * 0.2);
      this.tone(82, 0.1, 'triangle', 0.07, d, i * 0.2 + 0.07);
    }
    this.noise(0.82, 0.085, 'bandpass', 440, 0.18, d);
    this.tone(48, 0.9, 'sawtooth', 0.075, d, 0.25, 34);
  }

  guard(playerIndex = 0, reflected = true) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this._duckAmbient(playerIndex, 0.48, 0.72);
    this.noise(0.13, 0.1, 'highpass', 2300, 0, d);
    [659.25, 987.77, 1318.51].forEach((frequency, index) => {
      this.tone(frequency, 0.34 - index * 0.045, 'sine', 0.055 - index * 0.008, d, index * 0.055, frequency * 1.08);
    });
    if (reflected) {
      this.noise(0.16, 0.12, 'bandpass', 1500, 0.21, d);
      this.tone(420, 0.32, 'triangle', 0.075, d, 0.22, 980);
    }
  }

  hurt(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this._duckAmbient(playerIndex, 0.32, 1.25);
    this.noise(0.2, 0.19, 'lowpass', 220, 0, d);
    this.tone(72, 0.48, 'square', 0.1, d, 0, 36);
    this.noise(0.58, 0.055, 'highpass', 2600, 0.11, d);
    this.noise(0.72, 0.035, 'bandpass', 680, 0.32, d);
    this.tone(175, 0.62, 'sawtooth', 0.032, d, 0.36, 96);
  }

  dungeon(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this._duckAmbient(playerIndex, 0.18, 1.8);
    this.noise(1, 0.12, 'bandpass', 530, 0, d);
    this.tone(180, 1.25, 'sawtooth', 0.085, d, 0, 32);
    this.tone(58, 1.5, 'sine', 0.1, d, 0.2, 27);
    [0.32, 0.49, 0.73].forEach((when, index) => {
      this.tone(970 - index * 170, 0.08, 'square', 0.05, d, when, 430 - index * 60);
      this.noise(0.1, 0.07, 'bandpass', 1400, when, d);
    });
    this.noise(0.28, 0.2, 'lowpass', 180, 1.02, d);
    this.tone(47, 0.48, 'square', 0.12, d, 1.02, 30);
  }

  reward(playerIndex = 0, boosted = false) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this._duckAmbient(playerIndex, 0.5, 1.45);
    this.tone(110, 1.05, 'sawtooth', 0.045, d, 0, 440);
    const notes = boosted ? [261.63, 329.63, 392, 523.25, 659.25, 783.99] : [220, 277.18, 329.63, 440];
    notes.forEach((frequency, index) => {
      this.tone(frequency, 0.42, index % 2 ? 'triangle' : 'sine', 0.062, d, 0.13 + index * 0.09, frequency * 1.04);
    });
    this.noise(0.55, 0.055, 'highpass', 3100, 0.42, d);
    this.tone(boosted ? 1567.98 : 1174.66, 0.72, 'sine', 0.05, d, 0.58, boosted ? 2093 : 1568);
  }

  itemBreak(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this.noise(0.09, 0.15, 'highpass', 2800, 0, d);
    [1680, 1230, 890, 610].forEach((frequency, index) => {
      this.tone(frequency, 0.09 + index * 0.025, index % 2 ? 'square' : 'triangle', 0.052 - index * 0.006, d, index * 0.045, frequency * 0.55);
    });
    this.noise(0.34, 0.08, 'bandpass', 1450, 0.12, d);
    this.tone(105, 0.34, 'sawtooth', 0.055, d, 0.18, 52);
  }

  success(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    [261.63, 329.63, 392].forEach((frequency, index) => {
      this.tone(frequency, 0.38, 'triangle', 0.066, d, index * 0.1, frequency * 1.08);
    });
  }

  fail(playerIndex = 0) {
    if (!this.ctx) return;
    const d = this._fxFor(playerIndex);
    this._duckAmbient(playerIndex, 0.46, 0.9);
    this.tone(180, 0.72, 'sawtooth', 0.078, d, 0, 55);
    this.noise(0.62, 0.068, 'bandpass', 900, 0.15, d);
    this.tone(760, 0.46, 'sine', 0.025, d, 0.32, 390);
  }

  footstep(material = 'stone', mode = 'walk') {
    if (!this.ctx || this.muted) return;
    const dest = this._fxFor(0);
    const tone = { stone: 145, wood: 220, carpet: 92 }[material] || 145;
    const volume = mode === 'run' ? .085 : mode === 'sneak' ? .025 : .05;
    this.noise(mode === 'run' ? .09 : .065, volume, material === 'wood' ? 'bandpass' : 'lowpass', tone * 4, 0, dest);
    this.tone(tone, .055, material === 'wood' ? 'triangle' : 'sine', volume * .45, dest, 0, tone * .72);
  }

  blocked() {
    if (!this.ctx) return;
    this.tone(76, .22, 'sine', .11, this._fxFor(0), 0, 49);
    this.noise(.16, .07, 'lowpass', 190, 0, this._fxFor(0));
  }

  bell(count = 1) {
    if (!this.ctx) return;
    for (let i = 0; i < count; i++) {
      this.tone(110, 1.25, 'sine', .12, this.fx, i * .22, 108);
      this.tone(329.63, .9, 'triangle', .045, this.fx, i * .22);
    }
  }

  setDanger(value = 0) {
    if (!this.ctx || this.muted || value < 45) return;
    const now = performance.now();
    const gap = 60000 / Math.min(96, 48 + (value - 45) * 2.4);
    if (this._lastHeart && now - this._lastHeart < gap) return;
    this._lastHeart = now;
    this.tone(58, .12, 'sine', .09, this.fx, 0, 48);
    this.tone(52, .16, 'sine', .065, this.fx, .14, 43);
  }

  /**
   * 逐字对话：每 2–3 个可见字符补一记极轻的本地合成短音，
   * 音量显著低于主事件音；说话期间把环境音压低，说完再恢复。
   * 全部为程序化合成，不引入任何外部音频文件。
   */
  _duckAmbientForSpeech(duckDb = -11) {
    if (!this.ctx || !this.ambient) return;
    const now = this.ctx.currentTime;
    this.ambientDuck = Math.pow(10, duckDb / 20);
    const target = Math.max(0.0001, this.busLevels.ambient * this.ambientDuck);
    if (this.ambient.gain.setTargetAtTime) {
      this.ambient.gain.cancelScheduledValues(now);
      this.ambient.gain.setTargetAtTime(target, now, 0.06);
    }
    clearTimeout(this._duckTimer);
    this._duckTimer = setTimeout(() => {
      if (!this.ctx || !this.ambient) return;
      const back = this.ctx.currentTime;
      this.ambientDuck = 1;
      if (this.ambient.gain.setTargetAtTime) {
        this.ambient.gain.setTargetAtTime(Math.max(0.0001, this.busLevels.ambient), back, 0.18);
      }
    }, this._speechUntil ? Math.max(240, this._speechUntil - performance.now() + 180) : 600);
  }

  speak(text, playerIndex = 0) {
    if (!this.ctx || this.muted || !text) return 0;
    const chars = [...String(text)];
    let elapsed = 0;
    let sinceTick = 0;
    const dest = this._fxFor(playerIndex);
    for (const ch of chars) {
      const isPunct = '，。！？；：、…—·「」『』（）'.includes(ch);
      elapsed += isPunct ? 190 : 32;
      if (isPunct) { sinceTick = 0; continue; }
      sinceTick++;
      if (sinceTick >= 2 + Math.floor(Math.random() * 2)) {
        sinceTick = 0;
        const t = elapsed / 1000;
        // 极轻的共鸣短音，音高随字序轻微起伏，像低声念白而不是机器朗读。
        const base = 210 + Math.sin(t * 5.1) * 42;
        this.tone(base, 46 / 1000, 'triangle', 0.10 * 0.55, dest, t);
        this.tone(base * 2.01, 34 / 1000, 'sine', 0.10 * 0.24, dest, t + 0.004);
      }
    }
    this._speechUntil = performance.now() + elapsed;
    this._duckAmbientForSpeech(-11);
    return elapsed;
  }

  toggle() {
    return this.setMuted(!this.muted);
  }

  stop() {
    clearInterval(this.bgmTimer);
    this.bgmTimer = null;
    clearTimeout(this._duckTimer);
    this._duckTimer = null;
    clearTimeout(this._musicDuckTimer);
    this._musicDuckTimer = null;
    this._speechUntil = 0;
    this.musicDuck = 1;
    this.ambientDuck = 1;
    this.ambientSlots.forEach((layer) => {
      if (!layer) return;
      layer.stopped = true;
      clearTimeout(layer.timer);
    });
    this.ambientSlots = [null, null];
    this.retireTimers.forEach((timer) => clearTimeout(timer));
    this.retireTimers.clear();
    this.drone.forEach((node) => {
      try { node.stop(); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    });
    this.drone = [];
    if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.fileMusic = null;
    this.ambient = null;
    this.fx = null;
    this.fxPanners = [];
    this.bgmRunning = false;
  }
}

window.AudioEngine = AudioEngine;
