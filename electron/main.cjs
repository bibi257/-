// Windows 版（Electron）のメインプロセス。Web 版と同じ web/index.html を表示する
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const INDEX = path.join(__dirname, '..', 'web', 'index.html');
const INDEX_URL = pathToFileURL(INDEX).href;

/** アプリ自身の呼び出し画面（index.html?view=call…）か。別ウィンドウで開く対象 */
function isCallWindowUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'file:' && u.pathname === new URL(INDEX_URL).pathname && u.searchParams.get('view') === 'call';
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 500,
    title: '部内大会トーナメント',
    backgroundColor: '#f4f6f9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // アプリ外のページへは移動させず、リンクは既定のブラウザで開く。
  // 呼び出し画面（?view=call）だけは、外のブラウザへ飛ばさず、アプリの別ウィンドウで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isCallWindowUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280, height: 720, minWidth: 480, minHeight: 320,
          title: '呼び出し画面', backgroundColor: '#f4f6f9', autoHideMenuBar: true,
        },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 開いた呼び出し画面のウィンドウからは、さらにウィンドウを開かせない
  win.webContents.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-navigate', (e, url) => { if (!isCallWindowUrl(url)) e.preventDefault(); });
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });
  win.loadFile(INDEX);
  return win;
}

function buildMenu() {
  const template = [
    { label: 'ファイル', submenu: [
      { label: '印刷…', accelerator: 'CmdOrCtrl+P', click: (_, w) => w?.webContents.print() },
      { type: 'separator' },
      { label: '終了', role: 'quit' },
    ] },
    { label: '編集', submenu: [
      { label: '元に戻す', role: 'undo' }, { label: 'やり直し', role: 'redo' }, { type: 'separator' },
      { label: '切り取り', role: 'cut' }, { label: 'コピー', role: 'copy' }, { label: '貼り付け', role: 'paste' },
      { label: 'すべて選択', role: 'selectAll' },
    ] },
    { label: '表示', submenu: [
      { label: '再読み込み', role: 'reload' },
      { label: '拡大', role: 'zoomIn' }, { label: '縮小', role: 'zoomOut' }, { label: '標準サイズ', role: 'resetZoom' },
      { type: 'separator' },
      { label: '全画面表示', role: 'togglefullscreen' },
      { label: '開発者ツール', role: 'toggleDevTools' },
    ] },
    { label: 'ヘルプ', submenu: [
      { label: 'バージョン情報', click: () => dialog.showMessageBox({
        type: 'info', title: 'バージョン情報',
        message: `部内大会トーナメント ${app.getVersion()}`,
        detail: 'データはこのPCに自動保存されます。別のPCへ移すときは「保存」でファイルに書き出してください。',
      }) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 二重起動すると自動保存データが競合するため、1つだけ起動する
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [w] = BrowserWindow.getAllWindows();
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
