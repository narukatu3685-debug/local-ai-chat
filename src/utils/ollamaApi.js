// Ollama API と Electron IPC 通信の仲介ラッパー、および Google Gemini API 連携

// クラウドモデル一覧 (2026年9月時点の Gemini API 公式モデルID: ai.google.dev/gemini-api/docs/models)
export const GEMINI_MODELS = [
  { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash (最新・最も賢いFlash)' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (高度な推論・分析)' },
  { id: 'google/gemini-3.7-flash', label: 'Gemini 3.7 Flash (前世代・コーディング向け)' },
  { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (最速・低コスト)' }
];
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0].id;

// ネットワークのチャンク境界は行の途中に来ることがあるため、改行までバッファして
// 完成した行だけを渡す (途中で切れたJSON行を捨てて出力が欠ける問題の対策)
const createLineReader = (onLine) => {
  let buffer = '';
  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.trim()) onLine(line.trim());
      }
    },
    flush() {
      if (buffer.trim()) onLine(buffer.trim());
      buffer = '';
    }
  };
};

// 終了系コールバック (onEnd / onError) を合わせて一度だけ呼ぶ。エラーはIPCイベントと
// Promise reject の両方から届き得るため、二重にエラー表示されるのを防ぐ
const once = (onEnd, onError) => {
  let done = false;
  return {
    end: () => { if (!done) { done = true; onEnd(); } },
    error: (e) => { if (!done) { done = true; onError(e); } },
    get done() { return done; }
  };
};

export const listModels = async () => {
  try {
    const res = await window.electronAPI.ollamaRequest({
      endpoint: '/api/tags',
      method: 'GET'
    });
    return res.models || [];
  } catch (error) {
    console.error('Failed to list models:', error);
    throw error;
  }
};

// VRAMに読み込み済みのモデル一覧 (size_vram で実使用量が分かる)
export const listLoadedModels = async () => {
  try {
    const res = await window.electronAPI.ollamaRequest({
      endpoint: '/api/ps',
      method: 'GET'
    });
    return res.models || [];
  } catch (error) {
    return [];
  }
};

export const deleteModel = async (modelName) => {
  try {
    const res = await window.electronAPI.ollamaRequest({
      endpoint: '/api/delete',
      method: 'DELETE',
      body: { name: modelName }
    });
    return res;
  } catch (error) {
    console.error('Failed to delete model:', error);
    throw error;
  }
};

export const pullModel = (modelName, onProgress, onEnd, onError) => {
  const streamId = `pull-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const reader = createLineReader((line) => {
    try {
      const json = JSON.parse(line);
      if (json.status === 'downloading' && json.total) {
        const percent = Math.round((json.completed / json.total) * 100);
        onProgress(percent, json.status);
      } else if (json.status) {
        onProgress(null, json.status);
      }
    } catch (e) {
      // ignore parsing error
    }
  });

  const removeListener = window.electronAPI.onOllamaStream(streamId, (eventData) => {
    if (eventData.type === 'data') {
      reader.push(eventData.chunk);
    } else if (eventData.type === 'end') {
      reader.flush();
      removeListener();
      onEnd();
    } else if (eventData.type === 'error') {
      removeListener();
      onError(eventData.error);
    }
  });

  window.electronAPI.ollamaRequest({
    endpoint: '/api/pull',
    method: 'POST',
    body: { name: modelName },
    streamId: streamId
  }).catch((err) => {
    removeListener();
    onError(err.message);
  });

  return () => {
    removeListener();
  };
};

export const chatStream = ({ model, messages, options, onChunk, onEnd, onError }) => {
  const streamId = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  // 新しいOllamaは思考を message.thinking で別送するため、UI既存の <think> 表示に合わせて包む
  let inThinking = false;
  const finish = once(onEnd, onError);

  const reader = createLineReader((line) => {
    if (finish.done) return;
    try {
      const json = JSON.parse(line);
      if (json.error) {
        finish.error(json.error);
        return;
      }
      if (json.message && json.message.thinking) {
        if (!inThinking) {
          inThinking = true;
          onChunk('<think>');
        }
        onChunk(json.message.thinking);
      }
      if (json.message && json.message.content) {
        if (inThinking) {
          inThinking = false;
          onChunk('</think>\n\n');
        }
        onChunk(json.message.content);
      }
    } catch (e) {
      // ignore parsing error
    }
  });

  const removeListener = window.electronAPI.onOllamaStream(streamId, (eventData) => {
    if (eventData.type === 'data') {
      reader.push(eventData.chunk);
    } else if (eventData.type === 'end') {
      reader.flush();
      if (inThinking && !finish.done) onChunk('</think>');
      removeListener();
      finish.end();
    } else if (eventData.type === 'error') {
      removeListener();
      finish.error(eventData.error);
    }
  });

  window.electronAPI.ollamaRequest({
    endpoint: '/api/chat',
    method: 'POST',
    body: {
      model: model,
      messages: messages,
      stream: true,
      options: options,
      keep_alive: '30m' // 既定の5分だとすぐVRAMから外れ、次の質問で再読み込み(約5秒)が発生する
    },
    streamId: streamId
  }).catch((err) => {
    removeListener();
    finish.error(err.message);
  });

  return () => {
    removeListener();
    window.electronAPI.ollamaAbort(streamId);
  };
};

// Google Gemini API ストリーミング対話
export const chatGeminiStream = ({ apiKey, model = DEFAULT_GEMINI_MODEL, messages, onChunk, onEnd, onError }) => {
  const streamId = `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Gemini のメッセージ形式へマッピング
  const geminiMessages = messages.filter(m => m.role !== 'system').map(m => {
    const role = m.role === 'user' ? 'user' : 'model';
    const parts = [{ text: m.content || '' }];
    
    if (m.images && m.images.length > 0) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: m.images[0]
        }
      });
    }
    
    return { role, parts };
  });

  const systemMsg = messages.find(m => m.role === 'system');
  const systemInstruction = systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined;
  const finish = once(onEnd, onError);

  // alt=sse 指定により 1行 = "data: {JSON}" の Server-Sent Events 形式で届く
  const reader = createLineReader((line) => {
    if (!line.startsWith('data:')) return;
    try {
      const json = JSON.parse(line.substring(5).trim());
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
      if (text) {
        onChunk(text);
      }
    } catch (e) {
      // ignore chunk parse errors
    }
  });

  const removeListener = window.electronAPI.onOllamaStream(streamId, (eventData) => {
    if (eventData.type === 'data') {
      reader.push(eventData.chunk);
    } else if (eventData.type === 'end') {
      reader.flush();
      removeListener();
      finish.end();
    } else if (eventData.type === 'error') {
      removeListener();
      finish.error(eventData.error);
    }
  });

  // streamGenerateContent API エンドポイント (モデル名を動的に抽出)
  const targetModel = model.replace(/^google\//, '');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?alt=sse`;

  window.electronAPI.ollamaRequest({
    endpoint: url,
    method: 'POST',
    apiKey, // メインプロセスで x-goog-api-key ヘッダーとして付与
    body: {
      contents: geminiMessages,
      systemInstruction: systemInstruction
    },
    streamId: streamId
  }).catch((err) => {
    removeListener();
    finish.error(err.message);
  });

  return () => {
    removeListener();
    window.electronAPI.ollamaAbort(streamId);
  };
};
