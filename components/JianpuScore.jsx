'use client';

/**
 * jianpurender 简谱渲染组件
 * 使用专业 SVG 简谱渲染库 jianpurender (https://github.com/flufy3d/jianpurender)
 * 替代原 hand-rolled JianpuScore，支持完整简谱符号体系：
 *  - 音符/休止符（全音符至 64 分音符）
 *  - 升降记号（#/b）与附点音符
 *  - 12 种调号 + 任意拍号（2/4, 3/8, 5/16 等）
 *  - 动态高亮：播放时光标同步 + 编辑选中
 */

import { useEffect, useRef } from 'react';

// 调名 → 五度圈数值（jianpurender keySignatures 使用 circle of fifths）
const KEY_TO_FIFTHS = {
  'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
};

// 音名 → 半音索引（C=0 ... B=11）
const PITCH_TO_INDEX = {
  'C': 0, 'Dbb': 0, 'B#': 0,
  'C#': 1, 'Db': 1, 'B##': 1,
  'D': 2, 'C##': 2, 'Ebb': 2,
  'D#': 3, 'Eb': 3, 'Fbb': 3,
  'E': 4, 'Fb': 4, 'D##': 4,
  'F': 5, 'E#': 5, 'Gbb': 5,
  'F#': 6, 'Gb': 6, 'E##': 6,
  'G': 7, 'F##': 7, 'Abb': 7,
  'G#': 8, 'Ab': 8,
  'A': 9, 'G##': 9, 'Bbb': 9,
  'A#': 10, 'Bb': 10, 'Cbb': 10,
  'B': 11, 'Cb': 11, 'A##': 11,
};

/**
 * pitch + octave → MIDI number (C4 = 60)
 */
function pitchToMidi(pitch, octave) {
  const idx = PITCH_TO_INDEX[pitch];
  if (idx === undefined) return 60;
  return (octave + 1) * 12 + idx;
}

/**
 * 我们的 duration（全音符单位：1=全, 0.25=四分）→ jianpurender length（四分音符单位）
 * 附点音符：length *= 1.5
 */
function durationToLength(duration, dot) {
  let l = duration * 4; // 全音符 × 4 = 四分音符数
  if (dot) l *= 1.5;
  // 精确到 1/16 以避免浮点抖动
  return Math.round(l * 1000) / 1000;
}

/**
 * 将我们的 notes 数组转换为 jianpurender JianpuInfo 格式
 * 同时返回 parallel 的 NoteInfo 数组（与 notes 索引一一对应，用于高亮定位）
 */
function convertToJianpuInfo(notes, keyName, timeSig, bpm) {
  if (!notes?.length) return { jpInfo: null, noteInfos: [] };

  const key = KEY_TO_FIFTHS[keyName] ?? 0;
  const [num, den] = (timeSig || '4/4').split('/').map(Number);
  const numerator = num || 4;
  const denominator = den || 4;

  const noteInfos = [];
  let cursor = 0;

  for (const note of notes) {
    const length = durationToLength(note.duration, note.dot);
    let pitch;
    if (note.isRest) {
      pitch = 0; // jianpurender 用 pitch=0 表示休止符
    } else {
      pitch = pitchToMidi(note.pitch, note.octave);
    }
    const intensity = note.isRest ? 0 : 80;
    const ni = { start: cursor, length, pitch, intensity };
    noteInfos.push(ni);
    cursor += length;
  }

  const jpInfo = {
    notes: noteInfos,
    tempos: [{ start: 0, qpm: bpm || 80 }],
    keySignatures: [{ start: 0, key }],
    timeSignatures: [{ start: 0, numerator, denominator }],
  };

  return { jpInfo, noteInfos };
}

/**
 * 从 SVG data-id（"start-pitch"）解码 jianpurender 原始 NoteInfo 属性
 * 用于 click handler 映射回我们的 notes 数组索引
 */
function decodeDataId(dataId) {
  if (!dataId) return null;
  const [start, pitch] = dataId.split('-').map(Number);
  return { start, pitch };
}

/**
 * 在 jianpurender NoteInfo 数组中找 start 匹配的索引（由于休止符 pitch=0，
 * 多个同位置休止符可能有同样 data-id，但我们的 notes 数组里每个音 start 位置都不同，
 * 因为我们用了精确 duration 计算）
 */
function findNoteInfoIndex(noteInfos, start, pitch) {
  // 优先精确匹配 start + pitch
  for (let i = 0; i < noteInfos.length; i++) {
    const ni = noteInfos[i];
    if (Math.abs(ni.start - start) < 0.01 && ni.pitch === pitch) return i;
  }
  // 退而求其次：只匹配 start
  for (let i = 0; i < noteInfos.length; i++) {
    if (Math.abs(noteInfos[i].start - start) < 0.01) return i;
  }
  return -1;
}

// 高亮样式：红色边框 + 动画（jianpurender 默认 activeNoteColor 是红色）
const ACTIVE_CSS = `
.jp-active-note { filter: drop-shadow(0 0 3px #ff4444); }
.jp-selected-note { filter: drop-shadow(0 0 3px #4488ff); }
`;

/**
 * @param {Array} notes 音符数组
 * @param {string} timeSignature 拍号 "4/4"
 * @param {string} keyName 调性 "C"
 * @param {number} bpm 速度
 * @param {number} currentIndex 播放高亮索引
 * @param {number} selectedIndex 编辑选中索引
 * @param {function} onSelect 点击音符回调（编辑用）
 */
export default function JianpuScore({
  notes, timeSignature, keyName, bpm,
  currentIndex = -1, selectedIndex = -1, onSelect,
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const noteInfosRef = useRef([]);
  const prevSelectedRef = useRef(-1);
  const prevActiveRef = useRef(-1);

  // 注入全局 CSS（只做一次）
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'jianpurender-style';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = ACTIVE_CSS;
    document.head.appendChild(style);
  }, []);

  // 主渲染（notes/key/timeSig/bpm 变化时重建）
  useEffect(() => {
    if (!containerRef.current || !notes?.length) return;

    // 动态 import jianpurender（避免 SSR 问题）
    let JianpuSVGRender;
    try {
      const mod = require('jianpurender');
      JianpuSVGRender = mod.JianpuSVGRender;
    } catch {
      // ESM fallback
      return;
    }

    const { jpInfo, noteInfos } = convertToJianpuInfo(notes, keyName, timeSignature, bpm);
    if (!jpInfo) return;
    noteInfosRef.current = noteInfos;

    // 清理旧 renderer
    if (rendererRef.current) {
      try { rendererRef.current.clear(); } catch {}
      rendererRef.current = null;
    }

    const renderer = new JianpuSVGRender(
      jpInfo,
      {
        noteHeight: 28,
        noteColor: '#222',
        activeNoteColor: '#e53e3e',
        scrollType: 0, // PAGE
      },
      containerRef.current,
    );
    rendererRef.current = renderer;

    // 绑定 click 事件（编辑用）
    if (onSelect) {
      const svg = containerRef.current.querySelector('svg');
      if (svg) {
        // 使用事件委托
        const handler = (e) => {
          const group = e.target.closest('g[data-id]');
          if (!group) return;
          const id = group.getAttribute('data-id');
          const decoded = decodeDataId(id);
          if (!decoded) return;
          const idx = findNoteInfoIndex(noteInfos, decoded.start, decoded.pitch);
          if (idx >= 0) onSelect(idx);
        };
        svg.addEventListener('click', handler);
        // 保存 handler 引用以便清理
        renderer._clickHandler = handler;
      }
    }

    // 重置高亮追踪
    prevActiveRef.current = -1;
    prevSelectedRef.current = -1;
  }, [notes, keyName, timeSignature, bpm, onSelect]);

  // 播放高亮（只在 currentIndex 变化时更新）
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (currentIndex >= 0 && currentIndex < noteInfosRef.current.length) {
      const activeNi = noteInfosRef.current[currentIndex];
      renderer.redraw(activeNi, true); // true = scrollIntoView
    } else {
      renderer.redraw(); // 清除高亮
    }
    prevActiveRef.current = currentIndex;
  }, [currentIndex]);

  // 编辑选中高亮（在 active 之外再加一层选中样式）
  useEffect(() => {
    const renderer = rendererRef.current;
    const container = containerRef.current;
    if (!renderer || !container) return;

    // 清除旧选中样式
    container.querySelectorAll('g.jp-selected-note').forEach((g) => {
      g.classList.remove('jp-selected-note');
    });

    if (selectedIndex >= 0 && selectedIndex < noteInfosRef.current.length) {
      const ni = noteInfosRef.current[selectedIndex];
      const selector = `g[data-id="${ni.start}-${ni.pitch}"]`;
      container.querySelectorAll(selector).forEach((g) => {
        g.classList.add('jp-selected-note');
      });
    }
    prevSelectedRef.current = selectedIndex;
  }, [selectedIndex]);

  if (!notes?.length) return null;

  return (
    <div
      ref={containerRef}
      className="jianpurender-container"
      style={{
        width: '100%',
        minHeight: '120px',
        position: 'relative',
      }}
    />
  );
}
