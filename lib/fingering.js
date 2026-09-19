/**
 * 电吹管指法数据
 * 参考主流电吹管（如 Roland AE-10 / AKAI EWI）的通用指法布局
 *
 * 按键布局说明：
 * - 八度键（左手拇指）：0=低音区, 1=中音区, 2=高音区
 * - 左手主按键 1-5（食指/中指/无名指/小指/侧键）
 * - 右手按键 6-7
 * - 半音键：L1-L3（左侧）、R1-R2（右侧）
 */

// 半音到音名的映射
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 唱名映射（初学者友好）
export const SOLFEGE = {
  'C': 'Do', 'C#': 'Do♯', 'D': 'Re', 'D#': 'Re♯', 'E': 'Mi',
  'F': 'Fa', 'F#': 'Fa♯', 'G': 'Sol', 'G#': 'Sol♯', 'A': 'La', 'A#': 'La♯', 'B': 'Si'
};

// 将音名+八度转为 MIDI 编号
export function noteToMidi(pitch, octave) {
  const semitone = NOTE_NAMES.indexOf(pitch);
  if (semitone < 0) return -1;
  return (octave + 1) * 12 + semitone;
}

// 八度显示文字
export function octaveText(octave) {
  return octave <= 3 ? '低音' : octave === 4 ? '中音' : '高音';
}

// ============================================
// 电吹管指法表
// 每个音对应：八度键位置 + 按下的主按键 + 半音键
// ============================================
export const FINGERING_TABLE = {
  // 低音区（八度键 0）
  'C3':  { octave: 0, left: [1, 2, 3, 4, 5], right: [6], half: [] },
  'C#3': { octave: 0, left: [1, 2, 3, 4, 5], right: [6], half: ['L1'] },
  'D3':  { octave: 0, left: [1, 2, 3, 4, 5], right: [], half: [] },
  'D#3': { octave: 0, left: [1, 2, 3, 4], right: [6], half: [] },
  'E3':  { octave: 0, left: [1, 2, 3], right: [6], half: [] },
  'F3':  { octave: 0, left: [1, 2, 3], right: [6, 7], half: [] },
  'F#3': { octave: 0, left: [1, 2], right: [6, 7], half: [] },
  'G3':  { octave: 0, left: [1, 2], right: [6], half: [] },
  'G#3': { octave: 0, left: [1, 2], right: [], half: ['L1'] },
  'A3':  { octave: 0, left: [1], right: [6], half: [] },
  'A#3': { octave: 0, left: [], right: [6], half: ['L1'] },
  'B3':  { octave: 0, left: [], right: [6], half: [] },

  // 中音区（八度键 1）
  'C4':  { octave: 1, left: [1, 2, 3, 4, 5], right: [6], half: [] },
  'C#4': { octave: 1, left: [1, 2, 3, 4, 5], right: [6], half: ['L1'] },
  'D4':  { octave: 1, left: [1, 2, 3, 4, 5], right: [], half: [] },
  'D#4': { octave: 1, left: [1, 2, 3, 4], right: [6], half: [] },
  'E4':  { octave: 1, left: [1, 2, 3], right: [6], half: [] },
  'F4':  { octave: 1, left: [1, 2, 3], right: [6, 7], half: [] },
  'F#4': { octave: 1, left: [1, 2], right: [6, 7], half: [] },
  'G4':  { octave: 1, left: [1, 2], right: [6], half: [] },
  'G#4': { octave: 1, left: [1, 2], right: [], half: ['L1'] },
  'A4':  { octave: 1, left: [1], right: [6], half: [] },
  'A#4': { octave: 1, left: [], right: [6], half: ['L1'] },
  'B4':  { octave: 1, left: [], right: [6], half: [] },

  // 高音区（八度键 2）
  'C5':  { octave: 2, left: [1, 2, 3, 4, 5], right: [6], half: [] },
  'C#5': { octave: 2, left: [1, 2, 3, 4, 5], right: [6], half: ['L1'] },
  'D5':  { octave: 2, left: [1, 2, 3, 4, 5], right: [], half: [] },
  'D#5': { octave: 2, left: [1, 2, 3, 4], right: [6], half: [] },
  'E5':  { octave: 2, left: [1, 2, 3], right: [6], half: [] },
  'F5':  { octave: 2, left: [1, 2, 3], right: [6, 7], half: [] },
  'F#5': { octave: 2, left: [1, 2], right: [6, 7], half: [] },
  'G5':  { octave: 2, left: [1, 2], right: [6], half: [] },
  'G#5': { octave: 2, left: [1, 2], right: [], half: ['L1'] },
  'A5':  { octave: 2, left: [1], right: [6], half: [] },
  'A#5': { octave: 2, left: [], right: [6], half: ['L1'] },
  'B5':  { octave: 2, left: [], right: [6], half: [] },
};

// 获取某个音符的指法，无则返回 null
export function getFingering(pitch, octave) {
  return FINGERING_TABLE[pitch + octave] || null;
}

// 指法文字描述（谱面小字用）
export function fingeringToText(fingering) {
  if (!fingering) return '无指法';
  const parts = [];
  parts.push(['低音区', '中音区', '高音区'][fingering.octave] || '');
  if (fingering.left.length) parts.push('L:' + fingering.left.join(''));
  if (fingering.right.length) parts.push('R:' + fingering.right.join(''));
  if (fingering.half.length) parts.push('♪:' + fingering.half.join(''));
  return parts.join(' ');
}
