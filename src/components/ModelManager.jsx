import React, { useState } from 'react';
import { Download, Trash2, HardDrive, AlertTriangle, Check, RefreshCw, X } from 'lucide-react';
import { deleteModel, pullModel } from '../utils/ollamaApi';

// 16GB VRAM (RTX 5060 Ti) に収まる Ollama 公式配布モデルのみ（2026年9月時点）
const RECOMMENDED_MODELS = [
  {
    name: 'gpt-oss:20b',
    label: 'OpenAI gpt-oss (20B)',
    size: '約13GB (MoE・実働3.6B)',
    desc: '16GB帯の総合ベスト。この PC で実測 約88 tok/s・GPU100%駆動。思考モード対応。',
    tag: 'gpt-oss:20b'
  },
  {
    name: 'qwen3:14b',
    label: 'Qwen 3 (14B)',
    size: '約9.3GB',
    desc: '日本語のトークン効率が高く、VRAMに余裕が残るため長文コンテキストやコーディングに強い。',
    tag: 'qwen3:14b'
  },
  {
    name: 'deepseek-r1:14b',
    label: 'DeepSeek R1 (14B)',
    size: '約9.0GB',
    desc: '思考プロセス（Reasoning）特化。数学・論理パズル・難しいアルゴリズムに強い。',
    tag: 'deepseek-r1:14b'
  },
  {
    name: 'mistral-small:24b',
    label: 'Mistral Small (24B)',
    size: '約14GB',
    desc: '文章品質・指示追従性が高い。VRAMがギリギリなのでコンテキスト長は控えめに。',
    tag: 'mistral-small:24b'
  }
];

const spinStyleContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .spin-animation {
    animation: spin 1.5s linear infinite;
  }
`;

export default function ModelManager({ models, refreshModels, onClose }) {
  const [downloading, setDownloading] = useState({});
  const [error, setError] = useState(null);

  const formatSize = (bytes) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  const handleDelete = async (name) => {
    if (confirm(`モデル ${name} を削除してSSDの空き容量を増やしますか？`)) {
      try {
        await deleteModel(name);
        refreshModels();
      } catch (err) {
        setError(`モデルの削除に失敗しました: ${err.message}`);
      }
    }
  };

  const handleDownload = (name) => {
    if (downloading[name]) return;

    setDownloading(prev => ({
      ...prev,
      [name]: { percent: 0, status: '開始中...' }
    }));

    pullModel(
      name,
      (percent, status) => {
        setDownloading(prev => ({
          ...prev,
          [name]: { percent, status }
        }));
      },
      () => {
        setDownloading(prev => {
          const copy = { ...prev };
          delete copy[name];
          return copy;
        });
        refreshModels();
      },
      (err) => {
        setDownloading(prev => {
          const copy = { ...prev };
          delete copy[name];
          return copy;
        });
        setError(`ダウンロードエラー: ${err}`);
      }
    );
  };

  return (
    <div style={overlayStyle}>
      <style dangerouslySetInnerHTML={{ __html: spinStyleContent }} />
      <div className="glass-panel animate-float" style={contentStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={22} color="var(--theme-primary)" />
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>モデル＆ストレージ管理</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={errorStyle}>
            <AlertTriangle size={16} />
            <span style={{ fontSize: '13px' }}>{error}</span>
            <button onClick={() => setError(null)} style={errorCloseStyle}>閉じる</button>
          </div>
        )}

        <div style={bodyStyle}>
          <div style={sectionStyle}>
            <h4 style={sectionTitleStyle}>インストール済みのローカルモデル</h4>
            <div style={listStyle}>
              {models.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px' }}>モデルが見つかりません。以下からダウンロードしてください。</p>
              ) : (
                models.map(model => (
                  <div key={model.name} style={itemStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: '500', fontSize: '14px' }}>{model.name}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        サイズ: {formatSize(model.size)}
                      </span>
                    </div>
                    <button onClick={() => handleDelete(model.name)} style={deleteButtonStyle} title="モデルを削除してSSDを空ける">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={sectionStyle}>
            <h4 style={sectionTitleStyle}>16GB VRAM 向け最新おすすめモデル</h4>
            <div style={listStyle}>
              {RECOMMENDED_MODELS.map(rec => {
                const isInstalled = models.some(m => m.name.startsWith(rec.tag) || m.name === rec.tag);
                const isDownloading = downloading[rec.tag];

                return (
                  <div key={rec.name} style={{ ...itemStyle, flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{rec.label}</span>
                        <span style={sizeBadgeStyle}>
                          {rec.size}
                        </span>
                      </div>

                      {isInstalled ? (
                        <span style={{ color: '#22c55e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={14} /> 導入済み
                        </span>
                      ) : isDownloading ? (
                        <span style={{ color: 'var(--theme-primary)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <RefreshCw size={14} className="spin-animation" /> 
                          {isDownloading.percent !== null ? `${isDownloading.percent}%` : isDownloading.status}
                        </span>
                      ) : (
                        <button onClick={() => handleDownload(rec.tag)} style={downloadButtonStyle}>
                          <Download size={12} /> 導入
                        </button>
                      )}
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{rec.desc}</p>
                    
                    {isDownloading && isDownloading.percent !== null && (
                      <div style={progressContainerStyle}>
                        <div style={{ ...progressBarStyle, width: `${isDownloading.percent}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// スタイル定義
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.65)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)',
};

const contentStyle = {
  width: '580px',
  maxWidth: '90%',
  maxHeight: '85vh',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '12px',
};

const closeButtonStyle = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  padding: '4px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const errorStyle = {
  backgroundColor: 'rgba(255, 85, 85, 0.1)',
  border: '1px solid rgba(255, 85, 85, 0.3)',
  color: '#ff5555',
  padding: '10px 14px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const errorCloseStyle = {
  background: 'transparent',
  marginLeft: 'auto',
  color: '#ff5555',
  fontWeight: '600',
  fontSize: '12px',
};

const bodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  overflowY: 'auto',
  paddingRight: '4px',
};

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const sectionTitleStyle = {
  fontSize: '13px',
  fontWeight: '600',
  color: 'var(--theme-primary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const listStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const itemStyle = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  padding: '12px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  transition: 'all 0.2s ease',
};

const deleteButtonStyle = {
  background: 'rgba(255, 85, 85, 0.1)',
  color: '#ff5555',
  padding: '8px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid rgba(255, 85, 85, 0.15)',
};

const downloadButtonStyle = {
  background: 'var(--theme-primary)',
  color: '#ffffff',
  padding: '6px 12px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontWeight: '500',
  fontSize: '13px',
};

const sizeBadgeStyle = {
  fontSize: '11px',
  background: 'var(--theme-glow)',
  color: 'var(--theme-primary)',
  padding: '2px 6px',
  borderRadius: '4px',
  marginLeft: '8px',
  fontWeight: '600',
};

const progressContainerStyle = {
  width: '100%',
  height: '4px',
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '2px',
  overflow: 'hidden',
  marginTop: '4px',
};

const progressBarStyle = {
  height: '100%',
  background: 'var(--theme-primary)',
  borderRadius: '2px',
  transition: 'width 0.3s ease',
};
