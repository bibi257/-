// 表がまだ無い画面（トーナメント・総当たり・順位表）の案内。次にすることを1文で示し、移動先のボタンを付ける。

const NAMES = { tournament: 'トーナメント表', league: '総当たり表' };

/**
 * @param {'tournament'|'league'|'standings'} kind
 * @param {{players:object[]}} st
 * @param {{readOnly?:boolean}} [opts] 閲覧専用（共有の閲覧者・過去の大会）のときは、作る人が別にいるので、ボタンを付けない
 * @returns {{text:string, button:{label:string, goto:string}|null}}
 */
export function emptyGuide(kind, st, { readOnly = false } = {}) {
  const lead = kind === 'standings' ? '表を作成すると、ここに順位表が表示されます。' : `${NAMES[kind]}はまだ作成されていません。`;
  if (readOnly) {
    return { text: kind === 'standings' ? lead : `${lead}運営が作成するまでお待ちください。`, button: null };
  }
  if ((st?.players ?? []).length < 2) {
    return { text: `${lead}まず参加者を2人以上入力しましょう。`, button: { label: '参加者を入力する', goto: 'setup' } };
  }
  const next = kind === 'standings' ? '「参加者・設定」で、トーナメント表か総当たり表を作成しましょう。' : `「参加者・設定」で「${NAMES[kind]}を作成」を押してください。`;
  return { text: `${lead}${next}`, button: { label: '表を作成する', goto: 'setup' } };
}
