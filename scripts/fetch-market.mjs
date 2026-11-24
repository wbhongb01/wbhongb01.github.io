// 코스피·나스닥 지수를 받아 market.json으로 저장합니다. (외부 패키지 없음, Node 18 이상)
// GitHub Actions에서 장중 10분마다 실행되고, 결과 파일은 대시보드와 함께 배포됩니다.
// 사용법: node scripts/fetch-market.mjs [출력 경로]
//   PREV_URL 환경변수: 지금 배포된 market.json 주소. 이번에 못 받아온 지수는 이전 값을 유지합니다.
import { writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'market.json';

// 지수를 더 넣고 싶으면 여기에 추가하세요. (예: 코스닥 ^KQ11, S&P 500 ^GSPC)
const INDICES = [
  {
    id: 'kospi',
    name: '코스피',
    yahoo: '^KS11',
    naver: 'https://m.stock.naver.com/api/index/KOSPI/basic',
    link: 'https://m.stock.naver.com/domestic/index/KOSPI/total',
  },
  {
    id: 'nasdaq',
    name: '나스닥',
    yahoo: '^IXIC',
    naver: 'https://api.stock.naver.com/index/.IXIC/basic',
    link: 'https://m.stock.naver.com/worldstock/index/.IXIC/total',
  },
];

const round = (n) => Math.round(n * 100) / 100;
const num = (s) => Number(String(s).replace(/,/g, ''));

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal-dashboard)', Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 하루치 5분봉에서 최대 max개만 고르게 남김 (작은 추세선용) */
function downsample(values, max = 48) {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => values[Math.round(i * step)]);
}

// 1순위: 야후 (값 + 장중 추세선)
async function fromYahoo(ix) {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ix.yahoo)}?interval=5m&range=1d`);
  const r = j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error('결과 없음');
  const m = r.meta;
  const price = m.regularMarketPrice;
  const prev = m.chartPreviousClose ?? m.previousClose;
  if (!Number.isFinite(price) || !Number.isFinite(prev)) throw new Error('값 없음');
  const closes = ((r.indicators.quote[0] || {}).close || []).filter(Number.isFinite);
  const period = m.currentTradingPeriod && m.currentTradingPeriod.regular;
  const now = Date.now() / 1000;
  return {
    price: round(price),
    change: round(price - prev),
    changePct: round(((price - prev) / prev) * 100),
    prevClose: round(prev),
    time: new Date(m.regularMarketTime * 1000).toISOString(),
    open: !!(period && now >= period.start && now < period.end),
    points: downsample(closes).map(round),
    source: 'yahoo',
  };
}

// 2순위: 네이버 (값만)
async function fromNaver(ix) {
  const j = await getJson(ix.naver);
  const price = num(j.closePrice);
  if (!Number.isFinite(price)) throw new Error('값 없음');
  const code = j.compareToPreviousPrice && j.compareToPreviousPrice.code; // 1 상한, 2 상승, 3 보합, 4 하한, 5 하락
  const sign = code === '4' || code === '5' ? -1 : code === '3' ? 0 : 1;
  const change = sign * Math.abs(num(j.compareToPreviousClosePrice));
  return {
    price: round(price),
    change: round(change),
    changePct: round(sign * Math.abs(num(j.fluctuationsRatio))),
    prevClose: round(price - change),
    time: new Date(j.localTradedAt).toISOString(),
    open: j.marketStatus === 'OPEN',
    points: [],
    source: 'naver',
  };
}

async function loadPrevious() {
  if (!process.env.PREV_URL) return {};
  try {
    const j = await getJson(process.env.PREV_URL);
    return Object.fromEntries((j.indices || []).map((x) => [x.id, x]));
  } catch {
    return {};
  }
}

const previous = await loadPrevious();
const indices = [];

for (const ix of INDICES) {
  const base = { id: ix.id, name: ix.name, link: ix.link };
  let quote = null;
  for (const source of [fromYahoo, fromNaver]) {
    try {
      quote = await source(ix);
      break;
    } catch (err) {
      console.warn(`${ix.name}: ${source.name} 실패 (${err.message})`);
    }
  }
  if (quote) indices.push({ ...base, ...quote });
  else if (previous[ix.id]) indices.push({ ...previous[ix.id], ...base, open: false, stale: true });
  else console.warn(`${ix.name}: 받아온 값도 이전 값도 없어 건너뜀`);
}

const out = { updatedAt: new Date().toISOString(), indices };
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
for (const x of indices) {
  console.log(`${x.name} ${x.price} (${x.change >= 0 ? '+' : ''}${x.changePct}%) · ${x.source}${x.stale ? ' · 이전 값' : ''}`);
}
