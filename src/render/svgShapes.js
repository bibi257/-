// PNG 出力用の SVG（bracketSvg・tableSvg が作る文字列）を、canvas に描く図形の一覧に読み取る。DOM に触らない（Node でテストできる）。
// 読めるのは rect・line・text だけ。未対応の要素や属性があれば、描き漏れて表が崩れないよう、エラーにする（PLAN D58）。

const ATTRS = {
  svg: ['xmlns', 'width', 'height', 'viewBox', 'font-family'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'stroke-width', 'data-pid'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'],
  text: ['x', 'y', 'font-size', 'font-weight', 'fill', 'text-anchor', 'dominant-baseline', 'class', 'data-pid'],
};

function unescapeXml(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

function readAttrs(tag, source) {
  const attrs = {};
  const re = /([\w:-]+)="([^"]*)"/g;
  let rest = source;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (!ATTRS[tag].includes(m[1])) throw new Error(`PNG 用の SVG に、未対応の属性があります: <${tag} ${m[1]}>`);
    attrs[m[1]] = unescapeXml(m[2]);
    rest = rest.replace(m[0], '');
  }
  if (rest.replace(/\/$/, '').trim()) throw new Error(`PNG 用の SVG の <${tag}> を読み取れません: ${rest.trim().slice(0, 40)}`);
  return attrs;
}

function num(attrs, key, fallback = 0) {
  const v = attrs[key] === undefined ? fallback : Number(attrs[key]);
  if (!Number.isFinite(v)) throw new Error(`PNG 用の SVG の ${key} が数値ではありません: ${attrs[key]}`);
  return v;
}

/**
 * @param {string} svg bracketSvg・tableSvg の svg（interactive でないもの）
 * @returns {{width:number,height:number,fontFamily:string,shapes:object[]}}
 *   shapes は描く順。{type:'rect'|'line'|'text', ...}。背景（width="100%" の rect）は含めない
 */
export function parseExportSvg(svg) {
  const shapes = [];
  let root = null;
  let pos = 0;
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    const [, closing, tag, source, selfClosing] = m;
    if (svg.slice(pos, m.index).trim()) throw new Error('PNG 用の SVG に、要素の外の文字があります');
    pos = re.lastIndex;
    if (closing) {
      if (tag !== 'svg' && tag !== 'text') throw new Error(`PNG 用の SVG に、未対応の要素があります: </${tag}>`);
      continue;
    }
    if (!ATTRS[tag]) throw new Error(`PNG 用の SVG に、未対応の要素があります: <${tag}>`);
    const attrs = readAttrs(tag, `${source}${selfClosing}`);
    if (tag === 'svg') {
      root = attrs;
    } else if (tag === 'rect') {
      if (attrs.width === '100%') continue;
      shapes.push({ type: 'rect', x: num(attrs, 'x'), y: num(attrs, 'y'), width: num(attrs, 'width'), height: num(attrs, 'height'), rx: num(attrs, 'rx'), fill: attrs.fill || '', stroke: attrs.stroke || '', strokeWidth: num(attrs, 'stroke-width', 1) });
    } else if (tag === 'line') {
      shapes.push({ type: 'line', x1: num(attrs, 'x1'), y1: num(attrs, 'y1'), x2: num(attrs, 'x2'), y2: num(attrs, 'y2'), stroke: attrs.stroke || '#000', strokeWidth: num(attrs, 'stroke-width', 1) });
    } else {
      const end = svg.indexOf('</text>', pos);
      if (end < 0 || selfClosing) throw new Error('PNG 用の SVG の <text> が閉じていません');
      if (attrs['dominant-baseline'] && attrs['dominant-baseline'] !== 'central') throw new Error(`PNG 用の SVG に、未対応の dominant-baseline があります: ${attrs['dominant-baseline']}`);
      const inner = svg.slice(pos, end);
      if (inner.includes('<')) throw new Error(`PNG 用の SVG に、未対応の要素があります: <${/<([\w:-]+)/.exec(inner)[1]}>（<text> の中）`);
      shapes.push({
        type: 'text', x: num(attrs, 'x'), y: num(attrs, 'y'), size: num(attrs, 'font-size', 14),
        bold: attrs['font-weight'] === 'bold', fill: attrs.fill || '#000', anchor: attrs['text-anchor'] || 'start',
        text: unescapeXml(inner),
      });
      pos = end;
      re.lastIndex = end;
    }
  }
  if (!root) throw new Error('PNG 用の SVG に、<svg> がありません');
  return { width: num(root, 'width'), height: num(root, 'height'), fontFamily: root['font-family'] || '', shapes };
}
