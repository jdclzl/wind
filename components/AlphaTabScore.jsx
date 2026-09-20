'use client';

/**
 * AlphaTab 简谱渲染组件
 * 接收 MusicXML 文本，用 alphaTab 渲染为简谱（Numbered Notation / JianPu）
 * 支持当前音符高亮（播放时光标位置）
 */

import { useEffect, useRef } from 'react';
import * as alphaTab from '@coderline/alphatab';

export default function AlphaTabScore({ musicxml, bpm, currentIndex }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const trackMapRef = useRef(new Map()); // trackId → notes[] 映射（用于高亮定位）

  // 初始化 alphaTab（仅一次）
  useEffect(() => {
    if (!containerRef.current || apiRef.current) return;

    const settings = {
      // 显示简谱（Numbered Notation / JianPu）
      core: {
        engine: 'svg',
        enableLazyLoading: false,
        useWorkers: false, // 开发时关 workers 避免调试麻烦
      },
      display: {
        barsPerRow: 4,
        barCount: -1,
        showSystemBarSeparator: true,
      },
      // 字体路径（webpack 插件自动复制到 /font/）
      font: {
        directory: '/font/',
      },
      // SoundFont（用于 alphaTab 内置播放；我们用自己的 Web Audio，不依赖它）
      player: {
        outputMode: 'script',
        player: null,
      },
    };

    const api = new alphaTab.AlphaTabApi(containerRef.current, settings);
    apiRef.current = api;

    // 加载 MusicXML
    if (musicxml) {
      const bytes = new TextEncoder().encode(musicxml);
      api.load(new Uint8Array(bytes));
      // 设置每个 staff 显示简谱
      api.scoreLoaded.on(() => {
        const score = api.score;
        if (score?.tracks?.length) {
          for (const track of score.tracks) {
            for (const staff of track.staves) {
              staff.showNumbered = true;
              staff.showTablature = false;
              staff.showStandard = true;
            }
          }
          // 构建 notes → 全局索引映射
          buildTrackNoteMap(score);
          api.render();
        }
      });
    }

    return () => {
      try { api.destroy(); } catch { /* 忽略 */ }
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // musicxml 变化 → 重新加载
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !musicxml) return;
    api.load(new Uint8Array(Buffer.from(musicxml, 'utf-8')));
    api.scoreLoaded.on(() => {
      const score = api.score;
      if (score?.tracks?.length) {
        for (const track of score.tracks) {
          for (const staff of track.staves) {
            staff.showNumbered = true;
            staff.showTablature = false;
            staff.showStandard = true;
          }
        }
        buildTrackNoteMap(score);
        api.render();
      }
    });
  }, [musicxml]);

  // 当前音符高亮（通过 DOM 查询 alphaTab 渲染的 note 元素）
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !containerRef.current) return;
    const el = containerRef.current.querySelector(`.at-note[data-index="${currentIndex}"]`);
    // 清除旧高亮
    containerRef.current.querySelectorAll('.at-note.at-active').forEach((n) => n.classList.remove('at-active'));
    if (el) {
      el.classList.add('at-active');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  // 构建 track → notes[] 映射（用于高亮定位）
  function buildTrackNoteMap(score) {
    trackMapRef.current.clear();
    if (!score?.tracks?.length) return;
    let globalIdx = 0;
    for (const track of score.tracks) {
      const notes = [];
      for (const staff of track.staves) {
        if (!staff.entries) continue;
        for (const entry of staff.entries) {
          if (entry.isNote) {
            notes.push({ globalIndex: globalIdx++, entry });
          } else {
            globalIdx++; // 休止符也占一个全局位置
          }
        }
      }
      trackMapRef.current.set(track.index, notes);
    }
  }

  return (
    <div className="at-score-wrap">
      <div ref={containerRef} className="at-score-container" />
    </div>
  );
}
