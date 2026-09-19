'use client';

export default function Header({ tab, onTabChange, onNew }) {
  const tabs = [
    { id: 'player', label: '播放' },
    { id: 'editor', label: '制作' },
    { id: 'library', label: '谱库' },
  ];
  return (
    <header className="header">
      <div className="header-top">
        <h1>🎷 电吹管动态电子谱</h1>
        <button className="btn btn-new" onClick={onNew} title="创建一首新谱子">＋ 新建谱子</button>
      </div>
      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={'tab-btn' + (tab === t.id ? ' active' : '')}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
