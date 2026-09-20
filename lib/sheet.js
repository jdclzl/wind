/**
 * 谱子数据模型（前后端共用）
 * Note: { pitch, octave, duration, isRest }
 * duration 以全音符为 1：0.25=四分音符，0.5=二分音符…
 */

import { noteToMidi, getFingering, octaveText, SOLFEGE } from './fingering';

// 电吹管演奏技巧定义（数据层权威定义，jianpu.js 转出供 UI 使用）
export const TECHNIQUES = [
  { v: '', label: '平音', sym: '' },
  { v: 'tongue', label: '吐音', sym: 'T' },
  { v: 'vibrato', label: '颤音', sym: '~' },
  { v: 'glissUp', label: '上滑', sym: '↗' },
  { v: 'glissDown', label: '下滑', sym: '↘' },
];

const TECH_SET = new Set(TECHNIQUES.map((t) => t.v));

// 一拍的秒数
export function beatSeconds(bpm) {
  return 60 / bpm;
}

// 时值转秒
export function durationToSeconds(duration, bpm) {
  return duration * beatSeconds(bpm) * 4;
}

// 时值文字
export function durationToText(duration) {
  const map = { 1: '全音符', 0.5: '二分', 0.25: '四分', 0.125: '八分', 0.0625: '十六分' };
  return map[duration] || String(duration);
}

// 音符显示标签，如 "C4 · Do · 中音区"
export function noteLabel(note) {
  if (!note || note.isRest) return '休止';
  return `${note.pitch}${note.octave} · ${SOLFEGE[note.pitch] || ''} · ${octaveText(note.octave)}`;
}

// 调性 → 移调半音数（首调记谱：调号 1=X 决定数字 1 的实际音高）
// 编辑时以 C 调记谱（数字 1 = C），换调后全曲整体移调；选最近方向避免音域大跳
const KEY_SEMITONES = { 'C': 0, 'G': -5, 'D': 2, 'A': -3, 'E': 4, 'F': 5, 'Bb': -2, 'Eb': 3 };
export function keySemitones(key) {
  return KEY_SEMITONES[key] ?? 0;
}

// 音符的 MIDI 编号（休止符返回 -1）；传入调性时按首调移调（1=C 记谱 → 1=key 演奏）
export function noteMidi(note, key) {
  if (!note || note.isRest) return -1;
  const midi = noteToMidi(note.pitch, note.octave);
  const shift = key ? keySemitones(key) : 0;
  return shift ? midi + shift : midi;
}

// ============================================
// 谱子对象工具函数（纯数据操作）
// ============================================

/**
 * 音符有效时值（以全音符=1 计）
 * GB/T 46845-2025：附点写在音符右方，延长原时值的二分之一
 */
export function noteDuration(n) {
  return (n?.duration || 0) * (n?.dot ? 1.5 : 1);
}

// 谱子总时长（秒）
export function sheetTotalDuration(sheet) {
  return (sheet.notes || []).reduce(
    (sum, n) => sum + durationToSeconds(noteDuration(n), sheet.bpm),
    0
  );
}

// 每个音符的时间线 [{start, end}]（含附点延长）
export function buildTimeline(sheet) {
  const times = [];
  let t = 0;
  for (const n of sheet.notes || []) {
    const d = durationToSeconds(noteDuration(n), sheet.bpm);
    times.push({ start: t, end: t + d });
    t += d;
  }
  return times;
}

// 根据拍号计算小节起点列表（用于段落循环）
export function buildMeasureStarts(sheet, times) {
  const [num, unit] = (sheet.timeSignature || '4/4').split('/').map(Number);
  const measureDur = ((num || 4) * 4) / (unit || 4); // 一小节时长（全音符=1 计）
  const starts = [0];
  let acc = 0;
  const notes = sheet.notes || [];
  for (let i = 0; i < times.length && i < notes.length; i++) {
    acc += noteDuration(notes[i]);
    if (acc >= measureDur - 1e-9) {
      acc = 0;
      if (i + 1 < times.length) starts.push(times[i].end);
    }
  }
  return starts;
}

// 校验并清洗谱子数据（用于 API 输入）
export function sanitizeSheet(body) {
  const PITCHES = new Set(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
  const TS = new Set(['2/4', '3/4', '4/4', '6/8']);
  const rawNotes = Array.isArray(body?.notes) ? body.notes : [];
  const notes = rawNotes
    .filter((n) => n && typeof n.duration === 'number' && n.duration > 0 && n.duration <= 4)
    .map((n) => ({
      pitch: PITCHES.has(n.pitch) ? n.pitch : 'C',
      octave: Number.isInteger(n.octave) && n.octave >= 1 && n.octave <= 8 ? n.octave : 4,
      duration: n.duration,
      isRest: !!n.isRest,
      technique: TECH_SET.has(n.technique) ? n.technique : '',
      dot: !!n.dot,   // 附点（基本符号：延长原时值一半）
      slur: !!n.slur, // 连音线（辅助符号：连贯演奏）
    }))
    .slice(0, 2000);
  return {
    name: String(body?.name || '未命名').trim().slice(0, 100) || '未命名',
    key: String(body?.key || 'C').slice(0, 4),
    timeSignature: TS.has(body?.timeSignature) ? body.timeSignature : '4/4',
    bpm: Math.min(300, Math.max(30, parseInt(body?.bpm) || 80)),
    notes,
    // 伴奏音频地址（Vercel Blob 公开 URL）
    audioUrl: typeof body?.audioUrl === 'string' ? body.audioUrl.slice(0, 500) : '',
  };
}
