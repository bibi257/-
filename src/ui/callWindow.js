// 呼び出し画面だけの別ウィンドウ（?view=call）。PC 1台にプロジェクターをつなぎ、映しながら手元で入力するため。
// 読み取り専用のページで、自動保存も共有の送信もしない。運営の画面の保存を受け取ると、自動保存から読み直して描き直す。

import { parseCallView, callViewKind } from '../core/callView.js';
import { getState, setReadOnly, reloadLocal, initState, onChange } from './store.js';
import { renderCallScreen, setCallKind, setupCallScreen } from './callScreen.js';
import { listenCallUpdate } from './callChannel.js';
import { setupElapsedTimer } from './startMatch.js';
import { eventTitle } from '../core/edition.js';

/** 呼び出し画面のウィンドウか（?view=call）。そうなら { kind } */
export const callViewParams = () => parseCallView(location.search);

export function startCallWindow(params) {
  initState();
  setReadOnly(true); // 操作で内容を変えず、自動保存を上書きしない
  document.documentElement.classList.add('call-window');
  setupCallScreen();
  setCallKind(callViewKind(params.kind, getState()), { standalone: true });
  const draw = () => {
    document.title = `呼び出し画面 - ${eventTitle(getState())}`;
    renderCallScreen();
  };
  onChange(draw);
  setupElapsedTimer();
  listenCallUpdate(() => reloadLocal()); // 自動保存から読み直し、描き直す（reloadLocal が onChange を呼ぶ）
  draw();
}
