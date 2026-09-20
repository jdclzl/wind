/**
 * 音频引擎（Web Audio API）
 * 合成管乐音色：三振荡器叠加 + ADSR 包络
 * 模块导出全局单例，供播放器 / 编辑器共用
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;   // 总输出总线（旋律 + 伴奏汇合）
    this.melody = null;   // 旋律总线（合成音色，独立于伴奏）
    this.active = []; // 正在发声的音符节点
    this.accompSource = null; // 伴奏音源节点
  }

  init() {
    if (this.ctx) return;
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.melody = this.ctx.createGain();
    this.melody.gain.value = 0.3;
    this.melody.connect(this.master);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** 旋律轨音量（0~1，独立于伴奏） */
  setVolume(v) {
    if (this.melody) this.melody.gain.value = Math.max(0, Math.min(1, v));
  }

  // ============ 伴奏音轨（AudioBufferSourceNode，与合成旋律共享时间轴） ============

  /** 解码伴奏音频（mp3/wav/ogg 等） */
  async decodeAudio(raw) {
    this.init();
    if (!this.ctx) return null;
    try {
      return await this.ctx.decodeAudioData(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * 启动伴奏播放
   * @param {AudioBuffer} buffer 解码后的音频
   * @param {number} offset 从音频的 offset 秒处开始（对齐播放进度）
   * @param {number} delay 相对现在延迟（秒）
   * @returns {GainNode|null} 伴奏音量节点（供实时调节音量/静音）
   */
  startAccomp(buffer, offset = 0, delay = 0) {
    this.init();
    if (!this.ctx || !buffer) return null;
    this.stopAccomp();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.8;
    src.connect(gain);
    gain.connect(this.master);
    src.start(this.ctx.currentTime + delay, Math.max(0, offset));
    this.accompSource = src;
    return gain;
  }

  /** 停止伴奏 */
  stopAccomp() {
    if (this.accompSource) {
      try { this.accompSource.stop(); } catch (e) { /* 已停止 */ }
      this.accompSource.disconnect();
      this.accompSource = null;
    }
  }

  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * 播放一个音符
   * @param {number} midi MIDI 编号
   * @param {number} duration 时长（秒）
   * @param {number} delay 相对现在的延迟（秒）
   * @param {string} technique 演奏技巧：''|'tongue'|'vibrato'|'glissUp'|'glissDown'
   * @param {boolean} slur 连音线（连奏）：起音更缓、释放极短，实现音与音之间连贯衔接
   */
  playNote(midi, duration = 0.5, delay = 0, technique = '', slur = false) {
    if (midi == null || midi < 0) return null;
    this.init();
    this.resume();
    if (!this.ctx) return null;

    const t0 = this.ctx.currentTime + delay;
    const freq = this.midiToFreq(midi);

    // 每个音符一个输出增益节点（ADSR 包络）
    const out = this.ctx.createGain();
    out.connect(this.melody);

    // 技巧对包络的影响：吐音短促、起音极快；连奏起音稍缓、释放极短以便衔接
    const isTongue = technique === 'tongue';
    const attack = isTongue ? 0.006 : (slur ? 0.045 : 0.02); // 起音
    const decay = isTongue ? 0.03 : 0.08;                   // 衰减
    const sustain = isTongue ? 0.6 : (slur ? 0.9 : 0.75);    // 延音电平
    const release = isTongue ? 0.15 : (slur ? 0.05 : 0.15); // 释放（连奏快速收尾衔接下一音）
    const end = t0 + (isTongue ? duration * 0.55 : duration);

    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + attack);
    out.gain.linearRampToValueAtTime(sustain, t0 + attack + decay);
    out.gain.setValueAtTime(sustain, Math.max(t0 + attack + decay, end));
    out.gain.linearRampToValueAtTime(0, end + release);

    // 三振荡器管乐音色：锯齿主音 + 低八度方波 + 高八度正弦泛音
    const specs = [
      { type: 'sawtooth', ratio: 1, level: 0.5 },
      { type: 'square', ratio: 0.5, level: 0.12 },
      { type: 'sine', ratio: 2, level: 0.08 },
    ];
    const oscs = [];
    for (const s of specs) {
      const osc = this.ctx.createOscillator();
      osc.type = s.type;
      osc.frequency.value = freq * s.ratio;
      const g = this.ctx.createGain();
      g.gain.value = s.level;
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(end + release + 0.05);
      oscs.push(osc);
    }

    // 滑音技巧：从 ±2 个半音处滑入目标音高
    if (technique === 'glissUp' || technique === 'glissDown') {
      const fromRatio = technique === 'glissUp' ? 0.891 : 1.122;
      const glide = 0.12;
      for (const o of oscs) {
        const target = o.frequency.value; // 先保存目标频率（value 为实时值）
        o.frequency.setValueAtTime(target * fromRatio, t0);
        o.frequency.exponentialRampToValueAtTime(target, t0 + glide);
      }
    }

    // 颤音技巧：LFO 调制音高（约 ±10 音分）
    if (technique === 'vibrato') {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = freq * 0.006;
      lfo.connect(lfoGain);
      for (const o of oscs) lfoGain.connect(o.frequency);
      lfo.start(t0);
      lfo.stop(end + release + 0.05);
    }

    const entry = { oscs, out };
    this.active.push(entry);
    // 播完后自动从 active 列表移除
    const cleanupMs = Math.max(0, (end + release - this.ctx.currentTime) * 1000) + 300;
    setTimeout(() => {
      this.active = this.active.filter((e) => e !== entry);
    }, cleanupMs);
    return entry;
  }

  /** 平滑停止所有正在发声的音符 */
  stopAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const { oscs, out } of this.active) {
      try {
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 0.04);
        for (const o of oscs) o.stop(now + 0.06);
      } catch (e) { /* 忽略已停止的节点 */ }
    }
    this.active = [];
  }
}

// 全局单例
export const audioEngine = new AudioEngine();
