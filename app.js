'use strict';

/* =========================================================
 *  내 대시보드 — 즐겨찾기 · 검색 · 시계 · GitHub 동기화
 * ========================================================= */

const KEY = {
  data: 'dash.data',      // 즐겨찾기 데이터 (동기화 대상)
  ui: 'dash.ui',          // 이 기기에서만 쓰는 화면 상태
  sync: 'dash.sync',      // GitHub 저장소 설정
  token: 'dash.token',    // GitHub 토큰 (이 기기에만)
  sha: 'dash.sha',        // 마지막으로 본 원격 파일 버전
  dirty: 'dash.dirty',    // 아직 올리지 못한 변경 여부
};

const ENGINES = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  naver: { label: '네이버', url: 'https://search.naver.com/search.naver?query=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
};

const ICON = {
  plus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const EPOCH = new Date(0).toISOString();

// 날씨 기본 위치: 서울 (설정에서 도시 검색 또는 현재 위치로 변경)
const DEFAULT_WEATHER = { show: true, air: true, mode: 'city', name: '서울', lat: 37.5665, lon: 126.978 };

const CLOCK_STYLES = { minimal: '기본', bold: '굵게', flip: '플립', segment: '디지털', analog: '아날로그' };
const DEFAULT_CLOCK = { style: 'minimal', seconds: false, h12: false };

// Google OAuth 클라이언트 ID 형식 (비밀값이 아니라 공개돼도 되는 값)
const CLIENT_ID_RE = /^[\w-]+\.apps\.googleusercontent\.com$/;
// 내 Google Cloud 프로젝트(dashboard)의 웹 클라이언트 ID. 모든 브라우저·기기에서 따로 입력하지 않도록 기본값으로 둠
// (Google Cloud의 '승인된 JavaScript 원본'에 등록된 주소에서만 동작하므로 공개돼도 안전)
const PRESET_GMAIL_CLIENT_ID = '32493363319-ktdfhpm9ff8936lo194m4bf10od0nn4n.apps.googleusercontent.com';

/* ---------- 유틸 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v; // 고정된 SVG 문자열에만 사용
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const store = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 사용 불가 */ }
  },
  remove(k) {
    try { localStorage.removeItem(k); } catch { /* 무시 */ }
  },
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

function safeUrl(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

const hostOf = (url) => new URL(url).hostname.replace(/^www\./, '');

function hue(str) {
  let x = 0;
  for (const c of str) x = (x * 31 + c.codePointAt(0)) >>> 0;
  return x % 360;
}

function toB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromB64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------- 데이터 ---------- */
function defaultData() {
  return {
    version: 1,
    updatedAt: EPOCH, // 아직 한 번도 수정하지 않은 상태 표시
    settings: {
      engine: 'google',
      newTab: false,
      showMarket: true,
      weather: { ...DEFAULT_WEATHER },
      clock: { ...DEFAULT_CLOCK },
      gmail: { show: true, clientId: PRESET_GMAIL_CLIENT_ID },
    },
    groups: [
      {
        id: uid(),
        name: '자주 가는 곳',
        items: [
          { id: uid(), name: '네이버', url: 'https://www.naver.com/', icon: '' },
          { id: uid(), name: 'Gmail', url: 'https://mail.google.com/', icon: '' },
          { id: uid(), name: 'YouTube', url: 'https://www.youtube.com/', icon: '' },
          { id: uid(), name: 'GitHub', url: 'https://github.com/', icon: '' },
          { id: uid(), name: 'Notion', url: 'https://www.notion.so/', icon: 'https://www.notion.so/images/favicon.ico' },
        ],
      },
      { id: uid(), name: '업무', items: [] },
    ],
    ddays: [],
  };
}

function normalizeItem(b) {
  const url = safeUrl(b && b.url);
  if (!url) return null;
  return {
    id: String(b.id || uid()),
    name: String(b.name || hostOf(url)).slice(0, 60),
    url,
    icon: (b.icon && safeUrl(b.icon)) || '',
  };
}

function sanitize(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.groups)) {
    throw new Error('대시보드 데이터 형식이 아니에요');
  }
  const s = d.settings || {};
  const w = s.weather || {};
  const c = s.clock || {};
  const gm = s.gmail || {};
  const groups = d.groups
    .filter((g) => g && typeof g.name === 'string')
    .map((g) => ({
      id: String(g.id || uid()),
      name: g.name.slice(0, 40),
      items: (Array.isArray(g.items) ? g.items : []).map(normalizeItem).filter(Boolean),
    }));
  if (!groups.length) groups.push({ id: uid(), name: '즐겨찾기', items: [] });
  return {
    version: 1,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : EPOCH,
    settings: {
      engine: ENGINES[s.engine] ? s.engine : 'google',
      newTab: !!s.newTab,
      showMarket: s.showMarket !== false,
      gmail: {
        show: gm.show !== false,
        clientId: typeof gm.clientId === 'string' && CLIENT_ID_RE.test(gm.clientId.trim()) ? gm.clientId.trim() : PRESET_GMAIL_CLIENT_ID,
      },
      clock: {
        style: CLOCK_STYLES[c.style] ? c.style : DEFAULT_CLOCK.style,
        seconds: !!c.seconds,
        h12: !!c.h12,
      },
      weather: {
        show: w.show !== false,
        air: w.air !== false,
        mode: w.mode === 'auto' ? 'auto' : 'city',
        name: typeof w.name === 'string' && w.name.trim() ? w.name.slice(0, 40) : DEFAULT_WEATHER.name,
        lat: Number.isFinite(w.lat) ? w.lat : DEFAULT_WEATHER.lat,
        lon: Number.isFinite(w.lon) ? w.lon : DEFAULT_WEATHER.lon,
      },
    },
    groups,
    ddays: (Array.isArray(d.ddays) ? d.ddays : [])
      .filter((x) => x && typeof x.name === 'string' && x.name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(x.date))
      .map((x) => ({ id: String(x.id || uid()), name: x.name.trim().slice(0, 30), date: x.date }))
      .slice(0, 30),
  };
}

function loadData() {
  try {
    const raw = store.get(KEY.data, null);
    return raw ? sanitize(raw) : defaultData();
  } catch {
    return defaultData();
  }
}

let data = loadData();
const ui = Object.assign({ group: null }, store.get(KEY.ui, {}));
let editMode = false;
let query = '';

const countItems = (d) => d.groups.reduce((n, g) => n + g.items.length, 0);
const currentGroup = () => data.groups.find((g) => g.id === ui.group) || data.groups[0];

function findItem(id) {
  for (const group of data.groups) {
    const index = group.items.findIndex((b) => b.id === id);
    if (index >= 0) return { group, index, item: group.items[index] };
  }
  return null;
}

/** 데이터를 바꾸고 저장·화면 갱신·동기화 예약까지 한 번에 */
function commit(mutate) {
  if (mutate) mutate();
  data.updatedAt = new Date().toISOString();
  store.set(KEY.data, data);
  render();
  Sync.changed();
}

function replaceData(next) {
  data = next;
  store.set(KEY.data, data);
  render();
}

function saveUi() { store.set(KEY.ui, ui); }

/* ---------- 화면 ---------- */
function render() {
  renderTabs();
  renderGrid();
  renderMarket();
  renderWeather();
  renderDdays();
  renderGmail();
  tick();
  $('#engine').value = data.settings.engine;
}

function renderTabs() {
  const nav = $('#tabs');
  const cur = currentGroup();
  nav.replaceChildren(
    ...data.groups.map((g) =>
      h('button', {
        type: 'button',
        class: 'tab' + (g === cur && !query ? ' active' : ''),
        dataset: { group: g.id },
        title: editMode && g === cur ? '눌러서 이름 바꾸기' : null,
        onclick: () => onTabClick(g),
      }, g.name)),
  );
  if (editMode) {
    nav.append(h('button', { type: 'button', class: 'tab add', title: '그룹 추가', 'aria-label': '그룹 추가', html: ICON.plus, onclick: () => openGroupDialog(null) }));
  }
  nav.hidden = !editMode && data.groups.length <= 1;
}

function onTabClick(g) {
  if (editMode && g === currentGroup() && !query) return openGroupDialog(g);
  ui.group = g.id;
  saveUi();
  if (query) clearSearch();
  render();
}

const loadedIcons = new Set();

function iconEl(b) {
  const box = h('span', { class: 'icon', style: `--h:${hue(hostOf(b.url))}` },
    h('span', { class: 'letter', 'aria-hidden': 'true' }, ([...b.name.trim()][0] || '?').toUpperCase()));
  const src = b.icon || new URL('/favicon.ico', b.url).href;
  const img = h('img', { alt: '', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
  if (loadedIcons.has(src)) box.classList.add('has-img');
  img.addEventListener('load', () => {
    if (img.naturalWidth > 1) { loadedIcons.add(src); box.classList.add('has-img'); } else img.remove();
  });
  img.addEventListener('error', () => { loadedIcons.delete(src); box.classList.remove('has-img'); img.remove(); });
  img.src = src;
  box.append(img);
  return box;
}

function tileEl(b) {
  const a = h('a', {
    class: 'tile' + (drag && drag.active && drag.id === b.id ? ' placeholder' : ''),
    href: b.url,
    dataset: { id: b.id },
    title: `${b.name}\n${b.url}`,
    draggable: 'false',
  }, iconEl(b), h('span', { class: 'name' }, b.name));
  if (data.settings.newTab) { a.target = '_blank'; a.rel = 'noopener'; }
  a.append(h('span', { class: 'badge', role: 'button', 'aria-label': `${b.name} 삭제`, html: ICON.close }));
  if (hostOf(b.url) === 'mail.google.com') {
    a.dataset.mail = '1';
    a.append(h('span', { class: 'mail-count', hidden: true }));
  }
  return a;
}

function renderGrid() {
  const grid = $('#grid');
  const empty = $('#empty');
  let items;
  if (query) {
    const q = query.toLowerCase();
    items = data.groups.flatMap((g) => g.items)
      .filter((b) => b.name.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
  } else {
    items = currentGroup().items;
  }
  grid.replaceChildren(...items.map(tileEl));
  if (editMode && !query) {
    grid.append(h('button', { type: 'button', class: 'tile add', onclick: () => openItemDialog(null) },
      h('span', { class: 'icon', html: ICON.plus }), h('span', { class: 'name' }, '추가')));
  }
  if (query && !items.length) {
    empty.textContent = `'${query}'와 일치하는 즐겨찾기가 없어요. Enter를 누르면 웹에서 검색해요.`;
  } else if (!items.length && !editMode) {
    empty.textContent = '아직 즐겨찾기가 없어요. 오른쪽 아래 연필 버튼으로 추가해 보세요.';
  } else {
    empty.textContent = '';
  }
  empty.hidden = !empty.textContent;
}

function toggleEdit(force) {
  editMode = typeof force === 'boolean' ? force : !editMode;
  if (editMode && query) clearSearch();
  document.body.classList.toggle('editing', editMode);
  $('#editBtn').setAttribute('aria-pressed', String(editMode));
  $('#editBtn').title = editMode ? '편집 끝내기 (E)' : '편집 (E)';
  render();
}

/* ---------- 시계 ----------
 * 모양 5가지: 기본(얇게) · 굵게 · 플립 · 디지털(7세그먼트) · 아날로그
 * mountClock(상자, 설정)은 그 모양의 시계를 상자에 그리고, 매초 부를 갱신 함수를 돌려줌
 * (설정 창의 미리 보기도 같은 함수로 그림) */
const p2 = (n) => String(n).padStart(2, '0');

// 7세그먼트: 가로 막대(a, g, d)와 세로 막대(f, b, e, c)
const hexH = (cy) => `9,${cy} 14,${cy - 5} 42,${cy - 5} 47,${cy} 42,${cy + 5} 14,${cy + 5}`;
const hexV = (cx, y1, y2) => `${cx},${y1} ${cx + 5},${y1 + 5} ${cx + 5},${y2 - 5} ${cx},${y2} ${cx - 5},${y2 - 5} ${cx - 5},${y1 + 5}`;
const SEGMENTS = {
  a: hexH(8), g: hexH(50), d: hexH(92),
  f: hexV(8, 11, 47), b: hexV(48, 11, 47), e: hexV(8, 53, 89), c: hexV(48, 53, 89),
};
const DIGIT_SEGS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

function segDigit() {
  const polys = Object.entries(SEGMENTS).map(([k, pts]) => `<polygon data-s="${k}" points="${pts}"/>`).join('');
  return h('span', { class: 'seg', html: `<svg viewBox="0 0 56 100" aria-hidden="true">${polys}</svg>` });
}
function setSeg(el, ch) {
  if (el.value === ch) return;
  el.value = ch;
  const on = DIGIT_SEGS[Number(ch)] || '';
  el.querySelectorAll('polygon').forEach((p) => p.classList.toggle('on', on.includes(p.dataset.s)));
}
const segColon = () => h('span', {
  class: 'seg',
  html: '<svg viewBox="0 0 16 100" aria-hidden="true"><circle class="on" cx="8" cy="32" r="5"/><circle class="on" cx="8" cy="68" r="5"/></svg>',
});

// 플립: 위·아래 반쪽 카드 + 넘어가는 덮개(flap) 두 장
function flipCard() {
  return h('span', { class: 'flip' },
    h('span', { class: 'half top' }, h('span', {}, '0')),
    h('span', { class: 'half bottom' }, h('span', {}, '0')));
}
function setFlip(el, v, animate) {
  if (el.value === v) return;
  const old = el.value == null ? v : el.value;
  el.value = v;
  const [top, bottom] = el.querySelectorAll(':scope > .half:not(.flap)');
  el.querySelectorAll('.flap').forEach((f) => f.remove());
  top.firstChild.textContent = v;
  // 플립 모양은 사용자가 직접 고른 움직임이라 '애니메이션 줄이기' 설정과 상관없이 넘김
  if (!animate || old === v) {
    bottom.firstChild.textContent = v;
    return;
  }
  bottom.firstChild.textContent = old;
  const flapTop = h('span', { class: 'half top flap' }, h('span', {}, old));
  const flapBottom = h('span', { class: 'half bottom flap' }, h('span', {}, v));
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (el.value === v) bottom.firstChild.textContent = v;
    flapTop.remove();
    flapBottom.remove();
  };
  flapBottom.addEventListener('animationend', finish);
  setTimeout(finish, 900); // 탭이 숨겨져 애니메이션이 멈춘 경우 대비
  el.append(flapTop, flapBottom);
}

function analogSvg(seconds) {
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    ticks += `<line class="tick${major ? ' major' : ''}" x1="100" y1="${major ? 14 : 13}" x2="100" y2="${major ? 26 : 18}" transform="rotate(${i * 6} 100 100)"/>`;
  }
  return `<svg class="analog" viewBox="0 0 200 200" aria-hidden="true">
    <circle class="face" cx="100" cy="100" r="94"/>${ticks}
    <line class="hand hour" x1="100" y1="110" x2="100" y2="56"/>
    <line class="hand minute" x1="100" y1="114" x2="100" y2="30"/>
    ${seconds ? '<line class="hand second" x1="100" y1="122" x2="100" y2="22"/>' : ''}
    <circle class="pin" cx="100" cy="100" r="4.5"/></svg>`;
}

function mountClock(box, cfg, base = 'time') {
  box.className = `${base} clock-${cfg.style}${cfg.seconds ? ' with-sec' : ''}`;
  const parts = (now) => {
    let H = now.getHours();
    const ampm = H < 12 ? '오전' : '오후';
    if (cfg.h12) H = H % 12 || 12;
    return { H, M: now.getMinutes(), S: now.getSeconds(), ampm };
  };

  if (cfg.style === 'analog') {
    box.innerHTML = analogSvg(cfg.seconds);
    const [hr, mn, sc] = ['hour', 'minute', 'second'].map((c) => box.querySelector(`.${c}`));
    return (now) => {
      const H = now.getHours();
      const M = now.getMinutes();
      const S = now.getSeconds();
      hr.setAttribute('transform', `rotate(${((H % 12) + M / 60) * 30} 100 100)`);
      mn.setAttribute('transform', `rotate(${(M + S / 60) * 6} 100 100)`);
      if (sc) sc.setAttribute('transform', `rotate(${S * 6} 100 100)`);
    };
  }

  const ampmEl = cfg.h12 ? h('span', { class: 'ampm' }) : null;

  if (cfg.style === 'flip' || cfg.style === 'segment') {
    const flip = cfg.style === 'flip';
    const cells = [];
    const kids = [];
    for (let g = 0; g < (cfg.seconds ? 3 : 2); g++) {
      if (g) kids.push(flip ? h('span', { class: 'flip-colon' }, h('i'), h('i')) : segColon());
      const a = flip ? flipCard() : segDigit();
      const b = flip ? flipCard() : segDigit();
      cells.push(a, b);
      kids.push(h('span', { class: 'pair' }, a, b));
    }
    box.replaceChildren(...[ampmEl, ...kids].filter(Boolean));
    return (now, animate = true) => {
      const { H, M, S, ampm } = parts(now);
      const digits = p2(H) + p2(M) + (cfg.seconds ? p2(S) : '');
      [...digits].forEach((ch, i) => (flip ? setFlip(cells[i], ch, animate) : setSeg(cells[i], ch)));
      if (ampmEl) ampmEl.textContent = ampm;
    };
  }

  // 기본 · 굵게
  const hm = h('span', { class: 'hm' });
  const sec = cfg.seconds ? h('span', { class: 'sec' }) : null;
  box.replaceChildren(...[ampmEl, hm, sec].filter(Boolean));
  return (now) => {
    const { H, M, S, ampm } = parts(now);
    hm.textContent = `${cfg.h12 ? H : p2(H)}:${p2(M)}`;
    if (sec) sec.textContent = p2(S);
    if (ampmEl) ampmEl.textContent = ampm;
  };
}

const Clock = { key: '', update: null };
let lastDay = '';
function tick() {
  const now = new Date();
  const day = now.toDateString();
  if (lastDay && day !== lastDay) renderDdays(); // 자정이 지나면 디데이 숫자 갱신
  lastDay = day;

  const cfg = data.settings.clock;
  const key = `${cfg.style}|${cfg.seconds}|${cfg.h12}`;
  if (key !== Clock.key) {
    Clock.key = key;
    Clock.update = mountClock($('#time'), cfg);
    Clock.update(now, false);
  } else {
    Clock.update(now, true);
  }
  $('#time').setAttribute('aria-label', now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }));
  $('#date').textContent = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

function fillClockSettings() {
  const cfg = data.settings.clock;
  const now = new Date();
  $('#clockStyles').replaceChildren(...Object.entries(CLOCK_STYLES).map(([style, label]) => {
    const preview = h('span');
    mountClock(preview, { ...cfg, style, seconds: false }, 'time clock-preview')(now, false);
    const selected = cfg.style === style;
    return h('button', {
      type: 'button',
      class: 'style-opt' + (selected ? ' selected' : ''),
      role: 'radio',
      'aria-checked': String(selected),
      onclick: () => {
        commit(() => { data.settings.clock.style = style; });
        fillClockSettings();
      },
    }, preview, h('span', { class: 'style-name' }, label));
  }));
  $('#clockSeconds').checked = cfg.seconds;
  $('#clock12').checked = cfg.h12;
  $('#clock12').disabled = cfg.style === 'analog';
}

/* ---------- 시장 지수 ----------
 * GitHub Actions가 장중 10분마다 만들어 함께 배포하는 market.json을 읽음
 * (증권 사이트는 브라우저에서 직접 가져오는 것을 막아 두어서 이렇게 우회) */
const Market = {
  data: store.get('dash.market', null), // 마지막 값을 기억해 두었다가 바로 표시
  lastLoad: 0,
  async load() {
    try {
      const res = await fetch('market.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      if (!j || !Array.isArray(j.indices)) throw new Error('형식 오류');
      this.data = j;
      store.set('dash.market', j);
    } catch {
      /* 아직 배포 전이거나 오프라인 → 기억해 둔 값 사용 */
    }
    this.lastLoad = Date.now();
    renderMarket();
  },
};

const fmtNum = (n) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sparkline(points) {
  const W = 44;
  const H = 16;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${((i / (points.length - 1)) * W).toFixed(1)},${(H - 1 - ((p - min) / span) * (H - 2)).toFixed(1)}`)
    .join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'mk-spark');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', d);
  svg.append(line);
  return svg;
}

function renderMarket() {
  const box = $('#market');
  const m = Market.data;
  if (!data.settings.showMarket || !m || !m.indices.length) {
    box.hidden = true;
    return;
  }
  box.replaceChildren(...m.indices.map((ix) => {
    const change = Number(ix.change) || 0;
    const pct = Number(ix.changePct) || 0;
    const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const arrow = { up: '▲', down: '▼', flat: '' }[dir];
    const when = ix.time
      ? new Date(ix.time).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      : '';
    const title = [
      `${ix.name} ${fmtNum(ix.price)}`,
      `전일 대비 ${change > 0 ? '+' : ''}${fmtNum(change)} (${pct > 0 ? '+' : ''}${pct.toFixed(2)}%)`,
      `${when} 기준${ix.open ? ' · 장중' : ''}${ix.stale ? ' · 최신 값을 받지 못함' : ''}`,
    ].join('\n');
    const link = safeUrl(ix.link);
    const el = h(link ? 'a' : 'span', { class: `mk ${dir}${ix.stale ? ' stale' : ''}`, href: link, title },
      h('span', { class: 'mk-name' }, ix.name),
      h('span', { class: 'mk-price' }, fmtNum(ix.price)),
      h('span', { class: 'mk-chg' }, `${arrow}${Math.abs(pct).toFixed(2)}%`),
      Array.isArray(ix.points) && ix.points.length > 1 ? sparkline(ix.points) : null,
      ix.open ? h('span', { class: 'mk-live', 'aria-label': '장중' }) : null);
    if (link && data.settings.newTab) { el.target = '_blank'; el.rel = 'noopener'; }
    return el;
  }));
  box.hidden = false;
}

/* ---------- 날씨 ----------
 * Open-Meteo (무료, 키 없음, 브라우저에서 바로 호출 가능)
 * 위치는 설정한 도시 또는 이 기기의 현재 위치 (약 1km 단위로 반올림해서 보냄) */
const CLOUD = 'M7 15h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 7.5 3.75 3.75 0 0 0 7 15z';
const WX_ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  partly: '<path d="M6.5 9.5a3.5 3.5 0 0 1 6.2-2.7"/><path d="M8.5 2.5v1.2M3 8h1.2M4.6 4.6l.9.9"/><path d="M8.5 20h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.3A2.9 2.9 0 0 0 8.5 20z"/>',
  cloud: '<path d="M7 18h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 10.5 3.75 3.75 0 0 0 7 18z"/>',
  rain: `<path d="${CLOUD}"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>`,
  snow: `<path d="${CLOUD}"/><path d="M8.5 19h.01M12.5 19h.01M16.5 19h.01M10.5 22h.01M14.5 22h.01"/>`,
  fog: '<path d="M4 8h16M4 12h16M6 16h12M8 20h8"/>',
  storm: `<path d="${CLOUD}"/><path d="M13 15l-2.5 3.5h3.5L11.5 22"/>`,
};

function describeWeather(code, day) {
  if (code === 0) return ['맑음', day ? 'sun' : 'moon'];
  if (code === 1) return ['대체로 맑음', day ? 'sun' : 'moon'];
  if (code === 2) return ['구름 조금', day ? 'partly' : 'cloud'];
  if (code === 3) return ['흐림', 'cloud'];
  if (code === 45 || code === 48) return ['안개', 'fog'];
  if (code >= 51 && code <= 57) return ['이슬비', 'rain'];
  if (code >= 61 && code <= 67) return ['비', 'rain'];
  if (code >= 71 && code <= 77) return ['눈', 'snow'];
  if (code >= 80 && code <= 82) return ['소나기', 'rain'];
  if (code === 85 || code === 86) return ['눈', 'snow'];
  if (code >= 95) return ['뇌우', 'storm'];
  return ['날씨', 'cloud'];
}

const Weather = {
  data: store.get('dash.weather', null),
  lastLoad: 0,
  attemptKey: null,
  loading: false,
  error: '',

  key() {
    const w = data.settings.weather;
    return w.mode === 'auto' ? 'auto' : `${w.lat.toFixed(2)},${w.lon.toFixed(2)}`;
  },

  position() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(Object.assign(new Error('이 브라우저는 위치를 지원하지 않아요'), { code: -1 }));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        reject,
        { maximumAge: 30 * 60 * 1000, timeout: 15000 },
      );
    });
  },

  async load(force = false) {
    const w = data.settings.weather;
    if (!w.show) return renderWeather();
    const key = this.key();
    const fresh = this.data && this.data.key === key && 'air' in this.data
      && Date.now() - this.data.fetchedAt < 15 * 60 * 1000;
    if (!force && fresh) { this.lastLoad = Date.now(); return renderWeather(); }
    if (this.loading) return;
    this.loading = true;
    this.attemptKey = key;
    try {
      let { lat, lon, name } = w;
      if (w.mode === 'auto') {
        ({ lat, lon } = await this.position());
        name = '현재 위치';
      }
      const where = `latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`;
      const url = `https://api.open-meteo.com/v1/forecast?${where}`
        + '&current=temperature_2m,apparent_temperature,weather_code,is_day'
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
        + '&timezone=auto&forecast_days=1';
      // 미세먼지는 실패해도 날씨는 보여줌
      const airReq = fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${where}&current=pm10,pm2_5&timezone=auto`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const air = await airReq;
      this.data = {
        key,
        fetchedAt: Date.now(),
        name,
        temp: j.current.temperature_2m,
        feels: j.current.apparent_temperature,
        code: j.current.weather_code,
        day: !!j.current.is_day,
        max: j.daily.temperature_2m_max[0],
        min: j.daily.temperature_2m_min[0],
        rain: j.daily.precipitation_probability_max[0],
        air: air && air.current && Number.isFinite(air.current.pm10)
          ? { pm10: air.current.pm10, pm25: air.current.pm2_5 }
          : null,
      };
      store.set('dash.weather', this.data);
      this.error = '';
    } catch (err) {
      this.error = err && err.code === 1 ? '위치 권한이 거부됐어요. 브라우저 주소창의 위치 권한을 허용하거나 도시를 지정하세요'
        : err && err.code === -1 ? err.message
          : err && (err.code === 2 || err.code === 3) ? '현재 위치를 알 수 없어요. 도시를 지정해 보세요'
            : '날씨를 불러오지 못했어요';
    } finally {
      this.loading = false;
      this.lastLoad = Date.now();
      renderWeather();
      if ($('#settingsDlg').open) fillWeatherSettings();
    }
  },
};

function renderWeather() {
  const el = $('#weather');
  const w = data.settings.weather;
  const d = Weather.data;
  if (w.show && (!d || d.key !== Weather.key()) && Weather.attemptKey !== Weather.key()) {
    Weather.load(); // 위치가 바뀌었거나(다른 기기에서 변경 포함) 처음 → 새로 불러옴
  }
  if (!w.show || !d || d.key !== Weather.key()) {
    el.hidden = true;
    $('#air').hidden = true;
    return;
  }
  renderAir(d, w);
  const [text, icon] = describeWeather(d.code, d.day);
  const r = (n) => `${Math.round(n)}°`;
  el.replaceChildren(
    h('span', { class: 'wx-icon', html: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${WX_ICON[icon]}</svg>` }),
    h('span', { class: 'wx-temp' }, r(d.temp)),
    h('span', { class: 'wx-range' }, `${r(d.max)}/${r(d.min)}`),
    h('span', { class: 'wx-name' }, d.name),
  );
  el.title = [
    `${d.name} · ${text}`,
    `지금 ${r(d.temp)} (체감 ${r(d.feels)})`,
    `최고 ${r(d.max)} · 최저 ${r(d.min)} · 강수확률 ${d.rain ?? 0}%`,
  ].join('\n');
  el.setAttribute('aria-label', `${d.name} ${text} ${r(d.temp)}`);
  el.href = `https://search.naver.com/search.naver?query=${encodeURIComponent(w.mode === 'auto' ? '날씨' : `${d.name} 날씨`)}`;
  if (data.settings.newTab) { el.target = '_blank'; el.rel = 'noopener'; } else { el.removeAttribute('target'); el.removeAttribute('rel'); }
  el.hidden = false;
}

/* 미세먼지 등급: 환경부 기준 (㎍/㎥) */
const AIR_GRADES = ['좋음', '보통', '나쁨', '매우나쁨'];
function airGrade(v, cuts) {
  if (!Number.isFinite(v)) return -1;
  return v <= cuts[0] ? 0 : v <= cuts[1] ? 1 : v <= cuts[2] ? 2 : 3;
}

function renderAir(d, w) {
  const el = $('#air');
  if (!w.air || !d.air) {
    el.hidden = true;
    return;
  }
  const g10 = airGrade(d.air.pm10, [30, 80, 150]);
  const g25 = airGrade(d.air.pm25, [15, 35, 75]);
  const part = (label, g) => (g < 0 ? null : [`${label} `, h('b', { class: `ag${g}` }, AIR_GRADES[g])]);
  el.replaceChildren(...[part('미세', g10), g10 >= 0 && g25 >= 0 ? ' · ' : null, part('초미세', g25)].flat().filter(Boolean));
  el.title = [
    g10 >= 0 ? `미세먼지(PM10) ${Math.round(d.air.pm10)}㎍/㎥ · ${AIR_GRADES[g10]}` : null,
    g25 >= 0 ? `초미세먼지(PM2.5) ${Math.round(d.air.pm25)}㎍/㎥ · ${AIR_GRADES[g25]}` : null,
    `${d.name} · 예보 모델 추정값 (환경부 등급 기준)`,
  ].filter(Boolean).join('\n');
  el.href = `https://search.naver.com/search.naver?query=${encodeURIComponent(w.mode === 'auto' ? '미세먼지' : `${d.name} 미세먼지`)}`;
  if (data.settings.newTab) { el.target = '_blank'; el.rel = 'noopener'; } else { el.removeAttribute('target'); el.removeAttribute('rel'); }
  el.hidden = false;
}

/* ---------- 디데이 ---------- */
function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

const ddayLabel = (n) => (n > 0 ? `D-${n}` : n === 0 ? 'D-Day' : `D+${-n}`);

/** 다가오는 날(가까운 순) → 지난 날(최근 순) */
function sortedDdays() {
  return data.ddays
    .map((x) => ({ ...x, n: daysUntil(x.date) }))
    .sort((a, b) => (a.n < 0) - (b.n < 0) || (a.n >= 0 ? a.n - b.n : b.n - a.n));
}

const fmtDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
};

function renderDdays() {
  const box = $('#ddays');
  const list = sortedDdays();
  box.replaceChildren(...list.map((x) => h('button', {
    type: 'button',
    class: 'dd' + (x.n === 0 ? ' today' : x.n < 0 ? ' past' : ''),
    title: `${x.name} · ${fmtDate(x.date)}\n눌러서 디데이 관리`,
    onclick: openDdaySettings,
  }, h('span', { class: 'dd-name' }, x.name), h('span', { class: 'dd-n' }, ddayLabel(x.n)))));
  box.hidden = !list.length;
}

function fillDdaySettings() {
  const box = $('#ddayList');
  const list = sortedDdays();
  if (!list.length) {
    box.replaceChildren(h('p', { class: 'hint' }, '아직 디데이가 없어요. 이름과 날짜를 넣고 추가하세요.'));
    return;
  }
  box.replaceChildren(...list.map((x) => h('div', { class: 'dd-row' },
    h('span', { class: 'dd-row-n' }, ddayLabel(x.n)),
    h('span', { class: 'dd-row-name' }, x.name),
    h('span', { class: 'dd-row-date' }, fmtDate(x.date)),
    h('button', { type: 'button', class: 'iconbtn', 'aria-label': `${x.name} 삭제`, title: '삭제', html: ICON.close, onclick: () => deleteDday(x.id) }))));
}

function addDday(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const name = f.elements.title.value.trim();
  const date = f.elements.date.value;
  const msg = $('#ddayMsg');
  if (!name) { setMsg(msg, '이름을 입력하세요', 'err'); return f.elements.title.focus(); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setMsg(msg, '날짜를 고르세요', 'err'); return f.elements.date.focus(); }
  commit(() => data.ddays.push({ id: uid(), name: name.slice(0, 30), date }));
  f.reset();
  fillDdaySettings();
  setMsg(msg, `'${name}' ${ddayLabel(daysUntil(date))} 추가됨`, 'ok');
  f.elements.title.focus();
}

function deleteDday(id) {
  const item = data.ddays.find((x) => x.id === id);
  if (!item) return;
  commit(() => { data.ddays = data.ddays.filter((x) => x.id !== id); });
  fillDdaySettings();
  const msg = $('#ddayMsg');
  msg.replaceChildren(`'${item.name}' 삭제됨 `, h('button', {
    type: 'button',
    class: 'linklike',
    onclick: () => {
      commit(() => data.ddays.push(item));
      fillDdaySettings();
      setMsg(msg, `'${item.name}' 되돌림`, 'ok');
    },
  }, '되돌리기'));
  msg.className = 'msg';
}

function openDdaySettings() {
  openSettings();
  $('#ddaySection').scrollIntoView({ block: 'start' });
  $('#ddayForm').elements.title.focus();
}

function fillWeatherSettings() {
  const w = data.settings.weather;
  $('#showWeather').checked = w.show;
  $('#showAir').checked = w.air;
  $('#weatherWhere').textContent = w.mode === 'auto' ? '위치: 이 기기의 현재 위치' : `위치: ${w.name}`;
  if (Weather.error) setMsg($('#weatherMsg'), Weather.error, 'err');
}

async function searchCity(e) {
  e.preventDefault();
  const input = e.currentTarget.elements.city;
  const q = input.value.trim();
  const msg = $('#weatherMsg');
  const box = $('#weatherResults');
  if (!q) return input.focus();
  setMsg(msg, '찾는 중…');
  const list = await findPlaces(q);
  if (!list) return setMsg(msg, '도시를 검색하지 못했어요. 인터넷 연결을 확인하세요', 'err');
  box.replaceChildren(...list.map((x) => h('button', {
    type: 'button',
    class: 'result',
    onclick: () => chooseCity(x),
  }, h('strong', {}, x.name), h('span', {}, x.region))));
  setMsg(msg, list.length ? '' : '찾는 지역이 없어요. "용인시", "수지구"처럼 정식 이름으로 검색해 보세요', list.length ? '' : 'err');
}

/**
 * 지역 검색: 두 곳을 함께 찾아 합침
 *  - Open-Meteo: 큰 도시·해외 도시에 강함 (인구 정보로 정렬). 한글 이름이 빠진 곳이 있어 "시/광역시…"를 붙여서도 찾음
 *  - OpenStreetMap(Nominatim): 국내 시·군·구·동 이름에 강함 (용인시, 수지구, 판교 등). 이용 규칙상 검색 1번에 1회만 요청
 * 실패한 쪽은 무시하고, 둘 다 실패하면 null
 */
async function findPlaces(q) {
  const variants = /(시|도|군|구|동|읍|면)$/.test(q)
    ? [q]
    : [q, `${q}시`, `${q}군`, `${q}구`, `${q}광역시`, `${q}특별시`, `${q}특별자치시`, `${q}특별자치도`];

  const fromOpenMeteo = Promise.all(variants.map(async (name) => {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=ko`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()).results || [];
  })).then((groups) => groups.flat()
    .filter((x) => /^(PPL|ADM)/.test(x.feature_code || '')) // 산·강 등은 제외
    .map((x) => ({
      name: x.name,
      region: [x.admin2 !== x.name ? x.admin2 : null, x.admin1 !== x.name ? x.admin1 : null, x.country].filter(Boolean).join(', '),
      lat: x.latitude,
      lon: x.longitude,
      pop: x.population || 0,
    })));

  const fromOsm = fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&accept-language=ko&limit=6&layer=address&featureType=settlement`)
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then((rows) => rows.map((x) => {
      const a = x.address || {};
      const parts = [a.borough, a.city, a.county, a.province || a.state, a.country].filter((p) => p && p !== x.name);
      return { name: x.name, region: [...new Set(parts)].join(', '), lat: Number(x.lat), lon: Number(x.lon), pop: 0, kr: a.country_code === 'kr' };
    }).sort((a, b) => b.kr - a.kr)); // 같은 이름이면 국내 지역 먼저

  const [om, osm] = await Promise.allSettled([fromOpenMeteo, fromOsm]);
  if (om.status === 'rejected' && osm.status === 'rejected') return null;
  const omList = om.status === 'fulfilled' ? om.value : [];
  const osmList = osm.status === 'fulfilled' ? osm.value : [];

  // 순서: 인구가 알려진 도시(큰 도시) → OSM 지명 → 나머지
  // 겹침: 5km 안이거나, 같은 이름이면서 30km 안 (두 서비스가 도시 중심을 조금 다르게 잡음)
  const ordered = [
    ...omList.filter((x) => x.pop > 0).sort((a, b) => b.pop - a.pop),
    ...osmList,
    ...omList.filter((x) => !x.pop),
  ];
  const near = (a, b, deg) => Math.abs(a.lat - b.lat) < deg && Math.abs(a.lon - b.lon) < deg;
  const picked = [];
  for (const p of ordered) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (picked.some((x) => near(x, p, 0.05) || (x.name === p.name && near(x, p, 0.3)))) continue;
    picked.push(p);
    if (picked.length === 5) break;
  }
  return picked;
}

function chooseCity(x) {
  Weather.error = '';
  commit(() => {
    data.settings.weather = { ...data.settings.weather, show: true, mode: 'city', name: x.name, lat: x.lat, lon: x.lon };
  });
  $('#weatherResults').replaceChildren();
  $('#weatherForm').elements.city.value = '';
  setMsg($('#weatherMsg'), `${x.name} 날씨를 보여줄게요`, 'ok');
  fillWeatherSettings();
}

function useMyLocation() {
  Weather.error = '';
  setMsg($('#weatherMsg'), '위치를 확인하는 중… (브라우저가 위치 권한을 물어볼 수 있어요)');
  $('#weatherResults').replaceChildren();
  commit(() => { data.settings.weather = { ...data.settings.weather, show: true, mode: 'auto' }; });
  fillWeatherSettings();
  const watch = setInterval(() => {
    if (Weather.loading) return;
    clearInterval(watch);
    if (!Weather.error) setMsg($('#weatherMsg'), '현재 위치 날씨를 보여줄게요', 'ok');
  }, 300);
}

/* ---------- Gmail ----------
 * 구글 로그인(OAuth) 후 Gmail API로 안 읽은 메일 수와 최근 메일 5개를 가져옴
 * - 권한: gmail.metadata (보낸 사람·제목·시간 등만, 본문은 못 읽음)
 * - 메일 내용은 저장하지 않음. 로그인 토큰(1시간 유효)만 이 기기에 보관 */
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.metadata';

const Gmail = {
  auth: store.get('dash.gmail', null), // { token, exp, email }
  data: null, // { unread, messages: [{ thread, from, subject, time }] }
  loading: false,
  lastLoad: 0,
  error: '',
  gis: null,

  get valid() { return !!(this.auth && this.auth.token && this.auth.exp > Date.now() + 60 * 1000); },

  /** 구글 로그인 스크립트 (필요할 때만 불러옴) */
  loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!this.gis) {
      this.gis = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => { this.gis = null; reject(new Error('구글 로그인 스크립트를 불러오지 못했어요')); };
        document.head.append(s);
      });
    }
    return this.gis;
  },

  /** 로그인 창을 띄워 토큰 받기 (버튼 클릭 안에서 불러야 팝업이 안 막힘) */
  async connect() {
    const clientId = data.settings.gmail.clientId;
    if (!clientId) throw new Error('먼저 OAuth 클라이언트 ID를 입력하세요');
    await this.loadGis();
    const firstTime = !this.auth;
    await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPE,
        callback: (resp) => {
          if (resp.error) return reject(new Error(`구글 로그인 실패: ${resp.error_description || resp.error}`));
          if (!google.accounts.oauth2.hasGrantedAllScopes(resp, GMAIL_SCOPE)) {
            return reject(new Error('메일 정보 보기 권한을 허용해야 해요'));
          }
          this.auth = {
            token: resp.access_token,
            exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
            email: (this.auth && this.auth.email) || '',
          };
          store.set('dash.gmail', this.auth);
          resolve();
        },
        error_callback: (err) => reject(new Error(
          err.type === 'popup_closed' ? '로그인 창을 닫았어요'
            : err.type === 'popup_failed_to_open' ? '팝업이 차단됐어요. 주소창에서 이 사이트의 팝업을 허용하세요'
              : '구글 로그인에 실패했어요',
        )),
      });
      client.requestAccessToken(firstTime ? {} : { prompt: '' });
    });
    await this.load(true);
    if (this.error) throw new Error(this.error);
  },

  disconnect() {
    if (this.auth && this.auth.token && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(this.auth.token, () => {});
    }
    this.auth = null;
    this.data = null;
    this.error = '';
    store.remove('dash.gmail');
    renderGmail();
  },

  async api(path) {
    let res;
    try {
      res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
        headers: { Authorization: `Bearer ${this.auth.token}` },
        cache: 'no-store',
      });
    } catch {
      throw new Error('Gmail에 연결할 수 없어요');
    }
    if (res.status === 401) {
      this.auth.exp = 0;
      store.set('dash.gmail', this.auth);
      throw new Error('로그인이 만료됐어요. 다시 연결하세요');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error.message || ''; } catch { /* 무시 */ }
      throw new Error(res.status === 403
        ? `권한 또는 Gmail API 설정 문제예요${detail ? ` (${detail})` : ''}`
        : `Gmail 오류 ${res.status}`);
    }
    return res.json();
  },

  async load(force = false) {
    if (!data.settings.gmail.show || !this.valid) return renderGmail();
    if (this.loading) return;
    if (!force && this.data && Date.now() - this.lastLoad < 4 * 60 * 1000) return renderGmail();
    this.loading = true;
    renderGmail();
    try {
      const [inbox, list, profile] = await Promise.all([
        this.api('labels/INBOX'),
        this.api('messages?labelIds=INBOX&labelIds=UNREAD&maxResults=5'),
        this.auth.email ? null : this.api('profile'),
      ]);
      if (profile) {
        this.auth.email = profile.emailAddress || '';
        store.set('dash.gmail', this.auth);
      }
      const metas = await Promise.all((list.messages || []).map((m) => this.api(
        `messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      )));
      this.data = {
        unread: Number(inbox.threadsUnread) || 0, // Gmail 화면과 같은 '대화' 기준 개수
        messages: metas.map((m) => {
          const hd = Object.fromEntries(((m.payload && m.payload.headers) || []).map((x) => [x.name.toLowerCase(), x.value]));
          return {
            thread: m.threadId,
            from: senderName(hd.from || ''),
            subject: (hd.subject || '').trim() || '(제목 없음)',
            time: Number(m.internalDate) || 0,
          };
        }),
      };
      this.error = '';
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
      this.lastLoad = Date.now();
      renderGmail();
    }
  },
};

/** '홍길동 <hong@example.com>' → '홍길동' */
function senderName(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return m[1].trim() || m[2];
  return from.trim() || '(보낸 사람 없음)';
}

function mailTime(ms) {
  const d = new Date(ms);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days === 0) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (days === 1) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function gmailUrl(thread) {
  const user = Gmail.auth && Gmail.auth.email ? `?authuser=${encodeURIComponent(Gmail.auth.email)}` : '';
  return `https://mail.google.com/mail/${user}#inbox${thread ? `/${encodeURIComponent(thread)}` : ''}`;
}

async function onGmailConnectClick(msgEl) {
  try {
    await Gmail.connect();
    if (msgEl) setMsg(msgEl, `${Gmail.auth.email || 'Gmail'}에 연결됐어요`, 'ok');
  } catch (err) {
    Gmail.error = err.message;
    renderGmail();
    if (msgEl) setMsg(msgEl, err.message, 'err');
  }
  if ($('#settingsDlg').open) fillGmailSettings();
}

function renderGmail() {
  const g = data.settings.gmail;
  const box = $('#gmail');
  const unread = Gmail.valid && Gmail.data ? Gmail.data.unread : 0;

  // Gmail 즐겨찾기 아이콘에 안 읽은 수 배지
  document.querySelectorAll('#grid a.tile[data-mail] .mail-count').forEach((c) => {
    c.textContent = unread > 99 ? '99+' : String(unread);
    c.hidden = !(g.show && unread > 0);
  });

  if (!g.show) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!g.clientId) {
    // 이 브라우저에 아직 클라이언트 ID가 없음 → 설정으로 안내
    box.replaceChildren(
      h('div', { class: 'gm-head' }, h('span', { class: 'gm-title' }, 'Gmail')),
      h('div', { class: 'gm-empty' },
        h('span', {}, 'OAuth 클라이언트 ID를 넣고 연결하면 새 메일이 여기에 보여요.'),
        h('button', { type: 'button', class: 'gm-connect', onclick: openGmailSettings }, 'Gmail 연결 설정')),
    );
    return;
  }
  const blank = data.settings.newTab ? { target: '_blank', rel: 'noopener' } : {};

  const head = h('div', { class: 'gm-head' },
    h('a', { class: 'gm-title', href: gmailUrl(), ...blank }, 'Gmail'),
    Gmail.valid && Gmail.data
      ? h('span', { class: 'gm-count' + (unread ? ' has' : '') }, unread ? `안 읽은 메일 ${unread}` : '안 읽은 메일 없음')
      : null,
    h('span', { class: 'spacer' }),
    Gmail.valid
      ? h('button', { type: 'button', class: 'gm-refresh', title: '새로고침', 'aria-label': '메일 새로고침', disabled: Gmail.loading, onclick: () => Gmail.load(true), html: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>' })
      : null);

  let body;
  if (!Gmail.valid) {
    body = h('div', { class: 'gm-empty' },
      h('span', {}, Gmail.auth ? '로그인이 만료됐어요.' : '구글 계정을 연결하면 새 메일이 여기에 보여요.'),
      h('button', { type: 'button', class: 'gm-connect', onclick: () => onGmailConnectClick(null) }, Gmail.auth ? '다시 연결' : 'Gmail 연결'));
  } else if (!Gmail.data) {
    body = h('div', { class: 'gm-empty' }, Gmail.loading ? '메일을 불러오는 중…' : '');
  } else if (!Gmail.data.messages.length) {
    body = h('div', { class: 'gm-empty' }, '받은편지함에 안 읽은 메일이 없어요');
  } else {
    body = h('div', { class: 'gm-list' }, Gmail.data.messages.map((m) => h('a', {
      class: 'gm-row',
      href: gmailUrl(m.thread),
      title: `${m.from}\n${m.subject}`,
      ...blank,
    }, h('span', { class: 'gm-from' }, m.from), h('span', { class: 'gm-subject' }, m.subject), h('span', { class: 'gm-time' }, mailTime(m.time)))));
  }
  // 만료 안내는 본문에 이미 있으니 오류 줄은 생략
  const showError = Gmail.error && !(Gmail.auth && !Gmail.valid && /만료/.test(Gmail.error));
  box.replaceChildren(...[head, body, showError ? h('p', { class: 'gm-error' }, Gmail.error) : null].filter(Boolean));
}

function openGmailSettings() {
  openSettings();
  $('#gmailSection').scrollIntoView({ block: 'start' });
  $('#gmailForm').elements.clientId.focus();
}

function fillGmailSettings() {
  const g = data.settings.gmail;
  const f = $('#gmailForm');
  $('#showGmail').checked = g.show;
  if (document.activeElement !== f.elements.clientId) f.elements.clientId.value = g.clientId;
  $('#gmailConnect').textContent = Gmail.valid ? '다시 연결' : '연결';
  $('#gmailDisconnect').hidden = !Gmail.auth;
  const msg = $('#gmailMsg');
  if (Gmail.valid) setMsg(msg, `${Gmail.auth.email || 'Gmail'}에 연결됨`, 'ok');
  else if (Gmail.auth) setMsg(msg, '로그인이 만료됐어요. "다시 연결"을 누르세요');
  else setMsg(msg, '');
}

async function onGmailSubmit(e) {
  e.preventDefault();
  const id = e.currentTarget.elements.clientId.value.trim();
  const msg = $('#gmailMsg');
  if (!id) return setMsg(msg, 'Google Cloud에서 만든 OAuth 클라이언트 ID를 입력하세요', 'err');
  if (!CLIENT_ID_RE.test(id)) {
    return setMsg(msg, '클라이언트 ID는 "….apps.googleusercontent.com"으로 끝나야 해요', 'err');
  }
  if (id !== data.settings.gmail.clientId) {
    if (Gmail.auth) Gmail.disconnect(); // 다른 앱으로 바뀌면 이전 로그인은 끊음
    commit(() => { data.settings.gmail.clientId = id; });
  }
  setMsg(msg, '구글 로그인 창에서 계정을 고르고 허용하세요…');
  await onGmailConnectClick(msg);
}

/* ---------- 검색 ---------- */
function clearSearch() {
  $('#q').value = '';
  query = '';
}

const looksLikeUrl = (s) => /^https?:\/\//i.test(s) || /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s);

function go(url) {
  if (data.settings.newTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
}

/* ---------- 토스트 ---------- */
let toastTimer = null;
function toast(message, action) {
  const t = $('#toast');
  const hide = () => {
    t.classList.remove('show');
    setTimeout(() => { if (!t.classList.contains('show')) t.hidden = true; }, 200);
  };
  t.replaceChildren(h('span', {}, message));
  if (action) t.append(h('button', { type: 'button', onclick: () => { hide(); action.run(); } }, action.label));
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 6000 : 3500);
}

/* ---------- 확인 창 ---------- */
function ask(title, message, buttons) {
  const dlg = $('#askDlg');
  $('#askTitle').textContent = title;
  $('#askMsg').textContent = message;
  $('#askActions').replaceChildren(...buttons.map((b) => h('button', { value: b.value, class: b.kind || null }, b.label)));
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true }));
}

/* ---------- 즐겨찾기 추가/수정/삭제 ---------- */
let editingItemId = null;

function openItemDialog(id) {
  const f = $('#itemForm');
  const loc = id ? findItem(id) : null;
  editingItemId = loc ? id : null;
  $('#itemTitle').textContent = loc ? '즐겨찾기 수정' : '즐겨찾기 추가';
  f.elements.url.value = loc ? loc.item.url : '';
  f.elements.title.value = loc ? loc.item.name : '';
  f.elements.icon.value = loc ? loc.item.icon : '';
  f.elements.url.removeAttribute('aria-invalid');
  $('#iconDetails').open = !!(loc && loc.item.icon);
  const sel = f.elements.group;
  sel.replaceChildren(...data.groups.map((g) => h('option', { value: g.id }, g.name)));
  sel.value = loc ? loc.group.id : currentGroup().id;
  $('#itemDelete').hidden = !loc;
  $('#itemDlg').showModal();
  (loc ? f.elements.title : f.elements.url).focus();
}

function saveItemForm(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const url = safeUrl(f.elements.url.value);
  if (!url) {
    f.elements.url.setAttribute('aria-invalid', 'true');
    f.elements.url.focus();
    return;
  }
  const iconRaw = f.elements.icon.value.trim();
  const icon = iconRaw ? safeUrl(iconRaw) || '' : '';
  const name = f.elements.title.value.trim() || hostOf(url);
  const target = data.groups.find((g) => g.id === f.elements.group.value) || currentGroup();
  commit(() => {
    const loc = editingItemId && findItem(editingItemId);
    if (loc) {
      Object.assign(loc.item, { name, url, icon });
      if (loc.group !== target) {
        loc.group.items.splice(loc.index, 1);
        target.items.push(loc.item);
      }
    } else {
      target.items.push({ id: uid(), name, url, icon });
    }
  });
  $('#itemDlg').close();
}

function deleteItem(id) {
  const loc = findItem(id);
  if (!loc) return;
  const { group, index, item } = loc;
  commit(() => group.items.splice(index, 1));
  toast(`'${item.name}' 삭제됨`, {
    label: '되돌리기',
    run: () => {
      const g = data.groups.find((x) => x.id === group.id) || data.groups[0];
      commit(() => g.items.splice(Math.min(index, g.items.length), 0, item));
    },
  });
}

/* ---------- 그룹 ---------- */
let editingGroupId = null;

function openGroupDialog(g) {
  const f = $('#groupForm');
  editingGroupId = g ? g.id : null;
  $('#groupTitle').textContent = g ? '그룹 수정' : '그룹 추가';
  f.elements.title.value = g ? g.name : '';
  f.elements.title.removeAttribute('aria-invalid');
  $('#groupDelete').hidden = !g;
  $('#groupDlg').showModal();
  f.elements.title.focus();
}

function saveGroupForm(e) {
  e.preventDefault();
  const input = e.currentTarget.elements.title;
  const name = input.value.trim();
  if (!name) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  commit(() => {
    const g = editingGroupId && data.groups.find((x) => x.id === editingGroupId);
    if (g) g.name = name;
    else {
      const ng = { id: uid(), name, items: [] };
      data.groups.push(ng);
      ui.group = ng.id;
      saveUi();
    }
  });
  $('#groupDlg').close();
}

async function deleteGroup() {
  const index = data.groups.findIndex((x) => x.id === editingGroupId);
  if (index < 0) return;
  const g = data.groups[index];
  if (data.groups.length === 1) {
    $('#groupDlg').close();
    toast('마지막 그룹은 삭제할 수 없어요');
    return;
  }
  if (g.items.length) {
    const ok = await ask('그룹 삭제', `'${g.name}' 그룹과 안에 있는 즐겨찾기 ${g.items.length}개를 삭제할까요?`, [
      { value: '', label: '취소' },
      { value: 'yes', label: '삭제', kind: 'primary' },
    ]);
    if (ok !== 'yes') return;
  }
  $('#groupDlg').close();
  commit(() => {
    data.groups.splice(index, 1);
    ui.group = data.groups[Math.max(0, index - 1)].id;
    saveUi();
  });
  toast(`'${g.name}' 그룹 삭제됨`, {
    label: '되돌리기',
    run: () => commit(() => {
      data.groups.splice(Math.min(index, data.groups.length), 0, g);
      ui.group = g.id;
      saveUi();
    }),
  });
}

/* ---------- 드래그로 순서 바꾸기 (마우스·터치 공용) ---------- */
let drag = null;
let suppressClick = false;

function setDropTab(tab) {
  document.querySelectorAll('.tab.drop-target').forEach((t) => t !== tab && t.classList.remove('drop-target'));
  if (tab) tab.classList.add('drop-target');
  if (drag) drag.tab = tab;
}

function onPointerDown(e) {
  if (!editMode || e.button !== 0) return;
  const tile = e.target.closest('a.tile[data-id]');
  if (!tile || e.target.closest('.badge')) return;
  drag = { id: tile.dataset.id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, moved: false, tab: null };
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    const tile = $(`#grid [data-id="${CSS.escape(drag.id)}"]`);
    if (!tile) { drag = null; return; }
    const r = tile.getBoundingClientRect();
    drag.active = true;
    drag.dx = drag.x0 - r.left;
    drag.dy = drag.y0 - r.top;
    drag.ghost = tile.cloneNode(true);
    drag.ghost.classList.add('ghost');
    drag.ghost.style.width = `${r.width}px`;
    document.body.append(drag.ghost);
    tile.classList.add('placeholder');
    document.body.classList.add('dragging');
  }
  e.preventDefault();
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const src = findItem(drag.id);
  const tab = under && under.closest('.tab[data-group]');
  setDropTab(tab && tab.dataset.group !== src.group.id ? tab : null);

  const over = under && under.closest('#grid a.tile[data-id]');
  if (over && over.dataset.id !== drag.id) {
    const dst = findItem(over.dataset.id);
    if (dst && dst.group === src.group) {
      src.group.items.splice(src.index, 1);
      src.group.items.splice(dst.index, 0, src.item);
      drag.moved = true;
      renderGrid();
    }
  }
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  if (!d.active) return;
  d.ghost.remove();
  document.body.classList.remove('dragging');
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  if (d.tab && e.type === 'pointerup') {
    const target = data.groups.find((g) => g.id === d.tab.dataset.group);
    const src = findItem(d.id);
    if (target && src) {
      src.group.items.splice(src.index, 1);
      target.items.push(src.item);
      d.moved = true;
      toast(`'${target.name}' 그룹으로 옮겼어요`);
    }
  }
  setDropTab(null);
  if (d.moved) commit();
  else renderGrid();
}

/* =========================================================
 *  GitHub 동기화
 *  - 비공개 저장소의 JSON 파일 하나를 Contents API로 읽고 씀
 *  - 바뀔 때마다 로컬에 먼저 저장하고, 잠시 뒤 GitHub에 올림
 *  - 다른 기기에서 바뀐 내용은 페이지를 다시 볼 때 불러옴
 * ========================================================= */
const STATUS_LABEL = {
  local: '이 기기에만 저장',
  pending: '저장 대기',
  syncing: '동기화 중…',
  ok: '동기화됨',
  offline: '오프라인 · 연결되면 저장',
  error: '동기화 오류',
};

function explain(status, message) {
  if (status === 401) return '토큰이 올바르지 않거나 만료됐어요';
  if (status === 403) {
    return /rate limit/i.test(message)
      ? 'GitHub 요청 한도를 넘었어요. 잠시 후 다시 시도하세요'
      : '토큰 권한이 부족해요 (Contents: Read and write 필요)';
  }
  if (status === 404) return '저장소를 찾을 수 없어요 (사용자명·저장소 이름·토큰 접근 범위 확인)';
  if (status === 409 || status === 422) return '다른 기기의 저장과 겹쳤어요';
  return `GitHub 오류 ${status}${message ? `: ${message}` : ''}`;
}

const Sync = {
  cfg: store.get(KEY.sync, null), // { owner, repo, branch, path }
  token: null,
  sha: store.get(KEY.sha, null),
  dirty: !!store.get(KEY.dirty, false),
  rev: 0,
  busy: false,
  again: false,
  timer: null,
  lastRun: 0,
  state: 'local',
  detail: '',

  get enabled() { return !!(this.cfg && this.token); },

  loadToken() {
    try { return localStorage.getItem(KEY.token) || sessionStorage.getItem(KEY.token) || null; } catch { return null; }
  },
  saveToken(token, remember) {
    try {
      localStorage.removeItem(KEY.token);
      sessionStorage.removeItem(KEY.token);
      (remember ? localStorage : sessionStorage).setItem(KEY.token, token);
    } catch { /* 무시 */ }
  },

  setState(state, detail = '') {
    this.state = state;
    this.detail = detail;
    renderStatus();
  },
  setDirty(v) {
    this.dirty = v;
    store.set(KEY.dirty, v);
  },

  /** 로컬 데이터가 바뀌었을 때 */
  changed() {
    if (!this.enabled) return;
    this.rev++;
    this.setDirty(true);
    this.setState(navigator.onLine ? 'pending' : 'offline');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), 1200);
  },

  async run() {
    if (!this.enabled) { this.setState('local'); return; }
    if (this.busy) { this.again = true; return; }
    if (!navigator.onLine) { this.setState('offline'); return; }
    clearTimeout(this.timer);
    this.busy = true;
    this.setState('syncing');
    try {
      if (this.dirty) await this.push();
      else await this.pull();
      this.lastRun = Date.now();
      this.setState(this.dirty ? 'pending' : 'ok');
    } catch (err) {
      this.setState(err.status === 0 && !navigator.onLine ? 'offline' : 'error', err.message);
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.run(); }
    }
  },

  headers(json) {
    const hd = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}` };
    if (json) hd['Content-Type'] = 'application/json';
    return hd;
  },
  repoUrl() {
    return `https://api.github.com/repos/${encodeURIComponent(this.cfg.owner)}/${encodeURIComponent(this.cfg.repo)}`;
  },
  fileUrl() {
    const path = this.cfg.path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `${this.repoUrl()}/contents/${path}`;
  },

  async request(url, options = {}) {
    let res;
    try {
      res = await fetch(url, { cache: 'no-store', ...options });
    } catch {
      throw Object.assign(new Error('네트워크에 연결할 수 없어요'), { status: 0 });
    }
    if (!res.ok) {
      let message = '';
      try { message = (await res.json()).message || ''; } catch { /* 무시 */ }
      throw Object.assign(new Error(explain(res.status, message)), { status: res.status });
    }
    return res.json();
  },

  /** 원격 파일 읽기. 파일이 아직 없으면 null */
  async get() {
    let j;
    try {
      j = await this.request(`${this.fileUrl()}?ref=${encodeURIComponent(this.cfg.branch)}`, { headers: this.headers() });
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
    if (Array.isArray(j) || j.type !== 'file') throw new Error('파일 경로가 폴더를 가리키고 있어요');
    if (!j.content) throw new Error('데이터 파일이 너무 커요 (1MB 초과)');
    let parsed;
    try {
      parsed = sanitize(JSON.parse(fromB64(j.content)));
    } catch {
      throw new Error(`${this.cfg.path} 내용이 올바른 대시보드 데이터가 아니에요`);
    }
    return { sha: j.sha, data: parsed };
  },

  /** 원격 파일 쓰기. 새 sha 반환 */
  async put(d, sha) {
    const body = {
      message: '대시보드 업데이트',
      content: toB64(JSON.stringify(d, null, 2) + '\n'),
      branch: this.cfg.branch,
    };
    if (sha) body.sha = sha;
    const j = await this.request(this.fileUrl(), { method: 'PUT', headers: this.headers(true), body: JSON.stringify(body) });
    return j.content.sha;
  },

  rememberSha(sha) {
    this.sha = sha;
    store.set(KEY.sha, sha);
  },

  async push() {
    const rev = this.rev;
    const snapshot = JSON.parse(JSON.stringify(data));
    try {
      this.rememberSha(await this.put(snapshot, this.sha));
    } catch (err) {
      if (err.status !== 409 && err.status !== 422) throw err;
      // 다른 기기가 먼저 저장함 → 최신 버전 위에 이 기기 내용을 저장 (이전 내용은 GitHub 기록에 남음)
      const remote = await this.get();
      if (remote && remote.data.updatedAt === snapshot.updatedAt) {
        this.rememberSha(remote.sha);
      } else {
        this.rememberSha(await this.put(snapshot, remote && remote.sha));
        toast('다른 기기의 변경과 겹쳐서 이 기기 내용으로 저장했어요. 이전 내용은 GitHub 기록에 남아 있어요.');
      }
    }
    if (this.rev === rev) this.setDirty(false);
  },

  async pull() {
    const rev = this.rev;
    const remote = await this.get();
    if (!remote) {
      this.rememberSha(await this.put(data, null)); // 파일이 없으면 새로 만듦
      return;
    }
    this.rememberSha(remote.sha);
    if (this.rev !== rev) return; // 그사이 이 기기에서 수정함 → 다음 push에서 처리
    if (remote.data.updatedAt !== data.updatedAt) replaceData(remote.data);
  },

  /** 설정 창에서 '연결'을 눌렀을 때 */
  async connect({ owner, repo, branch, path, token, remember }) {
    const prev = { cfg: this.cfg, token: this.token };
    this.cfg = { owner, repo, branch, path };
    this.token = token;
    let saved = false;
    try {
      const info = await this.request(this.repoUrl(), { headers: this.headers() });
      if (!info.private) {
        const go = await ask('공개 저장소예요', `${owner}/${repo} 저장소는 공개 상태라서 즐겨찾기 데이터가 누구에게나 보여요. 비공개 저장소를 쓰는 걸 권장해요.`, [
          { value: '', label: '취소' },
          { value: 'yes', label: '그래도 연결', kind: 'primary' },
        ]);
        if (go !== 'yes') throw new Error('연결을 취소했어요');
      }
      const remote = await this.get();
      let choice = 'local';
      if (remote) {
        if (data.updatedAt === EPOCH || remote.data.updatedAt === data.updatedAt) {
          choice = 'remote';
        } else {
          choice = await ask('어떤 데이터를 쓸까요?',
            `GitHub에 즐겨찾기 ${countItems(remote.data)}개가 이미 저장되어 있어요. 이 기기에는 ${countItems(data)}개가 있어요.`, [
              { value: '', label: '취소' },
              { value: 'local', label: '이 기기 데이터로 덮어쓰기' },
              { value: 'remote', label: 'GitHub 데이터 불러오기', kind: 'primary' },
            ]);
          if (!choice) throw new Error('연결을 취소했어요');
        }
      }
      store.set(KEY.sync, this.cfg);
      this.saveToken(token, remember);
      saved = true;
      if (choice === 'remote') {
        this.rememberSha(remote.sha);
        this.setDirty(false);
        replaceData(remote.data);
      } else {
        this.rememberSha(remote ? remote.sha : null);
        this.setDirty(true);
      }
      await this.run();
      if (this.state === 'error') throw new Error(this.detail);
    } catch (err) {
      if (!saved) {
        this.cfg = prev.cfg;
        this.token = prev.token;
      }
      throw err;
    }
  },

  disconnect() {
    this.cfg = null;
    this.token = null;
    this.rememberSha(null);
    this.setDirty(false);
    store.remove(KEY.sync);
    try { localStorage.removeItem(KEY.token); sessionStorage.removeItem(KEY.token); } catch { /* 무시 */ }
    this.setState('local');
  },
};

function renderStatus() {
  const btn = $('#status');
  btn.dataset.state = Sync.state;
  $('#statusText').textContent = STATUS_LABEL[Sync.state];
  btn.title = Sync.detail || (Sync.enabled ? `${Sync.cfg.owner}/${Sync.cfg.repo} · ${Sync.cfg.path}` : '설정에서 GitHub 동기화를 켤 수 있어요');
}

/* ---------- 설정 창 ---------- */
function setMsg(el, text, kind) {
  el.textContent = text;
  el.className = 'msg' + (kind ? ` ${kind}` : '');
}

function fillSettings() {
  $('#newTab').checked = data.settings.newTab;
  $('#showMarket').checked = data.settings.showMarket;
  fillClockSettings();
  fillGmailSettings();
  setMsg($('#ddayMsg'), '');
  fillDdaySettings();
  setMsg($('#weatherMsg'), '');
  $('#weatherResults').replaceChildren();
  fillWeatherSettings();
  const f = $('#syncForm');
  if (Sync.cfg) {
    for (const k of ['owner', 'repo', 'branch', 'path']) f.elements[k].value = Sync.cfg[k];
  }
  f.elements.token.value = '';
  f.elements.token.placeholder = Sync.token ? '저장됨 · 바꿀 때만 입력' : 'github_pat_…';
  $('#connectBtn').textContent = Sync.enabled ? '다시 연결' : '연결';
  $('#syncNowBtn').hidden = !Sync.enabled;
  $('#disconnectBtn').hidden = !Sync.enabled;
  if (Sync.state === 'error') setMsg($('#syncMsg'), Sync.detail, 'err');
  else if (Sync.enabled) setMsg($('#syncMsg'), `${Sync.cfg.owner}/${Sync.cfg.repo}에 연결됨 · ${STATUS_LABEL[Sync.state]}`, 'ok');
  else setMsg($('#syncMsg'), '');
  setMsg($('#backupMsg'), '');
}

function openSettings() {
  fillSettings();
  $('#settingsDlg').showModal();
}

async function onConnect(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = (k) => f.elements[k].value.trim();
  const cfg = {
    owner: v('owner'),
    repo: v('repo'),
    branch: v('branch') || 'main',
    path: v('path').replace(/^\/+/, '') || 'data.json',
    token: v('token') || Sync.token,
    remember: f.elements.remember.checked,
  };
  const msg = $('#syncMsg');
  if (!cfg.owner || !cfg.repo) return setMsg(msg, 'GitHub 사용자명과 저장소 이름을 입력하세요', 'err');
  if (!cfg.token) return setMsg(msg, '토큰을 입력하세요', 'err');
  // 일부만 붙여넣어지는 경우가 많아 형식부터 확인 (fine-grained 토큰은 github_pat_로 시작하고 90자 이상)
  if (!/^(github_pat_|ghp_)/.test(cfg.token) || (cfg.token.startsWith('github_pat_') && cfg.token.length < 80)) {
    return setMsg(msg, `토큰이 잘못 붙여넣어진 것 같아요 (지금 ${cfg.token.length}자). github_pat_로 시작하는 90자 정도의 값 전체를 붙여넣으세요`, 'err');
  }
  const btn = $('#connectBtn');
  btn.disabled = true;
  setMsg(msg, '연결하는 중…');
  try {
    await Sync.connect(cfg);
    fillSettings();
    setMsg(msg, `연결됐어요. 이제 ${cfg.owner}/${cfg.repo}의 ${cfg.path}에 저장돼요.`, 'ok');
  } catch (err) {
    setMsg(msg, err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function onSyncNow() {
  const msg = $('#syncMsg');
  setMsg(msg, '동기화하는 중…');
  await Sync.run();
  if (Sync.state === 'error') setMsg(msg, Sync.detail, 'err');
  else setMsg(msg, STATUS_LABEL[Sync.state], Sync.state === 'ok' ? 'ok' : '');
}

async function onDisconnect() {
  const ok = await ask('동기화 연결 해제', '이 기기에서만 연결을 해제해요. 지금 보이는 즐겨찾기와 GitHub의 데이터는 그대로 남아요.', [
    { value: '', label: '취소' },
    { value: 'yes', label: '연결 해제', kind: 'primary' },
  ]);
  if (ok !== 'yes') return;
  Sync.disconnect();
  fillSettings();
  setMsg($('#syncMsg'), '연결을 해제했어요');
}

function exportJson() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `dashboard-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setMsg($('#backupMsg'), '백업 파일을 저장했어요', 'ok');
}

async function importJson(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const msg = $('#backupMsg');
  let next;
  try {
    next = sanitize(JSON.parse(await file.text()));
  } catch {
    return setMsg(msg, '대시보드 백업 파일이 아니에요', 'err');
  }
  const ok = await ask('백업 가져오기', `백업에 즐겨찾기 ${countItems(next)}개가 있어요. 지금 데이터를 이 백업으로 바꿀까요?${Sync.enabled ? ' 연결된 모든 기기에 반영돼요.' : ''}`, [
    { value: '', label: '취소' },
    { value: 'yes', label: '바꾸기', kind: 'primary' },
  ]);
  if (ok !== 'yes') return;
  commit(() => { data = next; });
  setMsg(msg, '백업을 불러왔어요', 'ok');
}

/* ---------- 시작 ---------- */
function init() {
  $('#engine').replaceChildren(...Object.entries(ENGINES).map(([k, v]) => h('option', { value: k }, v.label)));
  $('#engine').addEventListener('change', (e) => commit(() => { data.settings.engine = e.target.value; }));

  $('#q').addEventListener('input', (e) => {
    query = e.target.value.trim();
    renderTabs();
    renderGrid();
  });
  $('#search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (!q) return;
    const direct = looksLikeUrl(q) && safeUrl(q);
    go(direct || ENGINES[data.settings.engine].url + encodeURIComponent(q));
  });

  const grid = $('#grid');
  grid.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); suppressClick = false; return; }
    const tile = e.target.closest('a.tile[data-id]');
    if (!tile || !editMode) return;
    e.preventDefault();
    if (e.target.closest('.badge')) deleteItem(tile.dataset.id);
    else openItemDialog(tile.dataset.id);
  });
  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('dragstart', (e) => e.preventDefault());
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  $('#editBtn').addEventListener('click', () => toggleEdit());
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#status').addEventListener('click', openSettings);

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('#itemForm').addEventListener('submit', saveItemForm);
  $('#itemForm').elements.url.addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));
  $('#itemDelete').addEventListener('click', () => {
    const id = editingItemId;
    $('#itemDlg').close();
    deleteItem(id);
  });
  $('#groupForm').addEventListener('submit', saveGroupForm);
  $('#groupDelete').addEventListener('click', deleteGroup);

  $('#newTab').addEventListener('change', (e) => commit(() => { data.settings.newTab = e.target.checked; }));
  $('#showMarket').addEventListener('change', (e) => commit(() => { data.settings.showMarket = e.target.checked; }));
  $('#showWeather').addEventListener('change', (e) => commit(() => { data.settings.weather.show = e.target.checked; }));
  $('#showAir').addEventListener('change', (e) => commit(() => { data.settings.weather.air = e.target.checked; }));
  $('#ddayForm').addEventListener('submit', addDday);
  $('#showGmail').addEventListener('change', (e) => {
    commit(() => { data.settings.gmail.show = e.target.checked; });
    Gmail.load();
  });
  $('#gmailForm').addEventListener('submit', onGmailSubmit);
  $('#gmailForm').elements.clientId.addEventListener('change', () => Gmail.loadGis().catch(() => {}));
  $('#gmailDisconnect').addEventListener('click', () => {
    Gmail.disconnect();
    fillGmailSettings();
    setMsg($('#gmailMsg'), '이 기기에서 Gmail 연결을 해제했어요');
  });
  $('#clockSeconds').addEventListener('change', (e) => commit(() => { data.settings.clock.seconds = e.target.checked; }));
  $('#clock12').addEventListener('change', (e) => commit(() => { data.settings.clock.h12 = e.target.checked; }));
  $('#weatherForm').addEventListener('submit', searchCity);
  $('#useLocation').addEventListener('click', useMyLocation);
  $('#syncForm').addEventListener('submit', onConnect);
  $('#syncNowBtn').addEventListener('click', onSyncNow);
  $('#disconnectBtn').addEventListener('click', onDisconnect);
  $('#exportBtn').addEventListener('click', exportJson);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', importJson);

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/' && !typing) {
      e.preventDefault();
      $('#q').focus();
    } else if ((e.key === 'e' || e.key === 'E' || e.key === 'ㄷ') && !typing) {
      toggleEdit();
    } else if (e.key === 'Escape' && editMode && !typing) {
      toggleEdit(false);
    }
  });

  // 다른 탭에서 바꾼 내용 반영
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY.data || !e.newValue) return;
    try { data = sanitize(JSON.parse(e.newValue)); render(); } catch { /* 무시 */ }
  });

  // 다른 기기에서 바꾼 내용은 이 화면으로 돌아올 때 불러옴
  const refresh = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - Sync.lastRun > 15000) Sync.run();
    if (Date.now() - Market.lastLoad > 3 * 60 * 1000) Market.load();
    if (Date.now() - Weather.lastLoad > 15 * 60 * 1000) Weather.load();
    if (Date.now() - Gmail.lastLoad > 5 * 60 * 1000) Gmail.load();
  };
  setInterval(refresh, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && Sync.dirty) Sync.run();
    else refresh();
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('online', () => Sync.run());
  window.addEventListener('offline', () => { if (Sync.enabled) Sync.setState('offline'); });

  tick();
  setInterval(tick, 1000);
  render();
  Market.load();
  Weather.load();
  Gmail.load();
  // 로그인 버튼을 눌렀을 때 팝업이 바로 뜨도록 미리 불러둠
  if (data.settings.gmail.show && data.settings.gmail.clientId) Gmail.loadGis().catch(() => {});

  Sync.token = Sync.loadToken();
  if (Sync.enabled) {
    Sync.setState(Sync.dirty ? 'pending' : 'syncing');
    Sync.run();
  } else {
    Sync.setState('local');
  }

  if (matchMedia('(pointer: fine)').matches) $('#q').focus();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
  }
}

init();
