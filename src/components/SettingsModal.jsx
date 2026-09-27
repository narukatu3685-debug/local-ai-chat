import React, { useState } from 'react';
import { X, Sliders, KeyRound, Check } from 'lucide-react';

export default function SettingsModal({ settings, setSettings, geminiApiKey, onSaveApiKey, onClose }) {
  const [apiKeyInput, setApiKeyInput] = useState(geminiApiKey || '');
  const [saved, setSaved] = useState(false);

  const handleChange = (key, value) => {
    setSettings({ ...settings, [key]: value }); // 保存は App 側でまとめて行う
  };

  const handleSaveKey = async () => {
    await onSaveApiKey(apiKeyInput.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={modalOverlayStyle}>
      <div className="glass-panel animate-float" style={modalContentStyle}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} color="var(--theme-primary)" />
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>システム設定 (VRAM/記憶制限)</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle}>
            <X size={18} />
          </button>
        </div>

        <div style={modalBodyStyle}>
          {/* Gemini APIキー */}
          <div style={formGroupStyle}>
            <label style={labelStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <KeyRound size={14} />
                Gemini APIキー (クラウドモデル利用時に必要)
              </span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AI Studio で発行したAPIキーを入力"
                style={{ ...numberInputStyle, flex: 1 }}
                autoComplete="off"
              />
              <button onClick={handleSaveKey} style={saveKeyButtonStyle}>
                {saved ? <><Check size={14} /> 保存済</> : '保存'}
              </button>
            </div>
            <p style={helperTextStyle}>
              このキーはOSの資格情報ストア（Windows資格情報マネージャー）に暗号化して保存され、ソースコードやアプリの外部には出ません。空欄で保存するとキーを削除できます。
            </p>
          </div>

          {/* コンテキスト制限 */}
          <div style={formGroupStyle}>
            <label style={labelStyle}>
              <span>コンテキストサイズ (VRAMの記憶スペース)</span>
              <span style={badgeStyle}>{settings.num_ctx} tokens</span>
            </label>
            <input
              type="range"
              min="1024"
              max="131072"
              step="1024"
              value={settings.num_ctx}
              onChange={(e) => handleChange('num_ctx', parseInt(e.target.value))}
              style={rangeInputStyle}
            />
            <div style={sliderLabelsStyle}>
              <span>1024 (超高速/省メモリ)</span>
              <span>131072 (128k - 超長文対応)</span>
            </div>
            <p style={helperTextStyle}>
              推奨は 8192。gpt-oss:20b なら 16384 程度まで 16GB VRAM に収まります。思考モデルは思考だけで数千トークン使うため、小さすぎると会話の冒頭（システムプロンプト）が切り捨てられます。大きくしすぎて 16GB VRAM を超えると自動でRAM（メモリ）に退避され、処理速度が大きく低下します。左下のVRAMメーターで実測値を確認できます。
            </p>
          </div>

          {/* 履歴件数の制限 */}
          <div style={formGroupStyle}>
            <label style={labelStyle}>
              <span>送信する過去履歴の最大件数 (入力制限)</span>
              <span style={badgeStyle}>{settings.historyLimit} メッセージ</span>
            </label>
            <input
              type="number"
              min="2"
              max="30"
              value={settings.historyLimit}
              onChange={(e) => handleChange('historyLimit', parseInt(e.target.value) || 10)}
              style={numberInputStyle}
            />
            <p style={helperTextStyle}>
              Ollamaに一度に送る過去の会話往復件数。これを制限することで、「入力の量」を削り、VRAMの圧迫を防ぎます。
            </p>
          </div>

          {/* システムプロンプト */}
          <div style={formGroupStyle}>
            <label style={labelStyle}>
              <span>システムプロンプト (AIの役割・性格定義)</span>
            </label>
            <textarea
              rows={4}
              value={settings.systemPrompt}
              onChange={(e) => handleChange('systemPrompt', e.target.value)}
              placeholder="例: あなたは親切なプログラミングアシスタントです。"
              style={textareaStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// スタイル定義
const modalOverlayStyle = {
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

const modalContentStyle = {
  width: '520px',
  maxWidth: '90%',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const modalHeaderStyle = {
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

const modalBodyStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const formGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const labelStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '14px',
  fontWeight: '500',
  color: 'var(--text-primary)',
};

const badgeStyle = {
  fontSize: '12px',
  background: 'var(--theme-glow)',
  color: 'var(--theme-primary)',
  padding: '2px 8px',
  borderRadius: '12px',
  fontWeight: '600',
};

const rangeInputStyle = {
  width: '100%',
  height: '6px',
  accentColor: 'var(--theme-primary)',
  background: 'rgba(255, 255, 255, 0.1)',
  borderRadius: '4px',
  outline: 'none',
};

const sliderLabelsStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '11px',
  color: 'var(--text-secondary)',
};

const numberInputStyle = {
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid var(--border-color)',
  background: 'rgba(255, 255, 255, 0.03)',
  color: 'var(--text-primary)',
  borderRadius: '8px',
  width: '100%',
};

const textareaStyle = {
  padding: '10px 12px',
  fontSize: '14px',
  border: '1px solid var(--border-color)',
  background: 'rgba(255, 255, 255, 0.03)',
  color: 'var(--text-primary)',
  borderRadius: '8px',
  resize: 'none',
  lineHeight: '1.5',
};

const saveKeyButtonStyle = {
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: '600',
  borderRadius: '8px',
  border: 'none',
  background: 'var(--theme-primary)',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  whiteSpace: 'nowrap',
};

const helperTextStyle = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  lineHeight: '1.4',
};
