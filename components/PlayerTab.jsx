'use client';

/**
 * 播放页：曲目选择、播放控制、指法动态展示、谱面高亮同步
 */

import { useEffect, useRef, useState } from 'react';
import FingeringChart from './FingeringChart';
import JianpuScore from './JianpuScore';
import { audioEngine } from '@/lib/audio';
import { Player } from '@/lib/player';
import { noteLabel } from '@/lib/sheet';

export default function PlayerTab({ sheets, playingId, onPlayingIdChange, onEdit }) {
  const playerRef = useRef(null);
  const [sheet, setSheet] = useState(null);
  const [tempo, setTempo] = useState(80);
  const [mode, setMode] = useState('once');
  const [cur, setCur] = useState(null);        // {note, index}
  const [prog, setProg] = useState({ t: 0, total: 0 });
  const [state, setState] = useState({ playing: false, paused: false });

  // 初始化播放器
  useEffect(() => {
    const p = new Player(audioEngine);
    p.on('note', (note, index) => setCur(note ? { note, index } : null));
    p.on('progress', (t, total) => setProg({ t, total }));
    p.on('state', (s) => setState(s));
    playerRef.current = p;
    return () => p.stop();
  }, []);

  // 加载选中曲目详情
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !playingId) { setSheet(null); p?.setSheet(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sheets/${playingId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSheet(data);
        setTempo(data.bpm);
        p.setSheet(data);
        p.setMode(mode);
      } catch (e) { /* 网络错误静默 */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId]);

  // 播放模式切换
  useEffect(() => {
    playerRef.current?.setMode(mode);
  }, [mode]);

  // 当前音符变化时自动滚动谱面
  useEffect(() => {
    if (!cur) return;
    const el = document.querySelector('#playerSheet .jp-note.active');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [cur?.index]);

  const handleTempo = (v) => {
    setTempo(v);
    if (sheet) {
      sheet.bpm = v;
      playerRef.current?.applyTempo();
    }
  };

  const onSeekBar = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    playerRef.current?.seekTo(ratio * (prog.total || 0));
  };

  const fmt = (s) => {
    if (!s || s < 0) s = 0;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const curNote = cur?.note;
  const hasSheet = !!sheet && sheet.notes?.length > 0;

  return (
    <div className="tab-panel">
      {/* 控制面板 */}
      <div className="control-panel">
        <div className="control-group">
          <label>曲目</label>
          <select value={playingId || ''} onChange={(e) => onPlayingIdChange(e.target.value)}>
            <option value="">选择曲目…</option>
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.key}调 · {s.bpm}BPM · {s.noteCount}音）
              </option>
            ))}
          </select>
        </div>
        <div className="control-group" title="每分钟节拍数，播放中可实时调整">
          <label>速度 <span className="hint-num">{tempo} BPM</span></label>
          <input type="range" min="40" max="200" value={tempo}
            onChange={(e) => handleTempo(Number(e.target.value))} />
        </div>
        <div className="control-group" title="单曲=播完即停；循环=整曲反复；小节循环=反复当前小节（练习用）">
          <label>播放模式</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="once">单曲播放</option>
            <option value="loop">整曲循环</option>
            <option value="section">小节循环（练习）</option>
          </select>
        </div>
        <div className="btn-group">
          <button id="btnPlay" className="btn btn-primary"
            onClick={() => playerRef.current?.play()}
            disabled={!hasSheet || state.playing}>
            ▶ 播放
          </button>
          <button className="btn"
            onClick={() => playerRef.current?.pause()}
            disabled={!state.playing || state.paused}>
            ⏸ 暂停
          </button>
          <button className="btn" onClick={() => playerRef.current?.stop()}>
            ⏹ 停止
          </button>
        </div>
        <div className="btn-group" title="逐个音符步进试听，方便跟练指法">
          <button className="btn" onClick={() => playerRef.current?.stepNote(-1)} disabled={!hasSheet}>⏪ 上一音</button>
          <button className="btn" onClick={() => playerRef.current?.stepNote(1)} disabled={!hasSheet}>下一音 ⏩</button>
          {playingId && (
            <button className="btn" onClick={() => onEdit({ id: playingId })} title="在制作页编辑当前曲目">✎ 编辑此曲</button>
          )}
        </div>
      </div>

      {/* 播放区 */}
      <div className="play-area">
        <div className="panel fingering-section">
          <h3>当前指法</h3>
          <div className="fingering-display">
            <FingeringChart
              pitch={curNote?.pitch}
              octave={curNote?.octave}
              isRest={curNote?.isRest}
            />
          </div>
          <div className="current-note">{curNote ? noteLabel(curNote) : '--'}</div>
        </div>

        <div className="panel sheet-section">
          <h3>动态简谱</h3>
          {hasSheet ? (
            <div id="playerSheet" className="sheet-display">
              <JianpuScore
                notes={sheet.notes}
                timeSignature={sheet.timeSignature}
                keyName={sheet.key}
                bpm={tempo}
                currentIndex={cur?.index ?? -1}
              />
            </div>
          ) : (
            <div className="empty-tip">尚未选择曲目<br />请在上方选择或在「谱库」中打开</div>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="progress-wrap">
        <div className="progress-bar" onClick={onSeekBar}>
          <div className="progress-fill" style={{ width: `${prog.total ? (prog.t / prog.total) * 100 : 0}%` }} />
        </div>
        <div className="progress-labels">
          <span>{fmt(prog.t)}</span>
          <span>{fmt(prog.total)}</span>
        </div>
      </div>
    </div>
  );
}
