import React, { useState, useRef, useEffect, useMemo, memo } from 'react';
import { Send, Image, X, Sparkles, AlertCircle, Square, Globe, Mic, Volume2, Download } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markup'; // HTML/XML
import { GEMINI_MODELS } from '../utils/ollamaApi';

// markdownの設定
marked.setOptions({
  breaks: true,
  gfm: true
});

// Markdown→HTML変換後、DOMPurifyで無害化してから描画する
// (AIの応答やWeb検索結果の中に悪意あるHTML/スクリプトが混入していても実行させないため)
const renderMarkdownSafe = (text) => DOMPurify.sanitize(marked.parse(text));

// メッセージ本文の描画。内容が変わらない限り再描画しない (memo) ため、生成中も
// Markdown 変換は「今まさに伸びている最後のメッセージ」だけで行われる
const MessageContent = memo(function MessageContent({ content }) {
  const { thinkContent, html } = useMemo(() => {
    // メッセージテキストから <think> タグ部分と本文を分離する
    const thinkRegex = /<think>([\s\S]*?)(<\/think>|$)/;
    const match = content.match(thinkRegex);
    const body = match ? content.replace(thinkRegex, '').trim() : content;
    return {
      thinkContent: match ? match[1].trim() : '',
      html: body ? renderMarkdownSafe(body) : ''
    };
  }, [content]);

  return (
    <>
      {thinkContent && (
        <details className="think-block" open={!html}>
          <summary className="think-header">
            <Sparkles size={13} style={{ marginRight: '6px' }} />
            <span>思考プロセス</span>
          </summary>
          <div style={{ marginTop: '8px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
            {thinkContent}
          </div>
        </details>
      )}
      {html && (
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </>
  );
});

export default function ChatArea({
  messages,
  onSendMessage,
  models,
  selectedModel,
  onSelectModel,
  loading,
  onStopGeneration,
  webSearchEnabled,
  onToggleWebSearch
}) {
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState(null); // { url, base64 }
  const [attachedFile, setAttachedFile] = useState(null); // { name, content, size }
  const [isListening, setIsListening] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState(null); // 音声読み上げ中のメッセージID
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // 音声入力のハンドラ
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('お使いの環境は音声入力をサポートしていません。Chromeなどの主要なブラウザをご利用ください。');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const rec = new SpeechRecognition();
      rec.lang = 'ja-JP';
      rec.continuous = false;
      rec.interimResults = false;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setInputText(prev => prev + text);
      };

      rec.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    }
  };

  // 音声読み上げのハンドラ
  const toggleSpeechSynthesis = (msgId, text) => {
    if (isSpeakingId === msgId) {
      window.speechSynthesis.cancel();
      setIsSpeakingId(null);
    } else {
      window.speechSynthesis.cancel(); // 既存の読み上げをクリア
      
      // HTMLマークダウンタグや思案プロセス (<think> タグ) を除去したプレーンテキストを作成
      let cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, ''); // 思考プロセスを除外
      cleanText = cleanText.replace(/<[^>]+>/g, ''); // HTMLタグを除去
      cleanText = cleanText.replace(/`{3}[\s\S]*?`{3}/g, '[プログラムコードが提示されています]'); // コードブロックは読み上げない
      cleanText = cleanText.replace(/[*#`_\-~]/g, ''); // マークダウン記号を除去

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ja-JP';
      utterance.rate = 1.0; // 読み上げ速度

      utterance.onend = () => {
        setIsSpeakingId(null);
      };

      utterance.onerror = () => {
        setIsSpeakingId(null);
      };

      utteranceRef.current = utterance;
      setIsSpeakingId(msgId);
      window.speechSynthesis.speak(utterance);
    }
  };

  // 会話履歴を Markdown にエクスポートして保存
  const exportThreadToMarkdown = () => {
    if (messages.length === 0) return;
    
    let mdContent = `# Local AI 会話履歴\n\n`;
    messages.forEach((msg, index) => {
      const roleName = msg.role === 'user' ? 'ユーザー' : 'AI';
      mdContent += `## 👤 ${roleName}\n\n${msg.content}\n\n`;
      if (msg.sources && msg.sources.length > 0) {
        mdContent += `**参考ソース:**\n`;
        msg.sources.forEach((src) => {
          mdContent += `- [${src.title}](${src.url})\n`;
        });
        mdContent += `\n`;
      }
      mdContent += `---\n\n`;
    });

    window.electronAPI.saveFile(mdContent, 'local_ai_conversation.md').then((res) => {
      if (res && res.success) {
        alert(`ファイルを保存しました: ${res.filePath}`);
      }
    });
  };

  useEffect(() => {
    // コンポーネントのアンマウント時に音声読み上げを必ず停止
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // 最下部付近を見ているときだけ自動スクロール (上の履歴を読んでいる最中に引き戻さない)。
  // 生成中は smooth だと毎フレームのアニメーションが重なるので即時スクロールにする
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth' });
    }
  }, [messages, loading]);

  useEffect(() => {
    // コードハイライトとアクションバーは生成完了後にまとめて適用する。
    // 生成中に毎回ページ全体を走査・ハイライトすると、未完成のコードに対して無駄な処理が走り続ける
    const container = messagesContainerRef.current;
    if (loading || !container) return;
    Prism.highlightAllUnder(container);

    // 全てのコードブロック pre タグに コピー・保存 アクションバーを動的に追加
    const preBlocks = container.querySelectorAll('pre');
    preBlocks.forEach((pre) => {
      if (pre.querySelector('.code-action-bar')) return; // 二重追加を防止
      
      const codeElement = pre.querySelector('code');
      const codeText = codeElement ? codeElement.innerText : pre.innerText;
      
      const bar = document.createElement('div');
      bar.className = 'code-action-bar';
      bar.style = 'display: flex; justify-content: flex-end; gap: 8px; padding: 6px 12px; background: #27272a; border-bottom: 1px solid #3f3f46; border-top-left-radius: 8px; border-top-right-radius: 8px; font-size: 11px; margin-bottom: 8px;';
      
      // 言語ラベルの追加 (左端)
      const langClass = Array.from(codeElement?.classList || []).find(c => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : 'code';
      const langLabel = document.createElement('span');
      langLabel.innerText = lang.toUpperCase();
      langLabel.style = 'margin-right: auto; align-self: center; color: #a1a1aa; font-weight: 700; font-family: sans-serif;';
      bar.appendChild(langLabel);

      // コピーボタン
      const copyBtn = document.createElement('button');
      copyBtn.innerText = 'コピー';
      copyBtn.style = 'background: transparent; color: #e4e4e7; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 11px;';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(codeText);
        copyBtn.innerText = 'コピー完了';
        setTimeout(() => { copyBtn.innerText = 'コピー'; }, 2000);
      };
      bar.appendChild(copyBtn);
      
      // 保存ボタン (Electronの特権 filesystem 書き出し)
      const saveBtn = document.createElement('button');
      saveBtn.innerText = 'PCに保存';
      saveBtn.style = 'background: var(--theme-primary); color: white; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 11px;';
      saveBtn.onclick = () => {
        const ext = lang === 'javascript' ? 'js' : lang === 'python' ? 'py' : lang === 'markdown' ? 'md' : lang;
        const defaultName = `code_block.${ext}`;
        window.electronAPI.saveFile(codeText, defaultName).then((res) => {
          if (res && res.success) {
            alert(`ファイルを保存しました: ${res.filePath}`);
          }
        });
      };
      bar.appendChild(saveBtn);
      
      pre.insertBefore(bar, pre.firstChild);
      pre.style.paddingTop = '0'; // 上部余白をヘッダーで埋めるため詰める
    });
  }, [messages, loading]);

  const handleSend = () => {
    if (!inputText.trim() && !attachedImage && !attachedFile) return;
    onSendMessage(inputText, attachedImage, attachedFile);
    setInputText('');
    setAttachedImage(null);
    setAttachedFile(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const processFile = (file) => {
    if (!file) return;
    
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachedImage({
          url: e.target.result, // プレビュー用 (data:image/...)
          base64: e.target.result.split(',')[1] // Ollama送信用 (純粋なbase64)
        });
        setAttachedFile(null);
      };
      reader.readAsDataURL(file);
    } else {
      // テキスト・コードファイルの読み込み
      const ext = file.name.split('.').pop().toLowerCase();
      const textExtensions = ['txt', 'py', 'js', 'css', 'html', 'json', 'md', 'csv', 'yaml', 'yml', 'c', 'cpp', 'h', 'java', 'go', 'rs', 'sh', 'bat', 'vbs', 'sql', 'ini', 'xml'];
      
      if (textExtensions.includes(ext) || file.type.startsWith('text/') || file.type === 'application/pdf') {
        // PDFの文字抽出に関しては、拡張子がpdfの場合は特殊ハンドリング等ができるが、まずはプレーンテキスト系を読み込む
        const reader = new FileReader();
        reader.onload = (e) => {
          setAttachedFile({
            name: file.name,
            content: e.target.result,
            size: file.size
          });
          setAttachedImage(null);
        };
        reader.readAsText(file);
      } else {
        alert('非対応のファイル形式です。テキストファイル、コードファイル (.py, .js 等)、または画像を添付してください。');
      }
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    processFile(file);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        processFile(file);
        break;
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    processFile(file);
  };

  const renderSources = (sources) => {
    if (!sources || sources.length === 0) return null;
    return (
      <div style={sourcesContainerStyle}>
        <div style={sourcesHeaderStyle}>
          <Globe size={11} color="var(--theme-primary)" style={{ marginRight: '4px' }} />
          <span>関連情報源 (Web Sources):</span>
        </div>
        <div style={sourcesListStyle}>
          {sources.map((src, i) => {
            let hostname = '';
            try {
              hostname = new URL(src.url).hostname;
            } catch (e) {
              hostname = 'link';
            }
            return (
              <a 
                key={i} 
                href={src.url} 
                target="_blank" 
                rel="noopener noreferrer" 
                style={sourceCardStyle}
                title={src.snippet}
              >
                <span style={sourceTitleStyle}>{src.title}</span>
                <span style={sourceUrlStyle}>{hostname}</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div 
      style={chatAreaStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {/* 上部バー / モデル選択 */}
      <div style={topBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            対話モデル:
          </span>
          <select 
            value={selectedModel} 
            onChange={(e) => onSelectModel(e.target.value)}
            style={selectStyle}
          >
            <optgroup label="⚡ クラウド AI (Google Cloud)">
              {GEMINI_MODELS.map(g => (
                <option key={g.id} value={g.id}>✨ {g.label}</option>
              ))}
            </optgroup>
            
            <optgroup label="💻 ローカル AI (Ollama)">
              {models.length > 0 ? (
                models.map(m => (
                  <option key={m.name} value={m.name}>
                    {m.name.includes('gpt-oss') ? '🚀 ' : m.name.includes('deepseek-r1') ? '🧠 ' : m.name.includes('coder') ? '💻 ' : m.name.includes('gemma') ? '💎 ' : '🤖 '}
                    {m.name} {m.size ? `(${(m.size / (1024 * 1024 * 1024)).toFixed(1)}GB)` : ''}
                  </option>
                ))
              ) : (
                <option value="" disabled>ローカルモデル未検出 (モデル管理から導入可)</option>
              )}
            </optgroup>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {messages.length > 0 && (
            <button 
              onClick={exportThreadToMarkdown} 
              style={{
                ...actionButtonStyle, 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                padding: '6px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontWeight: '600',
                fontSize: '12px'
              }}
              title="会話履歴をMarkdownファイルとして保存"
            >
              <Download size={14} />
              <span>会話を保存</span>
            </button>
          )}

          {loading && (
            <button onClick={onStopGeneration} style={stopButtonStyle}>
              <Square size={14} fill="currentColor" />
              <span>生成停止</span>
            </button>
          )}
        </div>
      </div>

      {/* ドラッグオーバー時のオーバーレイ */}
      {isDragOver && (
        <div style={dragOverlayStyle}>
          <div style={dragOverlayContentStyle}>
            <Image size={40} color="var(--theme-primary)" />
            <p style={{ fontWeight: '600', marginTop: '10px' }}>ファイルや画像をドロップして添付</p>
          </div>
        </div>
      )}

      {/* メッセージ表示エリア */}
      <div style={messagesContainerStyle} ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div style={welcomeContainerStyle}>
            <div style={welcomeIconStyle}>
              <Sparkles size={36} color="var(--theme-primary)" />
            </div>
            <h1 style={welcomeTitleStyle}>Local AI</h1>
            <p style={welcomeSubtitleStyle}>
              スペック限界に挑む、あなた専用のローカルAI環境です。<br />
              画像をドロップするか、コーディングの質問を入力してください。
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div 
                key={index} 
                style={{
                  ...messageRowStyle,
                  justifyContent: isUser ? 'flex-end' : 'flex-start'
                }}
              >
                {/* AIメッセージの場合はアバター表示 */}
                {!isUser && (
                  <div style={botAvatarStyle}>
                    <Sparkles size={14} color="#ffffff" />
                  </div>
                )}

                <div 
                  style={{
                    ...messageBubbleStyle,
                    background: isUser ? 'var(--chat-bubble-user)' : 'var(--chat-bubble-bot)',
                    border: isUser ? '1px solid rgba(255,255,255,0.05)' : '1px solid var(--border-color)',
                    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    maxWidth: isUser ? '75%' : '85%'
                  }}
                >
                  {/* AIメッセージバブルの上部アクションヘッダー */}
                  {!isUser && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>
                        AI RESPONSE
                      </span>
                      <button 
                        onClick={() => toggleSpeechSynthesis(msg.id || index, msg.content)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: isSpeakingId === (msg.id || index) ? 'var(--theme-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '2px',
                          borderRadius: '4px',
                        }}
                        title={isSpeakingId === (msg.id || index) ? '読み上げを停止' : '読み上げを開始'}
                      >
                        <Volume2 size={13} />
                      </button>
                    </div>
                  )}
                  {/* 添付画像プレビュー */}
                  {msg.image && (
                    <img 
                      src={`data:image/jpeg;base64,${msg.image}`} 
                      alt="添付画像" 
                      style={messageImageStyle} 
                    />
                  )}
                  <MessageContent content={msg.content || ''} />
                  {renderSources(msg.sources)}
                </div>
              </div>
            );
          })
        )}
        
        {/* ローディングメッセージ */}
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <div style={messageRowStyle}>
            <div style={botAvatarStyle}>
              <div className="spin-animation" style={{ width: '12px', height: '12px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }} />
            </div>
            <div style={{ ...messageBubbleStyle, background: 'var(--chat-bubble-bot)', border: '1px solid var(--border-color)', borderRadius: '18px 18px 18px 4px' }}>
              <div style={typingIndicatorStyle}>
                <span style={dotStyle} />
                <span style={{ ...dotStyle, animationDelay: '0.2s' }} />
                <span style={{ ...dotStyle, animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* フッター / 入力エリア */}
      <div style={inputContainerStyle}>
        {/* 画像添付プレビュー */}
        {attachedImage && (
          <div style={imagePreviewContainerStyle}>
            <img src={attachedImage.url} alt="プレビュー" style={imagePreviewStyle} />
            <button onClick={() => setAttachedImage(null)} style={removeImageButtonStyle}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* テキストファイル添付プレビュー */}
        {attachedFile && (
          <div style={filePreviewContainerStyle}>
            <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: '600' }}>
              📄 {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)
            </span>
            <button onClick={() => setAttachedFile(null)} style={removeImageButtonStyle}>
              <X size={12} />
            </button>
          </div>
        )}

        <div style={inputWrapperStyle} className="glass-panel">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力... (ファイル/画像をドラッグ＆ドロップまたはペーストで添付可)"
            rows={1}
            style={textareaInputStyle}
          />
          
          <div style={inputActionsStyle}>
            <button 
              onClick={onToggleWebSearch} 
              style={{
                ...actionButtonStyle,
                color: webSearchEnabled ? 'var(--theme-primary)' : 'var(--text-secondary)',
                background: webSearchEnabled ? 'var(--theme-glow)' : 'transparent',
                border: webSearchEnabled ? '1px solid var(--border-color)' : 'none',
                borderRadius: '8px',
                boxShadow: webSearchEnabled ? '0 0 8px var(--theme-glow)' : 'none'
              }} 
              title="ネット検索を有効化"
            >
              <Globe size={18} />
            </button>

            <button 
              onClick={toggleSpeechRecognition} 
              style={{
                ...actionButtonStyle,
                color: isListening ? '#ef4444' : 'var(--text-secondary)',
                background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                border: isListening ? '1px solid rgba(239, 68, 68, 0.2)' : 'none',
                borderRadius: '8px',
                boxShadow: isListening ? '0 0 8px rgba(239, 68, 68, 0.3)' : 'none'
              }} 
              title={isListening ? '音声入力を停止' : '音声入力を開始'}
            >
              <Mic size={18} />
            </button>

            <button onClick={() => fileInputRef.current.click()} style={actionButtonStyle} title="ファイルを添付 (画像/テキスト)">
              <Image size={18} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageChange} 
              style={{ display: 'none' }} 
            />

            <button 
              onClick={handleSend} 
              disabled={(!inputText.trim() && !attachedImage && !attachedFile) || loading}
              style={{
                ...sendButtonStyle,
                background: (!inputText.trim() && !attachedImage && !attachedFile) || loading ? 'rgba(0,0,0,0.03)' : 'var(--theme-gradient)',
                color: (!inputText.trim() && !attachedImage && !attachedFile) || loading ? 'var(--text-muted)' : '#ffffff'
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// スタイル定義
const chatAreaStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  position: 'relative',
  background: 'transparent',
};

const topBarStyle = {
  padding: '12px 24px',
  borderBottom: '1px solid var(--border-color)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'rgba(0, 0, 0, 0.1)',
  backdropFilter: 'blur(8px)',
  zIndex: 10,
};

const selectStyle = {
  padding: '6px 12px',
  fontSize: '13px',
  fontWeight: '600',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'rgba(255, 255, 255, 0.9)',
  color: '#000000',
  cursor: 'pointer',
  minWidth: '180px',
};

const stopButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 85, 85, 0.3)',
  background: 'rgba(255, 85, 85, 0.1)',
  color: '#ff5555',
  fontSize: '12px',
  fontWeight: '600',
};

const dragOverlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(10, 10, 15, 0.85)',
  backdropFilter: 'blur(6px)',
  zIndex: 100,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

const dragOverlayContentStyle = {
  border: '2px dashed var(--theme-primary)',
  borderRadius: '16px',
  padding: '40px',
  textAlign: 'center',
  color: 'var(--text-primary)',
  background: 'rgba(255, 255, 255, 0.02)',
};

const messagesContainerStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const welcomeContainerStyle = {
  margin: 'auto',
  maxWidth: '540px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  padding: '40px 20px',
};

const welcomeIconStyle = {
  padding: '16px',
  borderRadius: '50%',
  background: 'var(--theme-glow)',
  border: '1px solid var(--border-color)',
  marginBottom: '8px',
  boxShadow: '0 8px 32px var(--theme-glow)',
};

const welcomeTitleStyle = {
  fontSize: '32px',
  fontWeight: '800',
  letterSpacing: '-1px',
  background: 'var(--theme-gradient)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const welcomeSubtitleStyle = {
  fontSize: '14.5px',
  color: 'var(--text-secondary)',
  lineHeight: '1.6',
};

const messageRowStyle = {
  display: 'flex',
  gap: '12px',
  alignItems: 'flex-start',
  animation: 'float-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
};

const botAvatarStyle = {
  width: '28px',
  height: '28px',
  borderRadius: '8px',
  background: 'var(--theme-gradient)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: '2px',
  boxShadow: '0 2px 8px var(--theme-glow)',
};

const messageBubbleStyle = {
  padding: '14px 18px',
  color: 'var(--text-primary)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
};

const messageImageStyle = {
  maxWidth: '300px',
  maxHeight: '200px',
  borderRadius: '8px',
  marginBottom: '10px',
  display: 'block',
};

const typingIndicatorStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  height: '18px',
};

const dotStyle = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: 'var(--text-secondary)',
  animation: 'spin 1s ease-in-out infinite alternate', // bounce効果の簡易代替
};

const inputContainerStyle = {
  padding: '16px 24px 24px 24px',
  background: 'linear-gradient(to top, var(--bg-primary) 80%, transparent 100%)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const imagePreviewContainerStyle = {
  display: 'flex',
  position: 'relative',
  width: '60px',
  height: '60px',
  marginLeft: '10px',
};

const imagePreviewStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
};

const removeImageButtonStyle = {
  position: 'absolute',
  top: '-6px',
  right: '-6px',
  background: '#ff5555',
  color: '#ffffff',
  border: 'none',
  borderRadius: '50%',
  width: '18px',
  height: '18px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
};

const inputWrapperStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 16px',
  background: 'rgba(255, 255, 255, 0.03)',
};

const textareaInputStyle = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontSize: '14.5px',
  resize: 'none',
  padding: '6px 0',
  lineHeight: '1.5',
  maxHeight: '120px',
};

const inputActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const actionButtonStyle = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  padding: '6px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.2s',
  ':hover': {
    color: 'var(--text-primary)',
    background: 'rgba(255,255,255,0.05)'
  }
};

const sendButtonStyle = {
  padding: '8px 12px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
};

const sourcesContainerStyle = {
  marginTop: '14px',
  borderTop: '1px dashed var(--border-color)',
  paddingTop: '10px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const sourcesHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '11px',
  fontWeight: '700',
  color: 'var(--text-secondary)',
  letterSpacing: '0.3px',
};

const sourcesListStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
};

const sourceCardStyle = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '6px 10px',
  fontSize: '11.5px',
  color: 'var(--theme-primary)',
  textDecoration: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  maxWidth: '220px',
  transition: 'all 0.2s',
  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
};

const sourceTitleStyle = {
  fontWeight: '600',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--text-primary)',
};

const sourceUrlStyle = {
  fontSize: '10px',
  color: 'var(--text-muted)',
};

const filePreviewContainerStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '12px',
  padding: '6px 12px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  marginBottom: '8px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
};
