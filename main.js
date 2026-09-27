const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

let mainWindow;

// 通信先を許可リストで制限 (SSRF対策)。Ollamaのローカルエンドポイントと
// Gemini APIの公式エンドポイントのみ通信を許可する。
const ALLOWED_EXTERNAL_HOSTS = new Set(['generativelanguage.googleapis.com']);

function isAllowedDestination(isExternal, urlObj) {
  if (!isExternal) return true; // ローカル Ollama (127.0.0.1:11434) 宛は許可
  return urlObj.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(urlObj.hostname);
}

// APIキーの暗号化保存 (Electron safeStorage = Windows DPAPI 等の OS 資格情報store を利用)
const API_KEY_FILE = () => path.join(app.getPath('userData'), 'gemini-key.enc');

function loadApiKey() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    const filePath = API_KEY_FILE();
    if (!fs.existsSync(filePath)) return '';
    const encrypted = fs.readFileSync(filePath);
    return safeStorage.decryptString(encrypted);
  } catch (e) {
    console.error('Failed to load API key:', e);
    return '';
  }
}

function saveApiKey(key) {
  try {
    const filePath = API_KEY_FILE();
    if (!key) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return true;
    }
    if (!safeStorage.isEncryptionAvailable()) return false;
    const encrypted = safeStorage.encryptString(key);
    fs.writeFileSync(filePath, encrypted);
    return true;
  } catch (e) {
    console.error('Failed to save API key:', e);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1250,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    frame: true, // 標準のフレームを使用 (閉じる、最小化、最大化ボタンを維持)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0a0a0f',
    show: false
  });

  // メニューバーを非表示にする
  mainWindow.setMenuBarVisibility(false);

  // リンク (Web検索ソース等) はアプリ内ウィンドウではなく既定のブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 通常はビルド済み dist を読み込む (起動が速い)。開発時のみ ELECTRON_DEV=1 で Vite に接続
  const isDev = process.env.ELECTRON_DEV === '1';
  if (isDev) {
    const loadWithRetry = () => {
      mainWindow.loadURL('http://localhost:5173').catch((err) => {
        console.log('Vite server not ready yet, retrying in 1s...');
        setTimeout(loadWithRetry, 1000);
      });
    };
    loadWithRetry();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 進行中のストリーミング要求 (streamId → http.ClientRequest)。生成停止時に接続を切ると
// Ollama 側も推論を中断するため、GPU が無駄に回り続けない
const activeStreams = new Map();

// Ollama & Gemini API プロキシ処理 (CORS対策 & ストリーミング中継)
ipcMain.handle('ollama-request', async (event, { endpoint, method, body, streamId, apiKey }) => {
  return new Promise((resolve, reject) => {
    const isExternal = endpoint.startsWith('http://') || endpoint.startsWith('https://');
    const urlObj = isExternal ? new URL(endpoint) : null;
    const isHttps = isExternal && urlObj.protocol === 'https:';

    if (!isAllowedDestination(isExternal, urlObj)) {
      reject(new Error(`許可されていない通信先です: ${isExternal ? urlObj.hostname : endpoint}`));
      return;
    }

    const postData = body ? JSON.stringify(body) : '';
    const options = {
      hostname: isExternal ? urlObj.hostname : '127.0.0.1',
      port: isExternal ? (urlObj.port || (isHttps ? 443 : 80)) : 11434,
      path: isExternal ? (urlObj.pathname + urlObj.search) : endpoint,
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    // APIキーはURLに載せずヘッダーで送る (ログやエラーメッセージへの漏えい防止)
    if (apiKey && isExternal) {
      options.headers['x-goog-api-key'] = apiKey;
    }

    const send = (payload) => {
      if (mainWindow) mainWindow.webContents.send(`ollama-stream-${streamId}`, payload);
    };

    const httpModule = isHttps ? https : http;
    const req = httpModule.request(options, (res) => {
      res.setEncoding('utf8');

      if (streamId) {
        // HTTPエラー (モデル未導入、APIキー不正など) は本文をまとめてエラーとして通知
        if (res.statusCode >= 400) {
          let errBody = '';
          res.on('data', (chunk) => { errBody += chunk; });
          res.on('end', () => {
            activeStreams.delete(streamId);
            let msg = `HTTP ${res.statusCode}`;
            try {
              const j = JSON.parse(errBody);
              msg += `: ${j.error?.message || j.error || errBody}`;
            } catch (_) {
              if (errBody) msg += `: ${errBody.slice(0, 300)}`;
            }
            send({ type: 'error', error: msg });
            resolve({ success: false });
          });
          return;
        }

        // ストリーミング中継
        res.on('data', (chunk) => send({ type: 'data', chunk }));

        res.on('end', () => {
          activeStreams.delete(streamId);
          send({ type: 'end' });
          resolve({ success: true, streaming: true });
        });

        res.on('error', (err) => {
          activeStreams.delete(streamId);
          if (req.aborted_by_user) return resolve({ success: true, aborted: true });
          send({ type: 'error', error: err.message });
          reject(err);
        });
      } else {
        // 通常の単発応答
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            const json = responseData ? JSON.parse(responseData) : {};
            resolve(json);
          } catch (e) {
            resolve(responseData);
          }
        });
      }
    });

    req.on('error', (e) => {
      if (streamId) activeStreams.delete(streamId);
      if (req.aborted_by_user) return resolve({ success: true, aborted: true });
      console.error(`Request proxy error: ${e.message}`);
      reject(e);
    });

    if (streamId) activeStreams.set(streamId, req);

    if (body) {
      req.write(postData);
    }
    req.end();
  });
});

// 生成停止: 接続を切断して Ollama / Gemini 側の生成も止める
ipcMain.handle('ollama-abort', async (event, streamId) => {
  const req = activeStreams.get(streamId);
  if (!req) return { success: false };
  req.aborted_by_user = true;
  req.destroy();
  activeStreams.delete(streamId);
  return { success: true };
});

// キー不要の Yahoo! Japan 検索を使用した Web 検索プロキシ (頑強なスプリットパース)
ipcMain.handle('web-search', async (event, query) => {
  return new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const options = {
      hostname: 'search.yahoo.co.jp',
      port: 443,
      path: `/search?p=${encodedQuery}`,
      method: 'GET',
      timeout: 10000, // 応答が無い場合に回答生成が止まったままにならないよう打ち切る
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const results = [];
        
        // 検索カードブロックでHTMLを分割し、個別に抽出する超頑丈なアプローチ
        const blocks = data.split('class="sw-CardBase');
        
        for (let i = 1; i < blocks.length; i++) {
          const block = blocks[i];
          
          // リンクURLの抽出 (通常のリンク)
          const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/);
          
          // タイトル <h3> か <span> など
          const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || block.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//);
          
          // スニペット (概要)
          const snippetMatch = block.match(/class="[^"]*(?:summary|description)[^"]*"[^>]*>([\s\S]*?)<\/p>/) || block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
          
          if (urlMatch && titleMatch) {
            const url = urlMatch[1];
            // 内部広告リンクや画像ドメイン等を除外
            if (!url.includes('search.yahoo.co.jp') && !url.includes('r.search.yahoo.com') && !url.includes('yimg.jp')) {
              const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
              const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '概要なし';
              
              // 重複を排除し、4件に絞る
              if (!results.some(r => r.url === url)) {
                results.push({ url, title, snippet });
              }
            }
          }
        }
        
        resolve(results.slice(0, 4));
      });
    });

    req.on('timeout', () => req.destroy(new Error('Web search timeout')));
    req.on('error', (err) => {
      console.error('Web search failed:', err);
      resolve([]);
    });

    req.end();
  });
});

// Gemini API キーの暗号化保存・取得 (safeStorage で OS 資格情報ストアに保管。レンダラー側の
// localStorage やソースコードには平文で置かない)
ipcMain.handle('get-api-key', async () => {
  return loadApiKey();
});

ipcMain.handle('set-api-key', async (event, key) => {
  return { success: saveApiKey(key) };
});

// ファイルをローカル保存するための IPC ハンドラー
ipcMain.handle('save-file', async (event, { content, defaultName }) => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  
  const { canceled, filePath } = await dialog.showSaveDialog(focusedWindow, {
    title: 'ファイルを保存',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || !filePath) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('File save error:', err);
    return { success: false, error: err.message };
  }
});
