import { test, expect } from '@playwright/test';
import { open, importNames, enterScore, acceptDialogs, genTournament } from './helpers.js';

const EIGHT = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎', '田中 三郎', '伊藤 四郎', '渡辺 五郎', '中村 六子'];
const FOUR = ['山田 太郎', '佐藤 花子', '鈴木 一郎', '高橋 次郎'];
const KEY = 'bukatsu-taikai:state';

const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const box = (page, i) => page.locator('#panel-setup input.attend-box').nth(i);
const count = (page) => page.locator('#attend-count');

async function setup(page, names = EIGHT) {
  await open(page);
  await importNames(page, names);
}
const choice = (page) => page.locator('#choice-dialog');

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`当日の出欠確認（幅${w}px）`, () => {
    test.use({ viewport: { width: w, height: h } });

    test('名簿に「出席」のチェックが付き（初期値は全員出席）、人数と「全員出席にする」が出る。再読み込みしても残る', async ({ page }) => {
      await setup(page);
      await expect(page.locator('#panel-setup input.attend-box')).toHaveCount(8);
      await expect(page.locator('#panel-setup input.attend-box:checked')).toHaveCount(8);
      await expect(count(page)).toHaveText('出席 8 / 8人');
      await expect(page.locator('[data-act=all-present]')).toBeDisabled();
      await box(page, 2).uncheck();
      await expect(count(page)).toHaveText('出席 7 / 8人');
      await expect(page.locator('#panel-setup tr.absent')).toHaveCount(1);
      await expect(page.locator('#panel-setup tr.absent input.name')).toHaveValue('鈴木 一郎');
      await expect(page.locator('[data-act=all-present]')).toBeEnabled();
      await expect.poll(async () => (await saved(page)).players.filter((p) => p.absent).map((p) => p.name)).toEqual(['鈴木 一郎']);
      await page.reload();
      await expect(count(page)).toHaveText('出席 7 / 8人');
      await expect(box(page, 2)).not.toBeChecked();
      await page.click('[data-act=all-present]');
      await expect(count(page)).toHaveText('出席 8 / 8人');
      await expect(page.locator('#panel-setup tr.absent')).toHaveCount(0);
      await expect(page.locator('[data-act=all-present]')).toBeDisabled();
      await expect.poll(async () => (await saved(page)).players.some((p) => 'absent' in p)).toBe(false);
    });

    test('押せる大きさ: 出席のチェックの行は高さ44px以上（スマホ幅）', async ({ page }) => {
      await setup(page);
      const sizes = await page.locator('#panel-setup .attend-pick').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(sizes.length).toBe(8);
      if (w <= 700) for (const s of sizes) expect(s).toBeGreaterThanOrEqual(44);
      // 「出席」の列が増えても、名簿の表が横にはみ出さない（並べ替え・削除のボタンが画面内にある）
      const over = await page.locator('#panel-setup #setup-players .table-wrap').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });

    test('欠席者がいなければ、作成時に何も聞かない', async ({ page }) => {
      await setup(page);
      await genTournament(page);
      await expect(choice(page)).not.toBeVisible();
      await expect(page.locator('#panel-tournament .card').first()).toBeVisible();
      expect((await saved(page)).tournament.playerIds).toHaveLength(8);
    });

    test('作成時の確認: キャンセルなら表を作らない。「欠席の人を除いて作る」と、欠席の人は表に入らない', async ({ page }) => {
      await setup(page);
      await box(page, 0).uncheck();
      await box(page, 7).uncheck();
      await page.click('[data-act=gen-tournament]');
      await expect(choice(page)).toBeVisible();
      await expect(choice(page).locator('input[name=ch-choice]')).toHaveCount(2);
      await expect(choice(page).locator('#ch-body')).toContainText('欠席の人が2人');
      await choice(page).locator('#ch-cancel').click();
      await expect(choice(page)).not.toBeVisible();
      expect((await saved(page)).tournament).toBeNull();

      await page.click('[data-act=gen-tournament]');
      await expect(choice(page).locator('input[value=exclude]')).toBeChecked(); // 初期値は「除いて作る」
      await choice(page).locator('#ch-ok').click();
      await page.click('#pr-ok'); // 組み合わせの確認
      await expect(page.locator('#toast')).toContainText('欠席の2人を除きました');
      const st = await saved(page);
      expect(st.tournament.playerIds).toHaveLength(6);
      const absentIds = st.players.filter((p) => p.absent).map((p) => p.id);
      expect(st.tournament.playerIds.some((id) => absentIds.includes(id))).toBe(false);
      expect(Object.keys(st.tournament.results)).toHaveLength(0);
    });

    test('作成時の確認: 「欠席の人を入れたまま…不戦にする」と、欠席の人の試合が相手の不戦勝になる', async ({ page }) => {
      await setup(page);
      await box(page, 0).uncheck();
      await page.click('[data-act=gen-tournament]');
      await choice(page).locator('input[value=walkover]').check();
      await choice(page).locator('#ch-ok').click();
      await page.click('#pr-ok'); // 組み合わせの確認
      await expect(page.locator('#toast')).toContainText('不戦にしました');
      const st = await saved(page);
      expect(st.tournament.playerIds).toHaveLength(8);
      const absentId = st.players.find((p) => p.absent).id;
      const results = Object.values(st.tournament.results);
      expect(results).toHaveLength(1);
      expect(results[0].walkover).toBe(true);
      expect([results[0].p1, results[0].p2]).toContain(absentId);
      expect(results[0].winnerId).not.toBe(absentId);
      // 表の画面に、不戦勝として出る
      await expect(page.locator('#panel-tournament')).toContainText('不戦勝');
    });

    test('総当たりも同じ: 除く／不戦。不戦にすると、欠席の人の全試合が相手の不戦勝', async ({ page }) => {
      await setup(page, FOUR);
      await box(page, 1).uncheck();
      await page.click('[data-act=gen-league]');
      await choice(page).locator('#ch-ok').click(); // 除く
      let st = await saved(page);
      expect(st.league.playerIds).toHaveLength(3);
      expect(st.league.matches).toHaveLength(3);
      await page.click('[data-tab=setup]');
      await page.click('[data-act=gen-league]');
      await choice(page).locator('input[value=walkover]').check();
      acceptDialogs(page);
      await choice(page).locator('#ch-ok').click();
      await expect.poll(async () => (await saved(page)).league.playerIds.length).toBe(4);
      st = await saved(page);
      const absentId = st.players.find((p) => p.absent).id;
      const mine = st.league.matches.filter((m) => m.p1 === absentId || m.p2 === absentId);
      expect(mine).toHaveLength(3);
      for (const m of mine) {
        expect(st.league.results[m.id].walkover).toBe(true);
        expect(st.league.results[m.id].outcome).toBe(m.p1 === absentId ? 'p2' : 'p1');
      }
      expect(Object.keys(st.league.results)).toHaveLength(3);
    });

    test('出席が2人未満なら、作れない', async ({ page }) => {
      await setup(page, FOUR);
      await box(page, 0).uncheck();
      await box(page, 1).uncheck();
      await box(page, 2).uncheck();
      await page.click('[data-act=gen-tournament]');
      await choice(page).locator('#ch-ok').click();
      await expect(page.locator('#toast')).toContainText('出席の人が2人以上必要です');
      expect((await saved(page)).tournament).toBeNull();
    });

    test('作成後に欠席にする: 出る試合があれば聞く。「不戦にする」で相手の不戦勝になる', async ({ page }) => {
      await setup(page);
      await genTournament(page);
      await page.click('[data-tab=setup]');
      await box(page, 0).uncheck();
      await expect(choice(page)).toBeVisible();
      await expect(choice(page).locator('#ch-body')).toContainText('未実施の試合が1件');
      await choice(page).locator('input[value=walkover]').check();
      await choice(page).locator('#ch-ok').click();
      await expect(page.locator('#toast')).toContainText('「山田 太郎」の試合1件を不戦にしました');
      const st = await saved(page);
      const r = Object.values(st.tournament.results);
      expect(r).toHaveLength(1);
      expect(r[0].walkover).toBe(true);
      expect(r[0].winnerId).not.toBe(st.players[0].id);
      await expect(box(page, 0)).not.toBeChecked();
    });

    test('作成後に欠席にする: キャンセルならチェックを元に戻す。「記録だけ残す」なら試合は変えない', async ({ page }) => {
      await setup(page);
      await genTournament(page);
      await page.click('[data-tab=setup]');
      await box(page, 0).uncheck();
      await choice(page).locator('#ch-cancel').click();
      await expect(box(page, 0)).toBeChecked();
      await expect(count(page)).toHaveText('出席 8 / 8人');
      expect((await saved(page)).players.some((p) => p.absent)).toBe(false);
      await box(page, 0).uncheck();
      await choice(page).locator('input[value=record]').check();
      await choice(page).locator('#ch-ok').click();
      await expect(box(page, 0)).not.toBeChecked();
      const st = await saved(page);
      expect(st.players[0].absent).toBe(true);
      expect(Object.keys(st.tournament.results)).toHaveLength(0);
      expect(st.tournament.walkoverIds).toBeUndefined();
    });

    test('表にいない選手・もう出る試合がない選手を欠席にしても、何も聞かない', async ({ page }) => {
      await setup(page);
      await box(page, 3).uncheck(); // 表がまだ無い
      await expect(choice(page)).not.toBeVisible();
      await expect(count(page)).toHaveText('出席 7 / 8人');
    });

    test('不戦にすると決めた選手が、結果が入って次の試合が決まったとき、続けて不戦になる（欠席者どうしの1回戦）', async ({ page }) => {
      await setup(page, FOUR);
      await box(page, 0).uncheck(); // 1回戦は 1-4 / 2-3
      await box(page, 3).uncheck();
      await page.click('[data-act=gen-tournament]');
      await choice(page).locator('input[value=walkover]').check();
      await choice(page).locator('#ch-ok').click();
      await page.click('#pr-ok'); // 組み合わせの確認
      let st = await saved(page);
      expect(Object.keys(st.tournament.results)).toHaveLength(1); // 欠席どうしの1回戦だけ
      // 残りの1回戦（佐藤-鈴木）を入力すると、勝者と欠席の山田の決勝が、続けて不戦になる
      await page.locator('#panel-tournament .ni-card button.next-item').first().click();
      await enterScore(page, 2, 1);
      await expect(page.locator('#toast')).toContainText('欠席の人の試合1件を不戦にしました');
      st = await saved(page);
      expect(Object.keys(st.tournament.results)).toHaveLength(3);
      const final = st.tournament.results['R2-M1'];
      expect(final.walkover).toBe(true);
      expect(final.winnerId).toBe(st.players[1].id); // 佐藤（2-1で勝ち）
    });

    test('「全員出席にする」で、不戦にする対象も外れる（すでに入った不戦の結果は残る）', async ({ page }) => {
      await setup(page, FOUR);
      await box(page, 0).uncheck();
      await page.click('[data-act=gen-tournament]');
      await choice(page).locator('input[value=walkover]').check();
      await choice(page).locator('#ch-ok').click();
      await page.click('#pr-ok'); // 組み合わせの確認
      await page.click('[data-tab=setup]');
      await page.click('[data-act=all-present]');
      let st = await saved(page);
      expect(st.tournament.walkoverIds).toBeUndefined();
      expect(st.players.some((p) => p.absent)).toBe(false);
      // 不戦にする対象から外れたので、あとで別の人を欠席にしても、山田（出席に戻した）の試合は不戦にならない
      await box(page, 1).uncheck(); // 佐藤: 1回戦（佐藤-鈴木）が決まっている
      await choice(page).locator('input[value=record]').check();
      await choice(page).locator('#ch-ok').click();
      st = await saved(page);
      expect(st.players[1].absent).toBe(true);
      expect(st.tournament.walkoverIds).toBeUndefined();
      expect(Object.keys(st.tournament.results)).toHaveLength(1); // 作成時の山田の不戦だけ
    });
  });
}
