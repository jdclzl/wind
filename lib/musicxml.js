// ============================================
// MusicXML 转换器
// - 我们的 notes → MusicXML 4.0 文本：手动构建 XML（musicxml-io serialize 要求过严）
// - MusicXML → notes：用 musicxml-io parse 后遍历 entries
// - 目的：存储格式标准化 + alphaTab 渲染
// ============================================

import { parse } from 'musicxml-io';

// divisions：一个四分音符 = 480（MusicXML 4.0 常用值）
const DIVISIONS = 480;

// pitch 名 ↔ step + alter
const STEP_ALTER = {
  'C': ['C', 0], 'C#': ['C', 1], 'Cb': ['C', -1],
  'D': ['D', 0], 'D#': ['D', 1], 'Db': ['D', -1],
  'E': ['E', 0], 'E#': ['E', 1], 'Eb': ['E', -1],
  'F': ['F', 0], 'F#': ['F', 1], 'Fb': ['F', -1],
  'G': ['G', 0], 'G#': ['G', 1], 'Gb': ['G', -1],
  'A': ['A', 0], 'A#': ['A', 1], 'Ab': ['A', -1],
  'B': ['B', 0], 'B#': ['B', 1], 'Bb': ['B', -1],
};

function pitchFromStepAlter(step, alter) {
  const name = alter === 1 ? step + '#' : alter === -1 ? step + 'b' : step;
  return name;
}

const KEY_FIFTHS = {
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6,
  'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6,
};
function keyFifths(k) { return KEY_FIFTHS[k] ?? 0; }

function fifthsToKey(f) {
  const map = { 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#',
    '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb' };
  return map[String(f)] ?? 'C';
}

function beatRatio(beatType) { return beatType === 2 ? 0.5 : beatType === 8 ? 2 : 1; }

// duration（全音符=1）→ divisions
function durationToDivs(dur) { return Math.round(dur * DIVISIONS * 4); }

// divisions → 我们的 duration
function divsToDuration(divs) { return divs / (DIVISIONS * 4); }

// 附点音符的 divisions（MusicXML 用 <dot> 标签，duration 仍写基础值）
function durationElement(note) {
  // MusicXML: 附点是 <dot/> 标签，duration 写基础值（不是 1.5x）
  return durationToDivs(note.duration || 0);
}

// 拍号 → 每小节 divisions
function measureDivisions(timeSig) {
  const [beats, beatType] = (timeSig || '4/4').split('/').map(Number);
  return Math.round((beats / (beatType / 4)) * DIVISIONS);
}

// ============================================
// 我们的 notes 数组 → MusicXML 4.0 文本（手动构建 XML）
// ============================================

/**
 * 把 notes 数组转为 MusicXML 4.0 文本
 * @param {Array} notes 音符数组
 * @param {object} meta { name, key, timeSignature, bpm }
 * @returns {string} MusicXML 文本
 */
export function notesToXml(notes, meta = {}) {
  const timeSig = meta.timeSignature || '4/4';
  const [beats, beatType] = timeSig.split('/').map(Number);
  const mDivs = measureDivisions(timeSig);

  // 把 notes 按小节分组
  const groups = []; // [{ entries: [...], fill: 剩余divisions }]
  let current = { entries: [], fill: mDivs };

  for (const n of notes) {
    const baseDivs = durationToDivs(noteDurationBase(n));
    // 附点：MusicXML duration 写基础值，<dot/> 标签标记延长
    if (current.fill - baseDivs < 0) {
      // 小节剩余不够 → 先填满当前小节
      groups.push({ ...current, fill: current.fill });
      current = { entries: [], fill: mDivs };
    }
    current.entries.push({ note: n, baseDivs });
    current.fill -= baseDivs;
  }
  groups.push(current);

  // 构建 XML
  const parts = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const entriesXml = g.entries.map(({ note, baseDivs }) => {
      if (note.isRest) {
        return `      <note>\n        <rest/>\n        <duration>${baseDivs}</duration>\n      </note>`;
      }
      const [step, alter] = STEP_ALTER[note.pitch] || ['C', 0];
      const alterXml = alter !== 0 ? `\n        <alter>${alter}</alter>` : '';
      const dotXml = note.dot ? `\n        <dot/>` : '';
      return `      <note>
        <pitch>
          <step>${step}</step>${alterXml}
          <octave>${note.octave || 4}</octave>
        </pitch>
        <duration>${baseDivs}</duration>${dotXml}
        <type>${divsToType(baseDivs)}</type>
      </note>`;
    }).join('\n');

    // 第一小节带 attributes + tempo
    const isFirst = gi === 0;
    const attrsXml = isFirst ? `
    <attributes>
      <divisions>${DIVISIONS}</divisions>
      <key><fifths>${keyFifths(meta.key || 'C')}</fifths></key>
      <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>` : '';
    const tempoXml = isFirst && meta.bpm ? `
    <direction>
      <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${meta.bpm}</per-minute></metronome></direction-type>
      <sound tempo="${meta.bpm * beatRatio(beatType)}"/>
    </direction>` : '';

    parts.push(`  <measure number="${gi + 1}">${attrsXml}${tempoXml}
${entriesXml}
  </measure>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>${escapeXml(meta.name || '电吹管谱')}</part-name>
      <part-abbreviation>EW</part-abbreviation>
    </score-part>
  </part-list>
  <part id="P1">
${parts.join('\n')}
  </part>
</score-partwise>`;
}

// 音符基础时值（附点不算在 duration 里，MusicXML 用 <dot/>）
function noteDurationBase(note) {
  return note.duration || 0;
}

// divisions → MusicXML type 标签值（/1 全 /2 二分 /4 四分 /8 八分 /16 十六分）
function divsToType(divs) {
  // divisions=480, 全音符=1920, 二分=960, 四分=480, 八分=240, 十六分=120
  const ratios = [
    [1920, 'whole'], [960, 'half'], [480, 'quarter'],
    [240, 'eighth'], [120, '16th'], [60, '32nd'],
  ];
  for (const [d, t] of ratios) {
    if (divs === d) return t;
  }
  return 'quarter'; // 默认
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// ============================================
// MusicXML 文本 → 我们的 notes 数组（用 musicxml-io parse）
// ============================================

/**
 * 解析 MusicXML 文本为 notes + meta
 * @param {string} xmlString MusicXML 文本
 * @returns {{ notes: Array, meta: { name, key, timeSignature, bpm } }}
 */
export function xmlToNotes(xmlString) {
  const score = parse(xmlString);
  return scoreToNotes(score);
}

function scoreToNotes(score) {
  const notes = [];
  let meta = { name: '', key: 'C', timeSignature: '4/4', bpm: 80 };

  if (!score?.parts?.length) return { notes, meta };

  // 提取 meta
  // partList（驼峰，不是 part-list）数组里的 score-part 存放 name
  meta.name = (score.partList || score['part-list'])?.find((p) => p.type === 'score-part')?.name || '';
  const p1 = score.parts[0];
  if (p1.measures?.[0]?.attributes) {
    const attrs = p1.measures[0].attributes;
    if (attrs.key) meta.key = fifthsToKey(attrs.key.fifths);
    if (attrs.time) {
      // musicxml-io 驼峰: beatType（不是 beat-type）, beats 是字符串
      meta.timeSignature = `${attrs.time.beats}/${attrs.time.beatType}`;
    }
  }
  // tempo direction 从 entries 里找 type='direction' 的条目
  if (p1.measures?.[0]?.entries) {
    const dir = p1.measures[0].entries.find((e) => e.type === 'direction');
    // directionTypes 是数组，每项有 kind: 'metronome' + perMinute
    const metro = dir?.directionTypes?.find((d) => d.kind === 'metronome');
    if (metro?.perMinute) meta.bpm = metro.perMinute;
  }

  // 遍历 entries 提取音符（跳过 direction 等非 note/rest 条目）
  for (const measure of p1.measures) {
    if (!measure.entries) continue;
    for (const entry of measure.entries) {
      if (entry.type !== 'note' && entry.type !== 'rest') continue;

      if (entry.type === 'rest' || entry.rest) {
        notes.push({
          pitch: 'C', octave: 4,
          duration: divsToDuration(entry.duration),
          isRest: true, dot: false, slur: false, technique: '',
        });
      } else if (entry.type === 'note' && entry.pitch) {
        const step = entry.pitch.step || 'C';
        const alter = entry.pitch.alter || 0;
        const octave = entry.pitch.octave || 4;
        const pitch = pitchFromStepAlter(step, alter);
        // musicxml-io: dots 是数字（0=无附点, 1=一个附点, ...）
        const dot = (entry.dots || 0) >= 1;
        notes.push({
          pitch, octave,
          duration: divsToDuration(entry.duration),
          isRest: false, dot, slur: false, technique: '',
        });
      }
    }
  }

  return { notes, meta };
}

// ============================================
// musicxml-io Score ↔ 我们的格式（供 alphaTab 渲染用）
// ============================================

export function notesToScore(notes, meta = {}) {
  return parse(notesToXml(notes, meta));
}

export function xmlToScore(xml) {
  return parse(xml);
}

export function scoreToXml(score) {
  // musicxml-io serialize 要求完整结构，我们手动构建更可靠
  return serializeScore(score);
}

// 直接构建 Score → XML（不通过 musicxml-io serialize）
function serializeScore(score) {
  // 简单情况：从 Score 提取 notes + meta，用 notesToXml 构建
  const { notes, meta } = scoreToNotes(score);
  return notesToXml(notes, meta);
}
