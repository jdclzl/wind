'use client';

/**
 * 谱库页：云端谱子列表、播放/编辑/导出/删除、JSON 导入
 */

import { useRef, useState } from 'react';

export default function LibraryTab({ sheets, onRefresh, onPlay, onEdit, showToast }) {
  const fileRef = useRef(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);

  const importFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      await onRefresh();
      showToast('导入成功');
    } catch (e) {
      showToast('导入失败，请检查文件格式');
    } finally {
      setBusy(false);
    }
  };

  const exportOne = async (id) => {
    try {
      const res = await fetch(`/api/sheets/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const blob = new Blob([JSON.stringify({
        name: data.name, key: data.key, timeSignature: data.timeSignature,
        bpm: data.bpm, notes: data.notes,
      }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.name || 'untitled'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast('导出失败');
    }
  };

  const doDelete = async (id) => {
    setBusy(true);
    try {
      await fetch(`/api/sheets/${id}`, { method: 'DELETE' });
      await onRefresh();
      showToast('已删除');
    } finally {
      setBusy(false);
      setConfirmId(null);
    }
  };

  return (
    <div className="tab-panel">
      <div className="library-toolbar">
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          📥 导入谱子（JSON）
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
          onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
        <span className="lib-count">共 {sheets.length} 首</span>
      </div>

      {sheets.length === 0 ? (
        <div className="empty-tip">谱库还是空的<br />去「制作」页创建，或导入 JSON 文件</div>
      ) : (
        <div className="library-list">
          {sheets.map((s) => (
            <div key={s.id} className="library-item">
              <div className="lib-name">{s.name}</div>
              <div className="lib-info">
                {s.key}调 · {s.timeSignature} · {s.bpm}BPM · {s.noteCount}个音
              </div>
              <div className="lib-actions">
                <button className="btn btn-primary" onClick={() => onPlay(s)}>▶ 播放</button>
                <button className="btn" onClick={() => onEdit({ id: s.id })}>✎ 编辑</button>
                <button className="btn" onClick={() => exportOne(s.id)}>📤</button>
                {confirmId === s.id ? (
                  <>
                    <button className="btn btn-danger" onClick={() => doDelete(s.id)} disabled={busy}>确认删除</button>
                    <button className="btn" onClick={() => setConfirmId(null)}>取消</button>
                  </>
                ) : (
                  <button className="btn btn-danger" onClick={() => setConfirmId(s.id)}>🗑</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
