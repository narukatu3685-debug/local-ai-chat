import React from 'react';
import { MessageSquare, Plus, Settings, HardDrive, Trash2, Cpu, BarChart2 } from 'lucide-react';

export default function Sidebar({
  threads,
  currentThreadId,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onOpenSettings,
  onOpenModels,
  currentModel,
  vramInfo // { used, total, percent, status, statusText }
}) {
  return (
    <div style={sidebarStyle}>
      {/* ヘッダー / ロゴ */}
      <div style={headerStyle}>
        <div style={logoStyle}>
          <div style={logoIconBgStyle}>
            <Cpu size={20} color="var(--theme-primary)" />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px', background: 'var(--theme-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Local AI
          </h2>
        </div>

        <button onClick={onCreateThread} style={newChatButtonStyle}>
          <Plus size={15} /> 新規対話
        </button>
      </div>

      {/* チャット一覧 */}
      <div style={threadListStyle}>
        <span style={sectionHeaderStyle}>最近の対話</span>
        {threads.length === 0 ? (
          <div style={emptyStateStyle}>
            <p>履歴がありません</p>
          </div>
        ) : (
          threads.map(thread => {
            const isActive = thread.id === currentThreadId;
            return (
              <div
                key={thread.id}
                onClick={() => onSelectThread(thread.id)}
                className="thread-item"
                style={{
                  ...threadItemStyle,
                  background: isActive ? 'var(--chat-bubble-user)' : 'transparent',
                  borderColor: isActive ? 'var(--border-color)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                <MessageSquare size={14} style={{ flexShrink: 0 }} />
                <span style={threadTitleStyle}>{thread.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(thread.id);
                  }}
                  className="delete-btn"
                  style={deleteButtonStyle}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 下部アクションエリア */}
      <div style={footerStyle}>
        {/* VRAM視覚化インジケーター */}
        {vramInfo && (
          <div style={vramPanelStyle}>
            <div style={vramHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <BarChart2 size={12} color="var(--theme-primary)" />
                <span style={{ fontSize: '11px', fontWeight: '600' }}>VRAM 使用量 (16GB制限)</span>
              </div>
              <span style={{ 
                fontSize: '10px', 
                fontWeight: '700', 
                color: vramInfo.status === 'danger' ? '#ff5555' : vramInfo.status === 'warning' ? '#eab308' : '#22c55e'
              }}>
                {vramInfo.statusText}
              </span>
            </div>
            
            <div style={vramBarBgStyle}>
              <div style={{ 
                ...vramBarStyle, 
                width: `${Math.min(vramInfo.percent, 100)}%`,
                background: vramInfo.status === 'danger' ? 'linear-gradient(to right, #ff5555, #ef4444)' : vramInfo.status === 'warning' ? 'linear-gradient(to right, #eab308, #f59e0b)' : 'var(--theme-gradient)',
                boxShadow: vramInfo.status === 'danger' ? '0 0 8px rgba(255, 85, 85, 0.4)' : '0 0 8px var(--theme-glow)'
              }} />
            </div>
            
            <div style={vramFooterStyle}>
              <span>{vramInfo.used.toFixed(1)} GB / {vramInfo.total.toFixed(0)} GB</span>
              <span>{vramInfo.percent.toFixed(0)}%</span>
            </div>
          </div>
        )}

        <div style={modelBadgeStyle}>
          <Cpu size={13} style={{ flexShrink: 0 }} />
          <span style={modelBadgeTextStyle}>
            {currentModel || 'モデル未検出'}
          </span>
        </div>
        <div style={footerButtonsStyle}>
          <button onClick={onOpenModels} style={footerButtonStyle}>
            <HardDrive size={16} />
            <span>モデル管理</span>
          </button>
          <button onClick={onOpenSettings} style={footerButtonStyle}>
            <Settings size={16} />
            <span>設定</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// スタイル定義
const sidebarStyle = {
  width: 'var(--sidebar-width)',
  background: 'var(--bg-secondary)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRight: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  flexShrink: 0,
  transition: 'background-color 0.8s cubic-bezier(0.16, 1, 0.3, 1), border-right 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
};

const headerStyle = {
  padding: '20px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  borderBottom: '1px solid var(--border-color)',
};

const logoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const logoIconBgStyle = {
  background: 'var(--theme-glow)',
  padding: '6px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border-color)',
};

const newChatButtonStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--theme-gradient)',
  color: '#ffffff',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  fontWeight: '600',
  fontSize: '14px',
  boxShadow: '0 4px 12px var(--theme-glow)',
};

const sectionHeaderStyle = {
  fontSize: '11px',
  fontWeight: '700',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  padding: '0 16px 8px 16px',
};

const threadListStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const emptyStateStyle = {
  color: 'var(--text-muted)',
  fontSize: '13px',
  textAlign: 'center',
  padding: '30px 16px',
};

const threadItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 16px',
  fontSize: '13.5px',
  cursor: 'pointer',
  borderRadius: '0 12px 12px 0',
  marginRight: '12px',
  borderLeft: '3px solid transparent',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  position: 'relative',
  overflow: 'hidden',
};

const threadTitleStyle = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: '500',
};

const deleteButtonStyle = {
  background: 'transparent',
  color: 'var(--text-muted)',
  padding: '4px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.3,
  transition: 'opacity 0.2s ease',
  position: 'absolute',
  right: '8px',
};

const footerStyle = {
  padding: '16px',
  borderTop: '1px solid var(--border-color)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  background: 'rgba(0, 0, 0, 0.15)',
};

const vramPanelStyle = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const vramHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const vramBarBgStyle = {
  width: '100%',
  height: '6px',
  background: 'rgba(255,255,255,0.06)',
  borderRadius: '3px',
  overflow: 'hidden',
};

const vramBarStyle = {
  height: '100%',
  borderRadius: '3px',
  transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
};

const vramFooterStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '10px',
  color: 'var(--text-secondary)',
  fontWeight: '500',
};

const modelBadgeStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid var(--border-color)',
  padding: '8px 12px',
  borderRadius: '8px',
  color: 'var(--text-secondary)',
};

const modelBadgeTextStyle = {
  fontSize: '12px',
  fontWeight: '600',
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const footerButtonsStyle = {
  display: 'flex',
  gap: '8px',
};

const footerButtonStyle = {
  flex: 1,
  padding: '8px 12px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-secondary)',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontSize: '12px',
  fontWeight: '500',
};
