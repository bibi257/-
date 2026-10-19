// QRコードの SVG（画面表示と PNG 出力で共用）。色は読み取りやすさのため、白地に黒で固定する（ダークモードでも変えない）。

/**
 * @param {{size:number, modules:boolean[][]}} qr core/qr.js の encodeQr の結果
 * @param {{quiet?:number, cell?:number}} [opts] quiet: 周りの余白（モジュール数。仕様は4以上）、cell: 1モジュールの大きさ（PNG用の寸法）
 * @returns {{svg:string, width:number, height:number}}
 */
export function qrSvg(qr, { quiet = 4, cell = 10 } = {}) {
  const n = qr.size + quiet * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) { x++; continue; }
      let run = 1;
      while (x + run < qr.size && qr.modules[y][x + run]) run++;
      d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run;
    }
  }
  const px = n * cell;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
    + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  return { svg, width: px, height: px };
}
