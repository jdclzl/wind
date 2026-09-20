/**
 * 播放控制器
 * 基于预调度 + requestAnimationFrame 进度驱动
 * 支持：播放/暂停/停止、seek、单曲循环、当前小节循环（练习模式）
 */

import { durationToSeconds, buildTimeline, buildMeasureStarts, noteDuration } from './sheet';
import { noteMidi } from './sheet';

export class Player {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.sheet = null;      // {name,key,timeSignature,bpm,notes,audioUrl}
    this.mode = 'once';     // once | loop | section
    this.playing = false;
    this.paused = false;
    this.elapsed = 0;       // 当前播放位置（秒）
    this.total = 0;
    this.times = [];        // 每个音符 {start,end}
    this.measureStarts = [];
    this.currentIndex = -1;
    this.loopStart = null; // section 模式循环段起点
    this.loopEnd = null;
    this._raf = null;
    this._lastTs = 0;
    this._handlers = {};
    // 伴奏音轨
    this.accompBuffer = null;  // 解码缓存
    this.accompGain = null;    // 伴奏音量节点（实时调节）
    this.accompVol = 0.8;      // 伴奏音量 0~1
    this.accompMuted = false;  // 伴奏静音
    this._accompLoading = null;
  }

  on(evt, cb) { this._handlers[evt] = cb; }
  emit(evt, ...args) { if (this._handlers[evt]) this._handlers[evt](...args); }
  _emitState() { this.emit('state', { playing: this.playing, paused: this.paused }); }

  /** 设置谱子（plain object: {name,key,timeSignature,bpm,notes,audioUrl}） */
  setSheet(sheet) {
    this.stop();
    this.sheet = sheet;
    this.accompBuffer = sheet?.audioUrl ? null : false; // null=待加载 / false=无伴奏
    this.accompGain = null;
    if (sheet?.audioUrl) this._loadAccomp(sheet.audioUrl);
    this._buildTimeline();
    this.emit('progress', 0, this.total);
  }

  // ============ 伴奏音轨 ============

  /** 预加载伴奏音频（解码一次缓存；加载完成时若正在播放则补播对齐当前进度） */
  async _loadAccomp(url) {
    const load = (async () => {
      try {
        const r = await fetch(url);
        const raw = await r.arrayBuffer();
        this.accompBuffer = await this.audio.decodeAudio(raw);
      } catch {
        this.accompBuffer = false;
      }
      this._accompLoading = null;
      if (this.accompBuffer && this.playing && !this.paused && !this.accompGain) {
        this._startAccompAt(this.elapsed);
      }
    })();
    this._accompLoading = load;
  }

  /** 从播放进度 t 启动伴奏（seek/循环/恢复统一走这里） */
  _startAccompAt(t) {
    if (!this.accompBuffer || this.accompMuted) return;
    const gain = this.audio.startAccomp(this.accompBuffer, t, 0);
    if (gain) {
      gain.gain.value = this.accompVol;
      this.accompGain = gain;
    }
  }

  /** 停止伴奏声音（保留解码缓存） */
  _stopAccomp() {
    this.audio.stopAccomp();
    this.accompGain = null;
  }

  /** 实时调节伴奏音量（播放中生效，不中断） */
  setAccompVolume(v) {
    this.accompVol = Math.max(0, Math.min(1, v));
    if (this.accompGain) this.accompGain.gain.value = this.accompMuted ? 0 : this.accompVol;
  }

  /** 伴奏静音开关 */
  setAccompMuted(m) {
    this.accompMuted = !!m;
    if (this.accompGain) this.accompGain.gain.value = this.accompMuted ? 0 : this.accompVol;
    if (!this.accompMuted && this.playing && !this.paused && !this.accompGain) {
      this._startAccompAt(this.elapsed);
    }
  }

  hasAccomp() {
    return !!this.accompBuffer;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'section') this._updateLoopRange();
  }

  /** BPM 变化后重建时间线；播放中则平滑重启调度 */
  applyTempo() {
    if (!this.sheet) return;
    if (this.playing && !this.paused) {
      this._buildTimeline();
      this._restartAt(this.elapsed);
    } else {
      this._buildTimeline();
    }
  }

  _buildTimeline() {
    this.times = [];
    this.measureStarts = [];
    this.total = 0;
    if (!this.sheet || !this.sheet.notes?.length) return;
    this.times = buildTimeline(this.sheet);
    this.total = this.times[this.times.length - 1].end;
    this.measureStarts = buildMeasureStarts(this.sheet, this.times);
    if (this.mode === 'section') this._updateLoopRange();
  }

  _indexAt(t) {
    for (let i = 0; i < this.times.length; i++) {
      if (t < this.times[i].end - 1e-9) return i;
    }
    return this.times.length - 1;
  }

  _updateNoteByTime() {
    const idx = this._indexAt(this.elapsed);
    if (idx !== this.currentIndex) {
      this.currentIndex = idx;
      this.emit('note', this.sheet.notes[idx], idx);
    }
  }

  /** 从时间 t 开始预调度所有后续音符 */
  _scheduleFrom(t) {
    if (!this.sheet) return;
    for (let i = 0; i < this.sheet.notes.length; i++) {
      const { start, end } = this.times[i];
      if (end <= t + 1e-9) continue;
      const note = this.sheet.notes[i];
      if (note.isRest) continue;
      const delay = Math.max(0, start - t);
      const dur = end - Math.max(start, t);
      this.audio.playNote(noteMidi(note, this.sheet.key), dur, delay, note.technique, note.slur);
    }
    // 伴奏轨同步启动（seek/循环/恢复/变速统一覆盖）
    this._startAccompAt(t);
  }

  /** 停掉声音并从时间 t 重新调度（seek / 循环点） */
  _restartAt(t) {
    this.audio.stopAll();
    this.elapsed = t;
    this._scheduleFrom(t);
    this._lastTs = performance.now();
    const idx = this._indexAt(t);
    if (idx !== this.currentIndex) {
      this.currentIndex = idx;
      this.emit('note', this.sheet.notes[idx], idx);
    }
    this.emit('progress', this.elapsed, this.total);
  }

  /** section 模式：锁定当前音符所在小节为循环段 */
  _updateLoopRange() {
    if (this.mode !== 'section' || !this.times.length) {
      this.loopStart = null;
      this.loopEnd = null;
      return;
    }
    const t = this.currentIndex >= 0 ? this.times[this.currentIndex].start : this.elapsed;
    let ms = 0, me = this.total;
    for (let k = 0; k < this.measureStarts.length; k++) {
      if (this.measureStarts[k] <= t + 1e-6) {
        ms = this.measureStarts[k];
        me = this.measureStarts[k + 1] ?? this.total;
      } else break;
    }
    this.loopStart = ms;
    this.loopEnd = me;
  }

  play() {
    if (!this.sheet || !this.sheet.notes?.length) return;
    if (this.paused) {
      // 从暂停处继续
      this.paused = false;
      this.playing = true;
      this._scheduleFrom(this.elapsed);
      this._lastTs = performance.now();
      this._raf = requestAnimationFrame(this._tick);
      this._emitState();
      return;
    }
    if (this.playing) return;
    // 从头开始
    this.playing = true;
    this.elapsed = 0;
    this.currentIndex = 0;
    if (this.mode === 'section') this._updateLoopRange();
    this._scheduleFrom(0);
    this._lastTs = performance.now();
    this.emit('note', this.sheet.notes[0], 0);
    this.emit('progress', 0, this.total);
    this._raf = requestAnimationFrame(this._tick);
    this._emitState();
  }

  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    this.audio.stopAll();
    this._stopAccomp();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._emitState();
  }

  stop() {
    this.playing = false;
    this.paused = false;
    this.elapsed = 0;
    this.currentIndex = -1;
    this.audio.stopAll();
    this._stopAccomp();
    if (this._raf) cancelAnimationFrame(this._raf);
    this.emit('note', null, -1);
    this.emit('progress', 0, this.total);
    this._emitState();
  }

  /** 跳转到时间 t（播放中平滑重调度） */
  seekTo(t) {
    if (!this.sheet || !this.times.length) return;
    const nt = Math.max(0, Math.min(t, this.total));
    if (this.playing && !this.paused) {
      this._restartAt(nt);
    } else {
      this.elapsed = nt;
      this._updateNoteByTime();
      this.emit('progress', this.elapsed, this.total);
    }
    if (this.mode === 'section') this._updateLoopRange();
  }

  /** 上一个 / 下一个音符（步进试听） */
  stepNote(dir) {
    if (!this.sheet?.notes?.length) return;
    let i = this.currentIndex < 0
      ? (dir > 0 ? 0 : this.sheet.notes.length - 1)
      : this.currentIndex + dir;
    i = Math.max(0, Math.min(this.sheet.notes.length - 1, i));
    const t = this.times[i].start;
    if (this.playing && !this.paused) {
      this._restartAt(t);
    } else {
      this.elapsed = t;
      this.currentIndex = i;
      this.emit('note', this.sheet.notes[i], i);
      this.emit('progress', this.elapsed, this.total);
      // 未播放时步进附带试听该音（附点按有效时值试听）
      const n = this.sheet.notes[i];
      if (!n.isRest) {
        this.audio.playNote(noteMidi(n, this.sheet.key), durationToSeconds(noteDuration(n), this.sheet.bpm), 0, n.technique, n.slur);
      }
    }
  }

  _tick = (ts) => {
    if (!this.playing || this.paused) return;
    const dt = (ts - this._lastTs) / 1000;
    this._lastTs = ts;
    if (dt > 0) this.elapsed += dt;

    // 段落循环（当前小节）
    if (this.mode === 'section' && this.loopEnd != null && this.elapsed >= this.loopEnd - 1e-6) {
      this._restartAt(this.loopStart);
      this._raf = requestAnimationFrame(this._tick);
      return;
    }

    // 整曲结束
    if (this.elapsed >= this.total) {
      if (this.mode === 'loop') {
        this._restartAt(0);
        this._raf = requestAnimationFrame(this._tick);
        return;
      }
      this.stop();
      this.emit('end');
      return;
    }

    this._updateNoteByTime();
    this.emit('progress', this.elapsed, this.total);
    this._raf = requestAnimationFrame(this._tick);
  };
}
