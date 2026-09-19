'use client';

/**
 * 制作页：音符输入（卡片式选择）、指法预览、谱面编辑（选中/删除/撤销重做）、试听、保存
 */

import { useEffect, useRef, useState } from 'react';
import FingeringChart from './FingeringChart';
import JianpuScore from './JianpuScore';
import { audioEngine } from '@/lib/audio';
import { Player } from '@/lib/player';
import { noteLabel, noteMidi, durationToSeconds, noteDuration } from '@/lib/sheet';
import { fingeringToText, getFingering } from '@/lib/fingering';
import { TECHNIQUES } from '@/lib/jianpu';

const PITCHES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// 简谱命名（GB/T 46845-2025）：数字 1-7 记谱，变音记号 ♯ 记于数字左上角
const JP_LABEL = { 'C': '1', 'C#': '♯1', 'D': '2', 'D#': '♯2', 'E': '3', 'F': '4', 'F#': '♯4', 'G': '5', 'G#': '♯5', 'A': '6', 'A#': '♯6', 'B': '7' };
const JP_SOLFA = { 'C': 'do', 'C#': 'do', 'D': 're', 'D#': 're', 'E': 'mi', 'F': 'fa', 'F#': 'fa', 'G': 'sol', 'G#': 'sol', 'A': 'la', 'A#': 'la', 'B': 'si' };
const OCTAVES = [
  { v: 3, t: '低音区' }, { v: 4, t: '中音区' }, { v: 5, t: '高音区' },
];
const DURATIONS = [
  { v: 1, t: '全音符' }, { v: 0.5, t: '二分' }, { v: 0.25, t: '四分' },
  { v: 0.125, t: '八分' }, { v: 0.0625, t: '十六分' },
];
const KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'];
const TIME_SIGS = ['4/4', '3/4', '6/8', '2/4'];

export default function EditorTab({ initial, onSave, onDelete, showToast }) {
  const isNew = !initial?.id;
  const [name, setName] = useState(initial?.name || '');
  const [key, setKey] = useState(initial?.key || 'C');
  const [timeSig, setTimeSig] = useState(initial?.timeSignature || '4/4');
  const [bpm, setBpm] = useState(initial?.bpm || 80);
  const [notes, setNotes] = useState(initial?.notes || []);
  const [selected, setSelected] = useState(-1);

  // 输入选择器
  const [pitch, setPitch] = useState('C');
  const [octave, setOctave] = useState(4);
  const [dur, setDur] = useState(0.25);
  const [tech, setTech] = useState('');
  const [dot, setDot] = useState(false);   // 附点：延长原时值一半（GB/T 46845-2025）
  const [slur, setSlur] = useState(false); // 连音线：与下一音连贯演奏

  // 撤销/重做
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [hist, setHist] = useState({ undo: false, redo: false });

  // 试听播放器
  const previewRef = useRef(null);
  const [previewIdx, setPreviewIdx] = useState(-1);
  const [previewOn, setPreviewOn] = useState(false);

  useEffect(() => {
    const p = new Player(audioEngine);
    p.on('note', (n, i) => setPreviewIdx(i));
    p.on('state', (s) => setPreviewOn(s.playing && !s.paused));
    p.on('end', () => setPreviewOn(false));
    previewRef.current = p;
    return () => p.stop();
  }, []);

  const refreshHist = () => setHist({ undo: pastRef.current.length > 0, redo: futureRef.current.length > 0 });
  const snapshot = () => JSON.stringify({ notes, name, key, timeSig, bpm });
  const applySnap = (s) => {
    setNotes(s.notes); setName(s.name); setKey(s.key); setTimeSig(s.timeSig); setBpm(s.bpm);
  };
  const commit = (next) => {
    pastRef.current.push(snapshot());
    futureRef.current = [];
    next();
    if (selected >= 0 && selected >= notes.length) setSelected(notes.length - 1);
    refreshHist();
  };
  const undo = () => {
    if (!pastRef.current.length) return;
    futureRef.current.push(snapshot());
    applySnap(JSON.parse(pastRef.current.pop()));
    setSelected(-1);
    refreshHist();
  };
  const redo = () => {
    if (!futureRef.current.length) return;
    pastRef.current.push(snapshot());
    applySnap(JSON.parse(futureRef.current.pop()));
    setSelected(-1);
    refreshHist();
  };

  // 添加音符（未选中 → 追加到末尾；已选中 → 插入选中音之后）
  const addNote = (isRest) => {
    const note = {
      pitch, octave, duration: Number(dur), isRest: !!isRest,
      technique: isRest ? '' : tech,
      dot: !!dot,       // 附点（休止符同样支持附点休止）
      slur: !isRest && !!slur, // 连音线只对实音有效
    };
    commit(() => {
      if (selected >= 0 && selected < notes.length) {
        const next = [...notes];
        next.splice(selected + 1, 0, note);
        setNotes(next);
        setSelected(selected + 1);
      } else {
        setNotes([...notes, note]);
        setSelected(notes.length);
      }
    });
    // 试听新音（含技巧音效与连奏包络；附点按有效时值；按当前调性移调）
    if (!isRest) {
      audioEngine.playNote(
        noteMidi(note, key),
        durationToSeconds(noteDuration(note), bpm), 0, note.technique, note.slur
      );
    }
  };

  const deleteSelected = () => {
    if (selected < 0 || selected >= notes.length) return;
    commit(() => {
      const next = [...notes];
      next.splice(selected, 1);
      setNotes(next);
      setSelected(Math.min(selected, next.length - 1));
    });
  };

  const clearAll = () => commit(() => { setNotes([]); setSelected(-1); });

  const currentData = () => ({
    name: name.trim() || '未命名曲目',
    key, timeSignature: timeSig, bpm, notes,
  });

  const togglePreview = () => {
    const p = previewRef.current;
    if (!p) return;
    if (previewOn) { p.pause(); return; }
    if (!notes.length) return;
    p.setSheet({ ...currentData(), notes: JSON.parse(JSON.stringify(notes)) });
    p.play();
  };

  const save = async () => {
    try {
      await onSave(currentData(), initial?.id || null);
    } catch (e) {
      showToast('保存失败，请重试');
    }
  };

  const exportJson = () => {
    const data = JSON.stringify(currentData(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name.trim() || 'untitled')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出 JSON 文件');
  };

  const selFingering = !pitch || false ? null : getFingering(pitch, octave);
  const del = async () => {
    await onDelete(initial.id);
  };

  return (
    <div className="tab-panel">
      {/* 工具栏 */}
      <div className="control-panel">
        <div className="control-group">
          <label>曲目名称</label>
          <input type="text" value={name} placeholder="我的曲目"
            onChange={(e) => setName(e.target.value)} maxLength={50} />
        </div>
        <div className="control-group">
          <label>调性</label>
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {KEYS.map((k) => <option key={k} value={k}>{k}调</option>)}
          </select>
        </div>
        <div className="control-group">
          <label>拍号</label>
          <select value={timeSig} onChange={(e) => setTimeSig(e.target.value)}>
            {TIME_SIGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="control-group" title="试听速度与保存的速度一致">
          <label>速度 <span className="hint-num">{bpm} BPM</span></label>
          <input type="range" min="40" max="200" value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))} />
        </div>
        <div className="btn-group">
          <button className="btn btn-primary" onClick={save}>💾 保存到云端</button>
          <button className="btn" onClick={togglePreview} disabled={!notes.length}>
            {previewOn ? '⏸ 停止试听' : '🎵 试听整曲'}
          </button>
          <button className="btn" onClick={exportJson} disabled={!notes.length}>📤 导出</button>
          {!isNew && <button className="btn btn-danger" onClick={del}>🗑 删除此曲</button>}
        </div>
      </div>

      <div className="editor-main">
        {/* 音符输入面板 */}
        <div className="panel note-input-panel">
          <h4>添加音符</h4>
          <div className="field-label">八度</div>
          <div className="card-select">
            {OCTAVES.map((o) => (
              <button key={o.v} className={octave === o.v ? 'sel' : ''}
                onClick={() => setOctave(o.v)}>{o.t}</button>
            ))}
          </div>
          <div className="field-label" title="简谱记谱：数字 1-7 与唱名，变音记号 ♯ 记于数字左上角">音名（简谱唱名）</div>
          <div className="pitch-grid">
            {PITCHES.map((p) => (
              <button key={p} className={`pitch-btn${p.includes('#') ? ' flat' : ''}${pitch === p ? ' selected' : ''}`}
                onClick={() => setPitch(p)}>
                <b className="jp-num">{JP_LABEL[p]}</b>
                <i className="jp-solfa">{JP_SOLFA[p]}</i>
              </button>
            ))}
          </div>
          <div className="field-label">时值</div>
          <div className="card-select">
            {DURATIONS.map((d) => (
              <button key={d.v} className={Number(dur) === d.v ? 'sel' : ''}
                onClick={() => setDur(d.v)}>{d.t}</button>
            ))}
          </div>
          <div className="field-label" title="电吹管演奏技巧：标注在简谱音符上方，播放时音效同步变化">演奏技巧（电吹管标注）</div>
          <div className="card-select">
            {TECHNIQUES.map((t) => (
              <button key={t.v} className={tech === t.v ? 'sel' : ''}
                onClick={() => setTech(t.v)}>
                <b className="tech-sym">{t.sym || '—'}</b>{t.label}
              </button>
            ))}
          </div>
          <div className="field-label" title="基本符号：附点写在音符右侧，延长原时值的一半；连音线连接相邻两音，奏为连贯一体的连奏">音符修饰（GB/T 46845-2025）</div>
          <div className="card-select">
            <button className={dot ? 'sel' : ''} onClick={() => setDot(!dot)}
              title="附点：延长原时值的一半">
              <b className="tech-sym">·</b>附点
            </button>
            <button className={slur ? 'sel' : ''} onClick={() => setSlur(!slur)}
              title="连音线：与下一个音连贯演奏（仅小节内相邻两音连线）">
              <b className="tech-sym">⌒</b>连音线
            </button>
          </div>
          <div className="btn-group add-group">
            <button className="btn btn-primary" onClick={() => addNote(false)}>➕ 添加音符</button>
            <button className="btn" onClick={() => addNote(true)}>休止符</button>
          </div>
          <p className="tip-line" title="添加规则说明">提示：未选中音符时追加到末尾，选中后插入到其后</p>

          {/* 指法预览 */}
          <div className="fingering-preview">
            <h4>指法预览 · <span className="preview-note">{pitch}{octave}</span></h4>
            <div className="fingering-display small">
              <FingeringChart pitch={pitch} octave={octave} width={150} height={250} />
            </div>
            <div className="fingering-text">{fingeringToText(selFingering)}</div>
          </div>
        </div>

        {/* 谱面编辑区 */}
        <div className="panel sheet-edit-area">
          <h4>简谱编辑（点击音符选中）</h4>
          {notes.length ? (
            <div className="sheet-display editable">
              <JianpuScore
                notes={notes}
                timeSignature={timeSig}
                keyName={key}
                bpm={bpm}
                currentIndex={previewIdx}
                selectedIndex={selected}
                onSelect={(i) => setSelected(i === selected ? -1 : i)}
              />
            </div>
          ) : (
            <div className="empty-tip">还没有音符<br />用左侧面板添加第一个音符吧</div>
          )}
          <div className="edit-actions">
            <button className="btn" onClick={undo} disabled={!hist.undo}>↶ 撤销</button>
            <button className="btn" onClick={redo} disabled={!hist.redo}>↷ 重做</button>
            <button className="btn btn-danger" onClick={deleteSelected} disabled={selected < 0}>删除选中</button>
            <button className="btn btn-danger" onClick={clearAll} disabled={!notes.length}>清空</button>
            {selected >= 0 && (
              <span className="sel-info">已选中第 {selected + 1} 个音：{noteLabel(notes[selected])}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
