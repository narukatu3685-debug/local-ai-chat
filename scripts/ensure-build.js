// 起動前チェック: src などが dist より新しければ (コードが編集されていれば) 再ビルドする。
// 変更が無ければ何もしないので、通常の起動は数十ミリ秒で終わる。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const distIndex = path.join(root, 'dist', 'index.html');

const newestMtime = (p) => {
  const stat = fs.statSync(p);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return fs.readdirSync(p).reduce((max, name) => Math.max(max, newestMtime(path.join(p, name))), 0);
};

const sources = ['src', 'index.html', 'vite.config.js'].map((p) => path.join(root, p));
const needsBuild = !fs.existsSync(distIndex) ||
  Math.max(...sources.map(newestMtime)) > fs.statSync(distIndex).mtimeMs;

if (needsBuild) {
  console.log('Source changed. Building...');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
}
