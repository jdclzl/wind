'use client';

/**
 * 电吹管指法图组件
 * 根据音名/八度渲染 SVG 指法布局，按下的键高亮
 */

import { getFingering } from '@/lib/fingering';

// 左手主按键 1-5
const KEYS_LEFT = [
  { id: 1, x: 130, y: 170 },
  { id: 2, x: 170, y: 170 },
  { id: 3, x: 130, y: 220 },
  { id: 4, x: 170, y: 220 },
  { id: 5, x: 200, y: 250 },
];
// 右手按键 6-7
const KEYS_RIGHT = [
  { id: 6, x: 130, y: 320 },
  { id: 7, x: 170, y: 320 },
];
// 左侧半音键
const KEYS_LHALF = [
  { id: 'L1', x: 72, y: 150 },
  { id: 'L2', x: 72, y: 180 },
  { id: 'L3', x: 72, y: 210 },
];
// 右侧半音键
const KEYS_RHALF = [
  { id: 'R1', x: 228, y: 320 },
  { id: 'R2', x: 228, y: 350 },
];
// 八度键位置
const OCTAVES = [
  { v: 0, y: 80, label: 'LOW' },
  { v: 1, y: 100, label: 'MID' },
  { v: 2, y: 120, label: 'HIGH' },
];

export default function FingeringChart({ pitch, octave, isRest, width = 220, height = 366 }) {
  const f = !isRest && pitch ? getFingering(pitch, octave) : null;
  const left = new Set(f?.left || []);
  const right = new Set(f?.right || []);
  const half = new Set(f?.half || []);
  const oct = f?.octave ?? 1;

  const keyCls = (on) => 'key-circle' + (on ? ' pressed' : '');
  const labelCls = (on) => 'key-label' + (on ? ' pressed' : '');

  return (
    <svg viewBox="0 0 300 500" width={width} height={height} role="img" aria-label="指法图">
      {/* 管身 */}
      <rect x="80" y="20" width="140" height="460" rx="15" className="wind-body" />
      {/* 吹嘴 */}
      <rect x="110" y="2" width="80" height="30" rx="10" className="mouthpiece" />
      {/* 底部喇叭口 */}
      <rect x="105" y="445" width="90" height="28" rx="8" className="wind-body" />

      {/* 八度键（拇指） */}
      {OCTAVES.map((o) => (
        <g key={o.v}>
          <circle cx="48" cy={o.y} r="10" className={keyCls(oct === o.v)} />
          <text x="14" y={o.y + 4} className={'octave-indicator' + (oct === o.v ? ' active' : '')}>
            {o.label}
          </text>
        </g>
      ))}

      {/* 左侧半音键 */}
      {KEYS_LHALF.map((k) => (
        <g key={k.id}>
          <circle cx={k.x} cy={k.y} r="8" className={keyCls(half.has(k.id))} />
          <text x={k.x - 16} y={k.y + 4} className={labelCls(half.has(k.id))}>{k.id}</text>
        </g>
      ))}

      {/* 右侧半音键 */}
      {KEYS_RHALF.map((k) => (
        <g key={k.id}>
          <circle cx={k.x} cy={k.y} r="8" className={keyCls(half.has(k.id))} />
          <text x={k.x + 16} y={k.y + 4} className={labelCls(half.has(k.id))}>{k.id}</text>
        </g>
      ))}

      {/* 左手主按键 */}
      {KEYS_LEFT.map((k) => (
        <g key={k.id}>
          <circle cx={k.x} cy={k.y} r="15" className={keyCls(left.has(k.id))} />
          <text x={k.x} y={k.y + 5} className={labelCls(left.has(k.id))}>{k.id}</text>
        </g>
      ))}

      {/* 右手按键 */}
      {KEYS_RIGHT.map((k) => (
        <g key={k.id}>
          <circle cx={k.x} cy={k.y} r="15" className={keyCls(right.has(k.id))} />
          <text x={k.x} y={k.y + 5} className={labelCls(right.has(k.id))}>{k.id}</text>
        </g>
      ))}

      {/* 左右手分区标注 */}
      <text x="150" y="268" className="hand-label">L</text>
      <text x="150" y="295" className="hand-label">R</text>

      {/* 休止符遮罩 */}
      {isRest && (
        <g>
          <rect x="60" y="170" width="180" height="160" rx="12" fill="#000000" opacity="0.72" />
          <text x="150" y="258" textAnchor="middle" fill="#e94560" fontSize="30" fontWeight="bold">休止</text>
        </g>
      )}
    </svg>
  );
}
