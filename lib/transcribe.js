// ============================================
// 伴奏音频 → 简谱 AI 识别（浏览器端 basic-pitch 模型）
// 流程：AudioBuffer → 音高识别 → 主旋律提取 → 拍点量化 → 简谱音符数组
// ============================================

import { BasicPitch, outputToNotesPoly, noteFramesToTime } from '@spotify/basic-pitch';

// 模型文件本地托管于 public/model（约 900KB，随站点部署）
const MODEL_URL = '/model/model.json';

// 单例：模型加载一次复用
let pitcher = null;
function getPitcher() {
  if (!pitcher) pitcher = new BasicPitch(MODEL_URL);
  return pitcher;
}

// ============================================
// midi ↔ 简谱音名互转（科学音调记法：midi 60 = C4）
// ============================================

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNote(midi) {
  return { pitch: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1 };
}

// 电吹管有效音域（对应指法表 C3~B5）
const MIN_MIDI = 48; // C3
const MAX_MIDI = 83; // B5

// ============================================
// 时值量化表（全音符=1；附点组合在 GB/T 46845-2025 下用 dot 标志表示）
// ============================================

const DUR_TABLE = [
  { v: 1, dot: false },      // 全音符
  { v: 0.75, dot: true },    // 附点二分
  { v: 0.5, dot: false },    // 二分
  { v: 0.375, dot: true },   // 附点四分
  { v: 0.25, dot: false },   // 四分
  { v: 0.1875, dot: true },  // 附点八分
  { v: 0.125, dot: false },  // 八分
  { v: 0.09375, dot: true }, // 附点十六分
  { v: 0.0625, dot: false }, // 十六分
];

// 秒值 → 最接近的可表示简谱时值
function nearestDuration(v) {
  let best = DUR_TABLE[DUR_TABLE.length - 1];
  let bd = Infinity;
  for (const d of DUR_TABLE) {
    const diff = Math.abs(d.v - v);
    if (diff < bd) { bd = diff; best = d; }
  }
  return { duration: best.v, dot: best.dot };
}

// ============================================
// 主流程
// ============================================

/**
 * AI 识别伴奏音频中的主旋律，量化生成简谱音符数组
 * @param {AudioBuffer} audioBuffer 解码后的音频（任意采样率，内部重采样）
 * @param {object} opts
 * @param {number} opts.bpm 量化目标速度（编辑器当前 BPM）
 * @param {(percent: number) => void} opts.onProgress 进度回调 0~100
 * @returns {Promise<{notes: Array, count: number}>} 简谱音符 + 实音数量
 */
export async function transcribeAudio(audioBuffer, { bpm = 80, onProgress } = {}) {
  const bp = getPitcher();

  // 0. 模型要求 22050Hz：用 OfflineAudioContext 原生重采样
  let input = audioBuffer;
  if (Math.abs(audioBuffer.sampleRate - 22050) > 1) {
    const frames = Math.ceil(audioBuffer.duration * 22050);
    const oc = new OfflineAudioContext(1, frames, 22050);
    const src = oc.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(oc.destination);
    src.start();
    input = await oc.startRendering();
  }

  // 1. 模型推理（frames/onsets/contours 为逐帧概率矩阵）
  let frames = [];
  let onsets = [];
  let contours = [];
  await bp.evaluateModel(
    input,
    (f, o, c) => { frames = f; onsets = o; contours = c; },
    (p) => { if (onProgress) onProgress(Math.round(p * 100)); }
  );

  // 2. 帧矩阵 → 音符事件
  //    melodiaTrick=true：只保留同一时刻最高音（主旋律提取）
  //    限频 130~1046Hz（C3~C6，电吹管音域附近，过滤贝斯/鼓点干扰）
  //    阈值取官方默认（0.5/0.3），对真实乐器伴奏召回与精度最平衡
  //    minNoteLen=5 帧（约 46ms）：过滤过短噪声
  let events = noteFramesToTime(
    outputToNotesPoly(frames, onsets, 0.5, 0.3, 5, true, 1046, 130, true, 11)
  );
  if (!events.length) return { notes: [], count: 0 };

  // 3. 排序 + 去重叠（电吹管单音轨：同起点取振幅大者；交叠裁剪前音）
  events.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  const merged = [];
  for (const ev of events) {
    const last = merged[merged.length - 1];
    if (last) {
      if (Math.abs(ev.startTimeSeconds - last.startTimeSeconds) < 1e-3) {
        if (ev.amplitude > last.amplitude) merged[merged.length - 1] = ev;
        continue;
      }
      if (ev.startTimeSeconds < last.startTimeSeconds + last.durationSeconds) {
        last.durationSeconds = Math.max(0.05, ev.startTimeSeconds - last.startTimeSeconds);
      }
    }
    merged.push({ ...ev });
  }

  // 4. 量化到 16 分音符网格（按 bpm）
  const grid = (60 / bpm) / 4;
  const notes = [];
  let prevEndG = 0; // 前一音符结束的网格位置
  for (const ev of merged) {
    if (ev.durationSeconds < grid * 0.45) continue;      // 忽略过短音符
    if (ev.pitchMidi < MIN_MIDI || ev.pitchMidi > MAX_MIDI) continue; // 音域外丢弃

    const startG = Math.max(prevEndG, Math.round(ev.startTimeSeconds / grid));
    const durG = Math.max(1, Math.round(ev.durationSeconds / grid));

    // 音符间隙 ≥ 1 个网格时插入休止符
    if (startG - prevEndG >= 1) {
      const gap = nearestDuration((startG - prevEndG) / 16);
      if (gap.duration >= 0.0625) {
        notes.push({ pitch: 'C', octave: 4, duration: gap.duration, isRest: true, dot: gap.dot, slur: false, technique: '' });
      }
    }

    const dur = nearestDuration(durG / 16);
    const { pitch, octave } = midiToNote(ev.pitchMidi);
    notes.push({ pitch, octave, duration: dur.duration, isRest: false, dot: dur.dot, slur: false, technique: '' });
    prevEndG = startG + durG;
  }

  return { notes, count: notes.filter((n) => !n.isRest).length };
}
