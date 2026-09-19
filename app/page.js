'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import PlayerTab from '@/components/PlayerTab';
import EditorTab from '@/components/EditorTab';
import LibraryTab from '@/components/LibraryTab';

export default function Home() {
  const [tab, setTab] = useState('player');
  const [sheets, setSheets] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [editing, setEditing] = useState(null); // {id?, name, key, ...}
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const refreshSheets = useCallback(async () => {
    try {
      const res = await fetch('/api/sheets');
      if (res.ok) setSheets(await res.json());
    } catch (e) {
      showToast('加载谱库失败');
    }
  }, []);

  useEffect(() => { refreshSheets(); }, [refreshSheets]);

  // 在播放页打开某曲
  const loadToPlayer = useCallback((s) => {
    setPlayingId(s.id);
    setTab('player');
  }, []);

  // 打开编辑器（传 id 则拉取详情；不传则新建）
  const openEditor = useCallback(async (meta) => {
    if (meta?.id) {
      try {
        const res = await fetch(`/api/sheets/${meta.id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setEditing(data);
        setTab('editor');
        return;
      } catch (e) {
        showToast('打开曲目失败');
        return;
      }
    }
    setEditing({ name: '', key: 'C', timeSignature: '4/4', bpm: 80, notes: [] });
    setTab('editor');
  }, []);

  // 编辑器保存回调（put 或 post，成功后更新 editing 保持页面状态）
  const handleEditorSave = useCallback(async (data, id) => {
    const payload = JSON.stringify(data);
    let res;
    if (id) {
      res = await fetch(`/api/sheets/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload,
      });
    } else {
      res = await fetch('/api/sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
      });
    }
    if (!res.ok) throw new Error('save failed');
    const saved = await res.json();
    setEditing(saved);
    await refreshSheets();
    showToast(id ? '保存成功' : `已创建《${saved.name}》`);
  }, [refreshSheets]);

  // 编辑器删除回调
  const handleEditorDelete = useCallback(async (id) => {
    if (!id) return;
    await fetch(`/api/sheets/${id}`, { method: 'DELETE' });
    setEditing(null);
    await refreshSheets();
    showToast('已删除');
  }, [refreshSheets]);

  return (
    <div className="app">
      <Header tab={tab} onTabChange={setTab} onNew={() => openEditor(null)} />

      <main className="main">
        {tab === 'player' && (
          <PlayerTab
            sheets={sheets}
            playingId={playingId}
            onPlayingIdChange={setPlayingId}
            onEdit={openEditor}
          />
        )}
        {tab === 'editor' && (
          <EditorTab
            key={editing ? (editing.id || 'draft') : 'empty'}
            initial={editing}
            onSave={handleEditorSave}
            onDelete={handleEditorDelete}
            showToast={showToast}
          />
        )}
        {tab === 'library' && (
          <LibraryTab
            sheets={sheets}
            onRefresh={refreshSheets}
            onPlay={loadToPlayer}
            onEdit={openEditor}
            showToast={showToast}
          />
        )}
      </main>

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}
