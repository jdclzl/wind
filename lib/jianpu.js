/**
 * 简谱转换与电吹管标注库
 * 标准简谱：数字 1-7 记谱、上下加点标八度、增时线(-)减时线(_)、小节线
 * 电吹管专属：指法紧凑标注、八度键位置(▼●▲)、演奏技巧符号
 */

import { getFingering } from './fingering';
import { noteDuration, TECHNIQUES } from './sheet';

// 转出技巧表（权威定义在 sheet.js，避免循环引用）
export { TECHNIQUES };
const TECH_MAP = Object.fromEntries(TECHNIQUES.map((t) => [t.v, t]));

// 音名 → 简谱数字（1=do … 7=si，含升号标记）
const PITCH_MAP = { 'C': 1, 'C#': 1, 'D': 2, 'D#': 2, 'E': 3, 'F': 4, 'F#': 4, 'G': 5, 'G#': 5, 'A': 6, 'A#': 6, 'B': 7 };

export function techniqueSymbol(v) {
  return TECH_MAP[v]?.sym || '';
}

// 音名转简谱：{ digit: 数字, sharp: 是否升号 }
export function pitchToJianpu(pitch) {
  return {
    digit: PITCH_MAP[pitch] ?? '?',
    sharp: String(pitch || '').includes('#'),
  };
}

// 八度上下点：以中音区(4)为基准，低音下加点、高音上加点（最多两点）
export function octaveDots(octave) {
  const rel = (octave ?? 4) - 4;
  return { up: Math.max(0, Math.min(2, rel)), down: Math.max(0, Math.min(2, -rel)) };
}

// 时值视觉结构：adds=增时线条数（数字右侧），cuts=减时线条数（数字下方）
export function durationVisual(duration) {
  if (duration >= 1) return { adds: 3, cuts: 0 };       // 全音符
  if (duration >= 0.5) return { adds: 1, cuts: 0 };    // 二分音符
  if (duration >= 0.25) return { adds: 0, cuts: 0 };   // 四分音符
  if (duration >= 0.125) return { adds: 0, cuts: 1 };  // 八分音符
  return { adds: 0, cuts: 2 };                          // 十六分音符
}

// 按拍号把音符切分为小节数组：[{note, index}[]]
// 附点音符有效时值参与小节容量计算（GB/T 46845-2025）
export function groupMeasures(notes, timeSignature) {
  const [num, unit] = String(timeSignature || '4/4').split('/').map(Number);
  const measureDur = ((num || 4) * 4) / (unit || 4); // 一小节时长（全音符=1）
  const groups = [[]];
  let acc = 0;
  (notes || []).forEach((note, index) => {
    groups[groups.length - 1].push({ note, index });
    acc += noteDuration(note);
    if (acc >= measureDur - 1e-9) {
      acc = 0;
      groups.push([]);
    }
  });
  if (groups.length > 1 && groups[groups.length - 1].length === 0) groups.pop();
  return groups;
}

// 八度键符号：电吹管拇指八度滚轮位置（低▼ / 中● / 高▲）
export function octaveKeySymbol(octavePos) {
  return ['▼', '●', '▲'][octavePos] ?? '●';
}

// 电吹管紧凑指法标注：keys="左手·右手"（如 "123·6"），half=半音键，octKey=八度键
export function fingeringCompact(note) {
  if (!note || note.isRest) return null;
  const f = getFingering(note.pitch, note.octave);
  if (!f) return null;
  return {
    keys: `${f.left.join('')}·${f.right.join('')}`,
    half: f.half.join(' '),
    octKey: octaveKeySymbol(f.octave),
  };
}
