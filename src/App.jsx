import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';
import ModelManager from './components/ModelManager';
import { listModels, listLoadedModels, chatStream, chatGeminiStream, DEFAULT_GEMINI_MODEL } from './utils/ollamaApi';
import confetti from 'canvas-confetti';

const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  num_ctx: 8192, // 思考モデルは思考だけで数千トークン使うため、3072 だと会話冒頭(システムプロンプト)が切り捨てられる
  historyLimit: 10,
  systemPrompt: 'あなたは優秀で親切なAIアシスタントです。要件に対して簡潔かつ技術的に正確に回答してください。'
};

const DEFAULT_LOCAL_MODEL = 'gpt-oss:20b'; // 16GB VRAM向け推奨ローカルモデル
const GiB = 1024 ** 3;

const loadSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('chat_settings') || 'null');
    if (!saved) return DEFAULT_SETTINGS;
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    // 旧バージョンの小さすぎる既定値 (3072) は一度だけ新しい既定値へ引き上げる
    if ((saved.settingsVersion || 1) < SETTINGS_VERSION && merged.num_ctx < DEFAULT_SETTINGS.num_ctx) {
      merged.num_ctx = DEFAULT_SETTINGS.num_ctx;
    }
    merged.settingsVersion = SETTINGS_VERSION;
    return merged;
  } catch (_) {
    return DEFAULT_SETTINGS;
  }
};

const readJson = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (_) {
    return fallback;
  }
};

// 過去の思考プロセスは回答に不要でコンテキストを大きく消費するため、履歴送信時は除外する
const stripThinking = (text) => (text || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();

export default function App() {
  const [threads, setThreads] = useState(() => readJson('chat_threads', []));

  const [currentThreadId, setCurrentThreadId] = useState(() => readJson('current_thread_id', null));

  const [models, setModels] = useState([]);
  const [loadedModels, setLoadedModels] = useState([]); // /api/ps: VRAMに載っているモデル
  const [selectedModel, setSelectedModel] = useState(DEFAULT_LOCAL_MODEL); // 未導入なら fetchModels で Gemini にフォールバック
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);

  const [settings, setSettings] = useState(loadSettings);

  const activeCancelRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('chat_settings', JSON.stringify(settings));
    } catch (_) { /* 保存失敗は致命的ではない */ }
  }, [settings]);

  // 0. APIキーの読み込み (OSの資格情報ストアから暗号化された状態で取得)
  useEffect(() => {
    window.electronAPI.getApiKey().then((key) => {
      setGeminiApiKey(key || '');
      setApiKeyLoaded(true);
    }).catch(() => setApiKeyLoaded(true));
  }, []);

  const handleSaveApiKey = async (key) => {
    setGeminiApiKey(key);
    await window.electronAPI.setApiKey(key);
  };

  // 1. モデル一覧の取得
  const fetchModels = async () => {
    try {
      const list = await listModels();
      setModels(list);
      
      // 保存された選択モデルがあるか確認 (クラウドモデルまたは存在するローカルモデル)
      setSelectedModel((prev) => {
        if (prev.startsWith('google/')) return prev;
        const exists = list.some(m => m.name === prev);
        if (exists) return prev;
        // 選択中モデルが無ければ推奨ローカルモデル → クラウドの順にフォールバック
        return list.some(m => m.name === DEFAULT_LOCAL_MODEL) ? DEFAULT_LOCAL_MODEL : DEFAULT_GEMINI_MODEL;
      });
    } catch (e) {
      console.error('Ollama connection failed', e);
    }
  };

  const refreshLoadedModels = async () => {
    setLoadedModels(await listLoadedModels());
  };

  useEffect(() => {
    fetchModels();
    refreshLoadedModels();
  }, []);

  useEffect(() => {
    if (!selectedModel.startsWith('google/')) refreshLoadedModels();
  }, [selectedModel]);

  // 2. モデルに応じた動的テーマ切り替え
  useEffect(() => {
    const body = document.body;
    body.className = ''; // クラスをリセット
    
    if (!selectedModel) {
      body.classList.add('theme-default');
      return;
    }

    const modelName = selectedModel.toLowerCase();
    if (modelName.includes('deepseek')) {
      body.classList.add('theme-deepseek');
    } else if (modelName.includes('gemini') || modelName.includes('gemma')) {
      body.classList.add('theme-gemma'); // Gemini/GemmaはGoogle Auraデザインを適用
    } else if (modelName.includes('qwen')) {
      body.classList.add('theme-qwen');
    } else if (modelName.includes('llama')) {
      body.classList.add('theme-llama');
    } else if (modelName.includes('mistral') || modelName.includes('nemo')) {
      body.classList.add('theme-mistral');
    } else {
      body.classList.add('theme-default');
    }
  }, [selectedModel]);

  // 3. データ永続化
  // 生成中は1秒に何十回も threads が変わるため、書き込みは少し待ってまとめて行う
  // (添付画像を含む全履歴の JSON 化を毎トークン行うと UI が重くなる)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('chat_threads', JSON.stringify(threads));
      } catch (e) {
        // 画像添付が多いと localStorage の容量上限 (約5MB) を超える。アプリは止めずに警告のみ
        console.warn('会話履歴の保存に失敗しました (容量超過の可能性):', e);
      }
    }, loading ? 1500 : 200);
    return () => clearTimeout(timer);
  }, [threads, loading]);

  useEffect(() => {
    try {
      localStorage.setItem('current_thread_id', JSON.stringify(currentThreadId));
    } catch (_) { /* noop */ }
  }, [currentThreadId]);

  // 4. VRAM 計算ロジック
  const getVramInfo = () => {
    const total = 16.0; // RTX 5060 Ti (16GB)
    const os = 1.0; // OS・画面描画の消費量 (目安)
    
    if (selectedModel.startsWith('google/')) {
      return {
        used: 0,
        total: total,
        percent: 0,
        status: 'safe',
        statusText: 'クラウドオンライン (VRAM消費 0GB)'
      };
    }

    // モデルがVRAMに読み込み済みなら Ollama の実測値 (本体 + KVキャッシュ込み) を使う
    const loaded = loadedModels.find(m => m.name === selectedModel);
    if (loaded && loaded.size_vram) {
      const used = os + loaded.size_vram / GiB;
      const offloaded = loaded.size > loaded.size_vram; // 一部がメインメモリに退避されている
      return {
        used,
        total,
        percent: (used / total) * 100,
        status: offloaded ? 'danger' : used > 15.0 ? 'warning' : 'safe',
        statusText: offloaded ? 'VRAM不足 (RAMへ退避中・低速)' : `実測値 (GPU100%駆動)`
      };
    }

    let modelSize = 0.0;
    const model = models.find(m => m.name === selectedModel);
    if (model && model.size) {
      modelSize = model.size / GiB;
    } else {
      // フォールバック推測
      const mName = selectedModel.toLowerCase();
      if (mName.includes('27b')) modelSize = 11.0;
      else if (mName.includes('24b')) modelSize = 14.0;
      else if (mName.includes('20b')) modelSize = 12.8;
      else if (mName.includes('14b')) modelSize = 9.0;
      else if (mName.includes('12b')) modelSize = 7.6;
      else if (mName.includes('8b') || mName.includes('7b')) modelSize = 4.8;
      else if (mName.includes('3b')) modelSize = 2.0;
    }

    // 未読込時の推定値。近年のモデル (GQA/スライディングウィンドウ) は KV キャッシュが小さく、
    // 実測でも gpt-oss:20b は num_ctx 8192→16384 で VRAM がほぼ変わらない (11.87GiB)
    const contextSize = (settings.num_ctx / 1024) * 0.05;
    const used = os + modelSize + contextSize;
    const percent = (used / total) * 100;

    let status = 'safe';
    let statusText = '推定: 最適 (GPU100%駆動)';

    if (used > 16.0) {
      status = 'danger';
      statusText = '容量過多 (激遅化の恐れ)';
    } else if (used > 15.0) {
      status = 'warning';
      statusText = '高負荷 (ギリギリ限界)';
    }

    return {
      used,
      total,
      percent,
      status,
      statusText
    };
  };

  const vramInfo = getVramInfo();

  // スレッド一覧から現在のスレッドのメッセージを取得
  const currentThread = threads.find(t => t.id === currentThreadId);
  const messages = currentThread ? currentThread.messages : [];

  // スレッド新規作成
  const handleCreateThread = () => {
    const newThread = {
      id: Date.now(),
      title: '新しい対話',
      messages: []
    };
    setThreads(prev => [newThread, ...prev]);
    setCurrentThreadId(newThread.id);
  };

  // スレッド削除
  const handleDeleteThread = (id) => {
    setThreads(prev => prev.filter(t => t.id !== id));
    if (currentThreadId === id) {
      const rest = threads.filter(t => t.id !== id);
      setCurrentThreadId(rest.length > 0 ? rest[0].id : null);
    }
  };

  // メッセージの送信処理 (ハイブリッド：Ollama / Gemini 分岐 + Web検索 RAG)
  const handleSendMessage = async (text, attachedImage, attachedFile) => {
    if (selectedModel.startsWith('google/') && !geminiApiKey) {
      setShowSettings(true);
      return;
    }

    let threadId = currentThreadId;
    let targetThread = currentThread;

    let defaultTitle = '新しい対話';
    if (text) {
      defaultTitle = text.substring(0, 16) + '...';
    } else if (attachedFile) {
      defaultTitle = `📄 ${attachedFile.name}`;
    } else if (attachedImage) {
      defaultTitle = '画像との対話';
    }

    if (!threadId) {
      const newThread = {
        id: Date.now(),
        title: defaultTitle,
        messages: []
      };
      setThreads(prev => [newThread, ...prev]);
      setCurrentThreadId(newThread.id);
      threadId = newThread.id;
      targetThread = newThread;
    }

    const userMsg = {
      role: 'user',
      content: attachedFile 
        ? `[添付ファイル: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\n${text}` 
        : text,
      image: attachedImage ? attachedImage.base64 : undefined
    };

    const updatedMessages = [...(targetThread ? targetThread.messages : []), userMsg];

    let newTitle = targetThread ? targetThread.title : defaultTitle;
    if ((!targetThread || targetThread.messages.length === 0) && (text || attachedFile)) {
      newTitle = defaultTitle;
    }

    setThreads(prev => prev.map(t => {
      if (t.id === threadId) {
        return { ...t, title: newTitle, messages: updatedMessages };
      }
      return t;
    }));

    setLoading(true);

    const assistantMsgIndex = updatedMessages.length;

    // アシスタントメッセージ(assistantMsgIndex)を更新する共通処理
    const setAssistantMessage = (patch) => {
      setThreads(prev => prev.map(t => {
        if (t.id !== threadId) return t;
        const msgs = [...t.messages];
        msgs[assistantMsgIndex] = { role: 'assistant', ...msgs[assistantMsgIndex], ...patch };
        return { ...t, messages: msgs };
      }));
    };

    // 検索が必要な場合は検索を実行
    let searchResults = [];

    if (webSearchEnabled && text) {
      setAssistantMessage({ content: `🔍 Yahoo!で「${text}」を検索中...` });
      try {
        searchResults = await window.electronAPI.webSearch(text);
      } catch (err) {
        console.error('Web search error:', err);
      }
      setAssistantMessage({
        content: searchResults.length > 0
          ? `🔍 Yahoo!検索から ${searchResults.length} 件の情報を取得しました。回答を生成中...`
          : `⚠️ ネット検索で情報が取得できませんでした (0件)。回答を生成中...`
      });
    } else {
      setAssistantMessage({ content: '' });
    }

    // 送信コンテキスト構築
    const contextMsgs = [];

    // 現在の日本のリアルタイム日付を取得して明示的に提示
    const now = new Date();
    const dateString = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    let systemInstruction = `現在の日時: ${dateString}\nユーザーは日本のタイムゾーンにいます。\n回答は必ず日本語で行ってください。回答に中国語や英語などの他言語を絶対に混ぜないでください。\n\n${settings.systemPrompt}`;

    if (searchResults && searchResults.length > 0) {
      const searchContext = searchResults.map((r, i) => `[ソース ${i+1}] ${r.title}\nURL: ${r.url}\n内容: ${r.snippet}`).join('\n\n');
      systemInstruction += `\n\n以下のWeb検索結果（最新情報）を参考に、ユーザーの質問に回答してください。回答の最後にソースリンク一覧を自分で出力する必要はありません（システムが自動でリンクカードを表示します）。\n\n【Web検索結果】\n${searchContext}`;
    }

    contextMsgs.push({ role: 'system', content: systemInstruction });

    const limitedHistory = updatedMessages.slice(-settings.historyLimit);
    const formattedHistory = limitedHistory.map(m => {
      const formatted = {
        role: m.role,
        content: m.role === 'assistant' ? stripThinking(m.content) : m.content
      };
      if (m.image) {
        formatted.images = [m.image];
      }
      return formatted;
    });

    contextMsgs.push(...formattedHistory);

    // ストリーミング中の画面更新は1フレーム(約16ms)に1回へ間引く。
    // 1トークンごとに再描画すると 80 tok/s 超のモデルでは描画が追いつかず全体が重くなる
    let assistantContent = '';
    let frameRequested = false;
    const flushToScreen = () => {
      frameRequested = false;
      setAssistantMessage({ content: assistantContent });
    };

    const isGemini = selectedModel.startsWith('google/');

    const callbacks = {
      onChunk: (chunk) => {
        assistantContent += chunk;
        if (!frameRequested) {
          frameRequested = true;
          requestAnimationFrame(flushToScreen);
        }
      },
      onEnd: () => {
        setLoading(false);
        activeCancelRef.current = null;
        // 出典ソースをメッセージに格納
        setAssistantMessage({
          content: assistantContent,
          sources: searchResults.length > 0 ? searchResults : undefined
        });
        if (!isGemini) refreshLoadedModels();
        if (stripThinking(assistantContent).length > 50) {
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.9 },
            colors: ['#6366f1', '#a855f7', '#3b82f6']
          });
        }
      },
      onError: (err) => {
        setLoading(false);
        activeCancelRef.current = null;
        const header = isGemini
          ? '⚠️ Gemini API 通信エラーが発生しました。\nネットワーク接続とAPIキーを確認してください。'
          : '⚠️ Ollama 通信エラーが発生しました。\nOllamaが正しく起動していることを確認してください。';
        setAssistantMessage({ content: `${header}\n【エラー内容】\n${err}` });
      }
    };

    const cancel = isGemini
      ? chatGeminiStream({
          apiKey: geminiApiKey,
          model: selectedModel,
          messages: contextMsgs,
          ...callbacks
        })
      : chatStream({
          model: selectedModel,
          messages: contextMsgs,
          options: {
            num_ctx: settings.num_ctx
          },
          ...callbacks
        });

    // 停止時は、そこまでに受信した内容を確定させる
    activeCancelRef.current = () => {
      cancel();
      setAssistantMessage({ content: assistantContent || '(生成を停止しました)' });
      if (!isGemini) refreshLoadedModels();
    };
  };

  const handleStopGeneration = () => {
    if (activeCancelRef.current) {
      activeCancelRef.current();
      activeCancelRef.current = null;
      setLoading(false);
    }
  };

  return (
    <div style={appLayoutStyle}>
      <Sidebar
        threads={threads}
        currentThreadId={currentThreadId}
        onSelectThread={setCurrentThreadId}
        onCreateThread={handleCreateThread}
        onDeleteThread={handleDeleteThread}
        onOpenSettings={() => setShowSettings(true)}
        onOpenModels={() => setShowModels(true)}
        currentModel={selectedModel}
        vramInfo={vramInfo}
      />

      <ChatArea
        messages={messages}
        onSendMessage={handleSendMessage}
        models={models}
        selectedModel={selectedModel}
        onSelectModel={setSelectedModel}
        loading={loading}
        onStopGeneration={handleStopGeneration}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={() => setWebSearchEnabled(!webSearchEnabled)}
      />

      {showSettings && (
        <SettingsModal
          settings={settings}
          setSettings={setSettings}
          geminiApiKey={geminiApiKey}
          onSaveApiKey={handleSaveApiKey}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showModels && (
        <ModelManager
          models={models}
          refreshModels={fetchModels}
          onClose={() => setShowModels(false)}
        />
      )}
    </div>
  );
}

const appLayoutStyle = {
  display: 'flex',
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  background: 'var(--bg-primary)',
};
