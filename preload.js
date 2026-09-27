const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ollamaRequest: (args) => ipcRenderer.invoke('ollama-request', args),
  ollamaAbort: (streamId) => ipcRenderer.invoke('ollama-abort', streamId),
  webSearch: (query) => ipcRenderer.invoke('web-search', query),
  saveFile: (content, defaultName) => ipcRenderer.invoke('save-file', { content, defaultName }),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  onOllamaStream: (streamId, callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(`ollama-stream-${streamId}`, listener);
    return () => {
      ipcRenderer.removeListener(`ollama-stream-${streamId}`, listener);
    };
  }
});
