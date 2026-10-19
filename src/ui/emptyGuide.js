// 表がまだ無い画面の案内（.empty-state）。文言・ボタンは core/guide.js が決める。

import { h } from './io.js';
import { emptyGuide } from '../core/guide.js';
import { isReadOnly } from './store.js';

export function emptyGuideHtml(kind, st) {
  const g = emptyGuide(kind, st, { readOnly: isReadOnly() });
  return `<div class="card empty-state"><p>${h(g.text)}</p>${g.button ? `\n      <button type="button" class="primary" data-goto="${h(g.button.goto)}">${h(g.button.label)}</button>` : ''}</div>`;
}
