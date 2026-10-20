// 呼び出し画面を別ウィンドウで開くときの URL（?view=call&kind=…）。DOM に依存しない

export const CALL_VIEW = 'call';

/**
 * 開いたページの検索部分（location.search）から、呼び出し画面だけのウィンドウかどうかを読む。
 * @returns {{kind:'tournament'|'league'|null}|null} 呼び出し画面のウィンドウでなければ null。kind が無い・不正なときは null（大会データから決める）
 */
export function parseCallView(search) {
  const p = new URLSearchParams(search || '');
  if (p.get('view') !== CALL_VIEW) return null;
  const kind = p.get('kind');
  return { kind: kind === 'tournament' || kind === 'league' ? kind : null };
}

/** 別ウィンドウで開く URL。今のページと同じページに ?view=call&kind=… を付ける（#以降は付けない） */
export function callViewUrl(href, kind) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('view', CALL_VIEW);
  if (kind === 'tournament' || kind === 'league') url.searchParams.set('kind', kind);
  return url.href;
}

/** 呼び出し画面に出す種類。URL で指定が無ければ、トーナメントがあればトーナメント、なければ総当たり */
export function callViewKind(kind, st) {
  if (kind) return kind;
  return st.tournament ? 'tournament' : 'league';
}
