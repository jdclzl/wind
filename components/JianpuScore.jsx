'use client';

/**
 * 标准简谱渲染组件（电吹管专用标注版）
 * - 标准简谱：数字记谱、升号、上下八度加点、增时线（右侧-）、减时线（下方_）、小节线、终止线
 * - 电吹管标注：每个音符下方显示紧凑指法（左手·右手）、半音键、
 *   八度键位置（▼低 ●中 ▲高）、演奏技巧符号（T吐音 ~颤音 ↗↘滑音）
 */

import {
  pitchToJianpu,
  octaveDots,
  durationVisual,
  groupMeasures,
  techniqueSymbol,
  fingeringCompact,
} from '@/lib/jianpu';

function JianpuNote({ note, index, active, selected, hasNextInMeasure, onSelect }) {
  const jp = pitchToJianpu(note.pitch);
  const dots = octaveDots(note.octave);
  const { adds, cuts } = durationVisual(note.duration);
  const fing = fingeringCompact(note);
  const tech = techniqueSymbol(note.technique);

  const cls = [
    'jp-note',
    note.isRest ? 'rest' : '',
    active ? 'active' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onClick={onSelect ? () => onSelect(index) : undefined}
      title={note.isRest ? '休止符' : `${note.pitch}${note.octave}${note.dot ? ' · 附点' : ''}${note.slur ? ' · 连音' : ''}${note.technique ? ' · ' + techniqueName(note.technique) : ''}`}
    >
      {/* 连音线（弧线，画在音符上方，连接同小节内相邻两音） */}
      {note.slur && hasNextInMeasure && <span className="jp-slur" aria-hidden="true" />}

      {/* 高音点（数字上方） */}
      <div className="jp-dot-up">{dots.up ? '·'.repeat(dots.up) : '\u00a0'}</div>

      {/* 数字 + 变音记号（左上角）+ 增时线 + 附点（数字右侧） */}
      <div className="jp-mid">
        {!note.isRest && jp.sharp && <span className="jp-acc">♯</span>}
        <span className="jp-digit">{note.isRest ? '0' : jp.digit}</span>
        <span className="jp-adds">
          {Array.from({ length: adds }).map((_, i) => (
            <i key={i} className="jp-add-line" />
          ))}
        </span>
        {note.dot && <span className="jp-dot-aug">·</span>}
      </div>

      {/* 低音点（数字下方） */}
      <div className="jp-dot-down">{dots.down ? '·'.repeat(dots.down) : '\u00a0'}</div>

      {/* 减时线（八分/十六分下划线） */}
      {cuts > 0 && (
        <div className="jp-cuts">
          {Array.from({ length: cuts }).map((_, i) => (
            <i key={i} className="jp-cut-line" />
          ))}
        </div>
      )}

      {/* 电吹管专属标注 */}
      {!note.isRest && (
        <>
          <div className="jp-tech">
            {tech ? <b>{tech}</b> : '\u00a0'}
            {fing && <span className="jp-octkey">{fing.octKey}</span>}
          </div>
          <div className="jp-fing">
            {fing ? `${fing.keys}${fing.half ? ' ' + fing.half : ''}` : '无指法'}
          </div>
        </>
      )}
    </div>
  );
}

// 技巧名称（用于悬浮提示）
function techniqueName(v) {
  const map = { tongue: '吐音', vibrato: '颤音', glissUp: '上滑音', glissDown: '下滑音' };
  return map[v] || '';
}

/**
 * @param {Array} notes 音符数组
 * @param {string} timeSignature 拍号
 * @param {string} keyName 调性（显示 1=C）
 * @param {number} bpm 速度（谱头 ♩=BPM 速度记号）
 * @param {number} currentIndex 播放高亮索引
 * @param {number} selectedIndex 编辑选中索引
 * @param {function} onSelect 点击音符回调（编辑用）
 */
export default function JianpuScore({ notes, timeSignature, keyName, bpm, currentIndex = -1, selectedIndex = -1, onSelect }) {
  if (!notes?.length) return null;
  const measures = groupMeasures(notes, timeSignature);

  return (
    <div className="jianpu-score">
      {/* 谱头：调号、拍号、速度记号（GB/T 46845-2025） */}
      <div className="jp-head">
        <span className="jp-key">{keyName ? `1=${keyName.replace('#', '♯')}` : ''}</span>
        <span className="jp-ts">{timeSignature}</span>
        {bpm ? <span className="jp-bpm">♩= {bpm}</span> : null}
      </div>

      {measures.map((m, mi) => (
        <div className="jp-measure" key={mi}>
          {m.map(({ note, index }, j) => (
            <JianpuNote
              key={index}
              note={note}
              index={index}
              active={index === currentIndex}
              selected={index === selectedIndex}
              hasNextInMeasure={j < m.length - 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}

      {/* 终止线（一细一粗） */}
      <div className="jp-end" aria-hidden="true" />
    </div>
  );
}
