// 選択肢から1つ選ぶ確認ダイアログ（confirm では「どちらを選ぶか」が伝わらないとき用）

import { h } from './io.js';

/**
 * @param {{title:string, body?:string, options:{value:string,label:string,hint?:string}[], okLabel?:string}} cfg
 * @returns {Promise<string|null>} 選んだ値。キャンセル（Esc・外側・「キャンセル」）なら null
 */
export function askChoice({ title, body = '', options, okLabel = '決定' }) {
  const dlg = document.getElementById('choice-dialog');
  document.getElementById('ch-title').textContent = title;
  document.getElementById('ch-body').textContent = body;
  document.getElementById('ch-body').hidden = !body;
  document.getElementById('ch-ok').textContent = okLabel;
  document.getElementById('ch-options').innerHTML = options.map((o, i) => `
    <label class="ch-option"><input type="radio" name="ch-choice" value="${h(o.value)}" ${i === 0 ? 'checked' : ''}>
      <span><b>${h(o.label)}</b>${o.hint ? `<small>${h(o.hint)}</small>` : ''}</span></label>`).join('');
  return new Promise((resolve) => {
    const form = document.getElementById('choice-form');
    const done = (value) => {
      form.removeEventListener('submit', onSubmit);
      document.getElementById('ch-cancel').removeEventListener('click', onCancel);
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      done(form.querySelector('input[name="ch-choice"]:checked')?.value ?? null);
    };
    const onCancel = () => done(null);
    const onClose = () => done(null); // Esc
    form.addEventListener('submit', onSubmit);
    document.getElementById('ch-cancel').addEventListener('click', onCancel);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    form.querySelector('input[name="ch-choice"]')?.focus();
  });
}
