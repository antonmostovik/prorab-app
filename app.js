'use strict';
/**
 * Прораб — мини-приложение Telegram. Данные объекта приходят одним запросом (boot),
 * дальше выбор работ, поиск и объёмы работают в телефоне; сервер нужен только на «Отправить».
 */
(function () {
  const WA = window.Telegram && window.Telegram.WebApp;
  const tg = WA && WA.initData ? WA : null;
  const DEMO = /[?&]demo\b/.test(location.search);
  const API = window.PRORAB_CONFIG.api;
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  const S = { screen: 'loading', d: null, msg: '', r: null, busy: false };

  // ---------- Мелочи

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round = x => Math.round(x * 1000) / 1000;
  const num = x => String(Math.round(x * 100) / 100).replace('.', ',');
  const parseNum = s => {
    const n = Number(String(s).replace(/\s/g, '').replace(',', '.'));
    return String(s).trim() !== '' && isFinite(n) ? n : NaN;
  };
  const pct = x => Math.round((x || 0) * 100) + '%';
  const isoAdd = (iso, n) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = iso => {
    const d = new Date(iso + 'T00:00:00Z');
    return cap(WD[d.getUTCDay()]) + ', ' + d.getUTCDate() + ' ' + MG[d.getUTCMonth()];
  };
  const shortDate = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7);
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many);
  };
  const haptic = kind => {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === 'ok') tg.HapticFeedback.notificationOccurred('success');
      else if (kind === 'err') tg.HapticFeedback.notificationOccurred('error');
      else tg.HapticFeedback.selectionChanged();
    } catch (e) { /* старые клиенты Telegram */ }
  };
  let toastTimer = null;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  const I = {
    arrow: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    photo: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D5FD0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    box: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D5FD0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
    clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B6470" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  };

  // ---------- Сервер

  async function api(action, payload) {
    if (DEMO) {
      await new Promise(res => setTimeout(res, action === 'boot' ? 400 : 700));
      const role = (location.search.match(/demo=(\w+)/) || [])[1];
      const pick = role === 'manager' ? window.PRORAB_DEMO_MANAGER : role === 'pto' ? window.PRORAB_DEMO_PTO : window.PRORAB_DEMO;
      if (action === 'boot') return JSON.parse(JSON.stringify(pick));
      if (action === 'ksg') return JSON.parse(JSON.stringify(window.PRORAB_DEMO_KSG));
      if (action === 'remind') return { ok: true, sent: 2, names: ['Белов А.', 'Захаров М.'] };
      return { ok: true };
    }
    const res = await fetch(API + '?api=1', {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: action, initData: tg ? tg.initData : '' }, payload || {})),
    });
    if (!res.ok) throw new Error('Сервер не ответил (' + res.status + '). Попробуйте ещё раз.');
    const data = await res.json();
    if (!data.ok) {
      const err = new Error(data.message || 'Не получилось.');
      err.code = data.error;
      throw err;
    }
    return data;
  }

  async function boot() {
    S.screen = 'loading';
    render();
    try {
      S.d = await api('boot');
      S.screen = ROLE_HOME[S.d.role] || 'other';
    } catch (e) {
      S.screen = 'error';
      S.msg = e.message || 'Нет связи с сервером.';
    }
    render();
  }

  // ---------- Работы и разделы КСГ

  const left = w => round(w.plan - w.fact);
  const isNow = (w, date) => w.recent || (w.start && w.end && w.start <= date && date <= w.end);

  function parentOf(code) {
    const parts = code.split('.');
    for (let k = parts.length - 1; k > 0; k--) {
      const p = parts.slice(0, k).join('.');
      if (S.d.sections[p] || p === S.d.top) return p;
    }
    return S.d.top || '';
  }
  function children(node) {
    return {
      sections: Object.keys(S.d.sections).filter(c => c !== node && parentOf(c) === node),
      works: S.d.works.filter(w => parentOf(w.id) === node),
    };
  }
  const openUnder = code => S.d.works.filter(w => w.id.indexOf(code + '.') === 0).length;
  const passThrough = node => {
    const ch = children(node);
    return ch.sections.length === 1 && !ch.works.length;
  };
  function descend(node) {
    while (passThrough(node)) node = children(node).sections[0];
    return node;
  }
  function up(node) {
    let p = parentOf(node);
    while (p !== (S.d.top || '') && passThrough(p)) p = parentOf(p);
    return p;
  }
  const sectionName = code => S.d.sections[parentOf(code)] || '';
  const workById = id => S.d.works.find(w => w.id === id);

  // ---------- Черновик отчёта: переживает случайное закрытие приложения

  const draftKey = () => 'prorab:' + S.d.object;
  function saveDraft() {
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), r: S.r }));
    } catch (e) { /* приватный режим */ }
  }
  function loadDraft() {
    try {
      const x = JSON.parse(localStorage.getItem(draftKey()) || 'null');
      if (x && Date.now() - x.at < 12 * 3600e3) return x.r;
    } catch (e) { /* нет доступа */ }
    return null;
  }
  function dropDraft() {
    try {
      localStorage.removeItem(draftKey());
    } catch (e) { /* нет доступа */ }
  }

  function newReport() {
    const hour = new Date().getHours();
    return {
      date: hour < 6 ? isoAdd(S.d.today, -1) : S.d.today,
      shift: hour >= 8 && hour < 20 ? 'day' : 'night',
      tab: 'now', node: '', q: '', vol: {}, extras: [], xf: null, people: '', comment: '',
    };
  }
  const chosen = () => Object.keys(S.r.vol).filter(id => S.r.vol[id] > 0 && workById(id));
  const count = () => chosen().length + S.r.extras.length;
  const stepOf = w => {
    const l = left(w);
    return l >= 200 ? 10 : l >= 20 ? 1 : l >= 2 ? 0.5 : 0.1;
  };

  function setVol(id, v) {
    const w = workById(id);
    if (!w) return;
    const l = left(w);
    if (v > l) {
      toast('Больше остатка нельзя: по этой работе осталось ' + num(l) + ' ' + w.unit + '.');
      haptic('err');
      v = l;
    }
    S.r.vol[id] = Math.max(0, round(v));
    saveDraft();
  }

  // ---------- Экраны

  // Экран → его рисующая функция; экраны руководителя и ПТО добавляет office.js.
  const screens = {};
  // Куда ведёт «Назад» (кнопка Telegram) с экрана.
  const parents = { report: 'home', finish: 'report' };
  const ROLE_HOME = { foreman: 'home', manager: 'm-home', pto: 'p-check' };

  function render() {
    app.innerHTML = screens[S.screen]();
    bottomCache = S.screen === 'report' ? bottomHtml() : S.screen === 'finish' ? finishBottomHtml() : '';
    syncTelegram();
  }

  function syncTelegram() {
    if (!tg) return;
    const sub = !!parents[S.screen];
    try {
      if (sub) tg.BackButton.show();
      else tg.BackButton.hide();
      if (S.r && count() && sub) tg.enableClosingConfirmation();
      else tg.disableClosingConfirmation();
    } catch (e) { /* старые клиенты Telegram */ }
  }

  const viewLoading = () => '<div class="screen"><div class="center"><div class="spinner" aria-hidden="true"></div><p>Загружаю данные объекта…</p></div></div>';

  function viewError() {
    return '<div class="screen"><div class="center"><h2>Не получилось открыть</h2><p>' + esc(S.msg) + '</p>' +
      '<button class="btn dark" style="padding:0 24px" data-act="retry">Попробовать ещё раз</button></div></div>';
  }

  function viewOther() {
    return '<div class="screen"><div class="center"><h2>Здравствуйте, ' + esc(S.d.name) + '</h2><p>' + esc(S.d.message) + '</p></div></div>';
  }

  /**
   * Как обращаться: «Фамилия Имя Отчество» → «Имя Отчество», «Фамилия Имя» → «Имя».
   * Имя руководителя и ПТО берётся из Telegram («Имя Фамилия») — тогда первое слово.
   */
  function callName(name, nameFirst) {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (w.length >= 3) return w[1] + ' ' + w[2];
    if (w.length === 2 && /(вич|вна|ична|чна)$/i.test(w[1])) return w[0] + ' ' + w[1];
    if (w.length === 2) return nameFirst ? w[0] : w[1];
    return w[0] || '';
  }
  function hello() {
    const h = new Date().getHours();
    return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 17 ? 'Добрый день' : h < 23 ? 'Добрый вечер' : 'Доброй ночи';
  }

  function viewHome() {
    const d = S.d;
    const gap = d.progress.fact - d.progress.plan;
    const status = gap < -0.15 ? ['Отстаёт', 'behind'] : gap < -0.05 ? ['Риск', 'behind'] : ['В графике', 'ok'];
    const today = d.works.filter(w => isNow(w, d.today));

    const list = today.slice(0, 4).map(w =>
      '<div class="prog"><div class="prog-top"><span>' + esc(w.name) + '</span><span>осталось ' + num(left(w)) + ' ' + esc(w.unit) + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.min(100, Math.round(w.fact / w.plan * 100)) + '%"></i></div></div>').join('');

    let req = '';
    if (d.lastRequest) {
      const r = d.lastRequest;
      const kind = r.status === 'Согласована' ? 'blue' : r.status === 'Отклонена' ? 'orange' : 'gray';
      const icon = kind === 'gray' ? I.clock : I.check;
      req = '<div class="notice ' + kind + '">' + icon + '<span>Заявка №' + r.num + ' — ' + esc(String(r.status).toLowerCase()) + ': ' +
        esc(r.items.slice(0, 2).join(', ')) + (r.items.length > 2 ? ' и ещё ' + (r.items.length - 2) : '') +
        (r.needBy ? ', к ' + esc(r.needBy.slice(0, 5)) : '') + '</span></div>';
    }

    return '<div class="screen"><div class="pad">' +
      '<div class="hello"><small>' + longDate(d.today) + '</small><h1>' + hello() + ', ' + esc(callName(d.name)) + '</h1></div>' +
      '<div class="obj"><div class="obj-head"><div><div class="obj-kicker">' + (d.top ? 'Объект ' + esc(d.top) : 'Объект') + '</div>' +
      '<div class="obj-name">' + esc(d.object) + '</div></div><span class="chip ' + status[1] + '">' + status[0] + '</span></div>' +
      '<div class="obj-nums"><div><div class="big">' + pct(d.progress.fact) + '</div><small>готовность по факту</small></div>' +
      '<div><div class="mid">' + pct(d.progress.plan) + '</div><small>по графику</small></div></div>' +
      '<div class="obj-bar"><i style="width:' + pct(Math.min(1, d.progress.fact)) + '"></i><b style="left:' + pct(Math.min(1, d.progress.plan)) + '"></b></div></div>' +
      '<button class="cta" data-act="report"><span><strong>Сдать отчёт за смену</strong><small>' +
      (d.reportedToday ? 'Сегодня уже отправлен — можно дополнить' : 'Сегодня ещё не отправлен') + '</small></span>' + I.arrow + '</button>' +
      '<div class="tiles"><button class="tile" data-act="flow" data-flow="photo">' + I.photo + 'Фото</button>' +
      '<button class="tile" data-act="flow" data-flow="request">' + I.box + 'Заявка</button></div>' +
      '<div class="card"><div class="card-head"><strong>По графику сегодня</strong><span>' + plural(today.length, 'работа', 'работы', 'работ') + '</span></div>' +
      (list || '<div class="empty">На сегодня по графику работ нет. В отчёте их можно найти в разделах КСГ.</div>') + '</div>' +
      req + '</div></div>';
  }

  // ---------- Отчёт: выбор работ

  function viewReport() {
    const r = S.r;
    const yest = isoAdd(S.d.today, -1);
    const other = r.date !== S.d.today && r.date !== yest;
    const min = isoAdd(S.d.today, -S.d.backDays);
    const nowCount = S.d.works.filter(w => isNow(w, r.date)).length;
    return '<div class="screen">' +
      '<div class="top">' +
      '<div class="row">' +
      '<button class="pill' + (r.date === S.d.today ? ' on' : '') + '" data-act="day" data-day="' + S.d.today + '">Сегодня</button>' +
      '<button class="pill' + (r.date === yest ? ' on' : '') + '" data-act="day" data-day="' + yest + '">Вчера</button>' +
      '<label class="pill' + (other ? ' on' : '') + '">' + (other ? shortDate(r.date) : 'Дата…') +
      '<input type="date" data-date min="' + min + '" max="' + S.d.today + '" value="' + r.date + '" aria-label="Другая дата"></label>' +
      '</div>' +
      '<div class="seg" role="group" aria-label="Смена">' +
      '<button class="' + (r.shift === 'day' ? 'on' : '') + '" data-act="shift" data-v="day" aria-pressed="' + (r.shift === 'day') + '">' + I.sun + 'День</button>' +
      '<button class="' + (r.shift === 'night' ? 'on' : '') + '" data-act="shift" data-v="night" aria-pressed="' + (r.shift === 'night') + '">' + I.moon + 'Ночь</button></div>' +
      '<label class="search">' + I.search + '<span class="sr">Поиск работы</span>' +
      '<input type="search" data-q placeholder="Название или код работы" value="' + esc(r.q) + '" autocomplete="off"></label>' +
      '<div class="seg" role="tablist">' +
      '<button class="' + (r.tab === 'now' ? 'on' : '') + '" data-act="tab" data-v="now" role="tab" aria-selected="' + (r.tab === 'now') + '">По графику · ' + nowCount + '</button>' +
      '<button class="' + (r.tab === 'tree' ? 'on' : '') + '" data-act="tab" data-v="tree" role="tab" aria-selected="' + (r.tab === 'tree') + '">' + (S.d.top ? 'Все разделы' : 'Все работы') + '</button></div>' +
      '</div>' +
      '<div class="list" id="list">' + listHtml() + '</div>' +
      '<div class="bottom" id="bottom">' + bottomHtml() + '</div>' +
      '</div>';
  }

  function workHtml(w) {
    const v = S.r.vol[w.id] || 0;
    const sec = sectionName(w.id);
    const ctl = v > 0
      ? '<div class="step"><button data-act="dec" data-id="' + esc(w.id) + '" aria-label="Меньше">−</button>' +
        '<label><span class="sr">Объём, ' + esc(w.unit) + '</span><input inputmode="decimal" data-vol="' + esc(w.id) + '" value="' + num(v) + '">' +
        '<small>' + esc(w.unit) + '</small></label>' +
        '<button data-act="inc" data-id="' + esc(w.id) + '" aria-label="Больше">+</button></div>'
      : '<button class="add" data-act="inc" data-id="' + esc(w.id) + '">+ Внести</button>';
    return '<div class="work' + (v > 0 ? ' on' : '') + '"><div class="work-info">' +
      '<span class="work-code">' + esc(w.id) + (sec ? ' · ' + esc(sec) : '') + '</span>' +
      '<span class="work-name">' + esc(w.name) + '</span>' +
      '<span class="work-left">осталось <b>' + num(left(w)) + '</b> из ' + num(w.plan) + ' ' + esc(w.unit) + '</span></div>' + ctl + '</div>';
  }

  function extrasHtml() {
    return S.r.extras.map((x, i) =>
      '<div class="work on"><div class="work-info"><span class="work-code">Вне КСГ</span><span class="work-name">' + esc(x.name) + '</span>' +
      '<span class="work-left"><b>' + num(x.volume) + ' ' + esc(x.unit) + '</b></span></div>' +
      '<button class="x" data-act="extra-del" data-i="' + i + '" aria-label="Убрать">✕</button></div>').join('');
  }

  const UNITS = ['м3', 'м2', 'м', 'п.м', 'т', 'кг', 'шт', 'компл', 'ч', 'т*км'];

  function extraFormHtml() {
    const f = S.r.xf;
    if (!f) return '<button class="ghost" data-act="extra-open">+ Работы нет в КСГ</button>';
    return '<div class="form"><strong>Работа не из КСГ</strong>' +
      '<label>Что сделали<input data-x="name" value="' + esc(f.name) + '" placeholder="Например, демонтаж опалубки"></label>' +
      '<div class="grid2"><label>Объём<input data-x="volume" inputmode="decimal" value="' + esc(f.volume) + '"></label>' +
      '<label>Единица<select data-x="unit">' + UNITS.map(u => '<option' + (u === f.unit ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></label></div>' +
      '<div class="tiles"><button class="btn light" data-act="extra-cancel">Отмена</button><button class="btn dark" data-act="extra-add">Добавить</button></div></div>';
  }

  function listHtml() {
    const r = S.r;
    let html = extrasHtml();
    const q = r.q.trim().toLowerCase();
    if (q) {
      const found = S.d.works.filter(w => w.name.toLowerCase().indexOf(q) >= 0 || w.id.indexOf(q) >= 0);
      html += '<div class="hint">Найдено: ' + found.length + (found.length > 60 ? ', показаны первые 60 — уточните запрос' : '') + '</div>';
      html += found.slice(0, 60).map(workHtml).join('');
      if (!found.length) html += '<div class="hint">Ничего не нашлось. Попробуйте часть названия или код, например ' + esc(S.d.works[0] ? S.d.works[0].id : '') + '</div>';
    } else if (r.tab === 'now') {
      const now = S.d.works.filter(w => isNow(w, r.date));
      html += now.length
        ? now.slice(0, 80).map(workHtml).join('')
        : '<div class="hint">На ' + shortDate(r.date) + ' по графику работ нет — откройте «' + (S.d.top ? 'Все разделы' : 'Все работы') + '» или найдите работу поиском.</div>';
    } else {
      const node = descend(r.node || S.d.top || '');
      const ch = children(node);
      if (node && node !== S.d.top) {
        html += '<button class="crumb" data-act="node" data-id="' + esc(up(node)) + '">' + I.back + 'Назад</button>' +
          '<div class="sec-title">' + esc(node) + ' ' + esc(S.d.sections[node] || '') + '</div>';
      }
      html += ch.sections.map(c => '<button class="sec" data-act="node" data-id="' + esc(c) + '"><code>' + esc(c) + '</code><span>' +
        esc(S.d.sections[c]) + '</span><em>' + openUnder(c) + '</em></button>').join('');
      html += ch.works.slice(0, 80).map(workHtml).join('');
    }
    const n = chosen().filter(id => !q && r.tab === 'now' ? !isNow(workById(id), r.date) : false).length;
    if (n) html += '<div class="hint">Ещё ' + plural(n, 'работа', 'работы', 'работ') + ' из других разделов уже в отчёте.</div>';
    return html + extraFormHtml();
  }

  function bottomHtml() {
    const n = count();
    return n
      ? '<button class="main" data-act="next">Далее · ' + plural(n, 'работа', 'работы', 'работ') + '</button>'
      : '<button class="main" disabled>Внесите объём хотя бы по одной работе</button>';
  }

  function refreshList() {
    const list = document.getElementById('list');
    if (list) list.innerHTML = listHtml();
    refreshBottom();
  }
  let bottomCache = '';
  function refreshBottom() {
    const b = document.getElementById('bottom');
    const html = S.screen === 'finish' ? finishBottomHtml() : bottomHtml();
    // Ту же кнопку не пересоздаём: иначе пропадёт нажатие, начатое до перерисовки.
    if (b && html !== bottomCache) b.innerHTML = html;
    bottomCache = html;
    syncTelegram();
  }

  // ---------- Отчёт: люди, замечания, отправка

  function viewFinish() {
    const r = S.r;
    const rows = chosen().map(id => {
      const w = workById(id);
      return '<div class="sum-row"><span>' + esc(w.name) + '</span><b>' + num(r.vol[id]) + ' ' + esc(w.unit) + '</b></div>';
    }).concat(r.extras.map(x => '<div class="sum-row"><span>' + esc(x.name) + ' <span style="color:#5B6470">(вне КСГ)</span></span><b>' +
      num(x.volume) + ' ' + esc(x.unit) + '</b></div>')).join('');
    return '<div class="screen"><div class="pad">' +
      '<div class="hello"><small>' + longDate(r.date) + ' · ' + (r.shift === 'night' ? 'ночная' : 'дневная') + ' смена</small><h1>Проверьте отчёт</h1></div>' +
      '<div class="card"><div class="card-head"><strong>Работы</strong><span>' + count() + '</span></div><div class="sum">' + rows + '</div>' +
      '<button class="crumb" data-act="back">' + I.back + 'Изменить</button></div>' +
      '<div class="card"><div class="people"><strong>Людей в смену</strong>' +
      '<div class="step"><button data-act="pminus" aria-label="Меньше">−</button><label><span class="sr">Людей</span>' +
      '<input inputmode="numeric" data-people value="' + esc(r.people) + '" placeholder="0"><small>чел.</small></label>' +
      '<button data-act="pplus" aria-label="Больше">+</button></div></div></div>' +
      '<div class="card form" style="padding:16px"><label>Замечания, простои, что нужно' +
      '<textarea data-comment maxlength="500" placeholder="Например: простой 2 часа — не пришёл кран">' + esc(r.comment) + '</textarea></label>' +
      '<div class="chips"><button class="pill' + (r.comment === '' ? '' : '') + '" data-act="nocomment">Без замечаний</button></div></div>' +
      '</div><div class="bottom" id="bottom">' + finishBottomHtml() + '</div></div>';
  }

  function finishBottomHtml() {
    if (S.busy) return '<button class="main" disabled>Отправляю…</button>';
    const ok = /^\d+$/.test(String(S.r.people));
    return ok ? '<button class="main" data-act="send">Отправить отчёт</button>' : '<button class="main" disabled>Укажите, сколько было людей</button>';
  }

  async function send() {
    const r = S.r;
    S.busy = true;
    refreshBottom();
    try {
      await api('report', {
        date: r.date, shift: r.shift, people: Number(r.people), comment: r.comment,
        items: chosen().map(id => ({ workId: id, volume: r.vol[id] }))
          .concat(r.extras.map(x => ({ extra: true, name: x.name, unit: x.unit, volume: x.volume }))),
      });
      haptic('ok');
      S.sent = { r: r, n: count() };
      dropDraft();
      S.r = null;
      S.busy = false;
      S.screen = 'done';
      render();
    } catch (e) {
      haptic('err');
      S.busy = false;
      refreshBottom();
      toast(e.message || 'Не получилось отправить. Попробуйте ещё раз.');
    }
  }

  function viewDone() {
    const r = S.sent.r;
    return '<div class="screen"><div class="center">' +
      '<div class="done-mark" style="color:#1D5FD0">' + I.check.replace('width="22" height="22"', 'width="36" height="36"') + '</div>' +
      '<h2>Отчёт отправлен</h2><p>' + longDate(r.date) + ', ' + (r.shift === 'night' ? 'ночная' : 'дневная') + ' смена · ' +
      plural(S.sent.n, 'работа', 'работы', 'работ') + '.<br>Руководитель уже получил уведомление, копия — в чате с ботом.</p>' +
      '</div><div class="bottom"><button class="main" data-act="home">На главную</button></div></div>';
  }

  // ---------- Действия

  function startReport() {
    S.r = loadDraft() || newReport();
    if (S.r.date < isoAdd(S.d.today, -S.d.backDays) || S.r.date > S.d.today) S.r.date = S.d.today;
    S.screen = 'report';
    render();
    window.scrollTo(0, 0);
  }

  async function flow(kind) {
    try {
      await api('flow', { flow: kind });
      toast(kind === 'photo' ? 'Бот ждёт фото в чате' : 'Бот ждёт список материалов в чате');
      haptic('ok');
      if (tg) setTimeout(() => tg.close(), 700);
    } catch (e) {
      toast(e.message);
    }
  }

  function goBack() {
    if (!parents[S.screen]) return;
    S.screen = parents[S.screen];
    render();
    window.scrollTo(0, 0);
  }

  const actions = {
    retry: boot,
    home: boot,
    report: startReport,
    back: goBack,
    flow: el => flow(el.dataset.flow),
    day: el => { S.r.date = el.dataset.day; saveDraft(); render(); },
    shift: el => { S.r.shift = el.dataset.v; saveDraft(); render(); },
    tab: el => { S.r.tab = el.dataset.v; S.r.node = ''; S.r.q = ''; render(); },
    node: el => { S.r.node = el.dataset.id; refreshList(); window.scrollTo(0, 0); },
    inc: el => {
      const w = workById(el.dataset.id);
      setVol(w.id, (S.r.vol[w.id] || 0) + stepOf(w));
      haptic();
      refreshList();
    },
    dec: el => {
      const w = workById(el.dataset.id);
      setVol(w.id, (S.r.vol[w.id] || 0) - stepOf(w));
      haptic();
      refreshList();
    },
    'extra-open': () => { S.r.xf = { name: '', volume: '', unit: 'м3' }; refreshList(); },
    'extra-cancel': () => { S.r.xf = null; refreshList(); },
    'extra-add': () => {
      const f = S.r.xf;
      const v = parseNum(f.volume);
      if (f.name.trim().length < 3) return toast('Напишите, что за работа.');
      if (!(v > 0)) return toast('Укажите объём числом, например 20.');
      S.r.extras.push({ name: f.name.trim(), unit: f.unit, volume: round(v) });
      S.r.xf = null;
      saveDraft();
      haptic();
      refreshList();
    },
    'extra-del': el => { S.r.extras.splice(Number(el.dataset.i), 1); saveDraft(); refreshList(); },
    next: () => { S.screen = 'finish'; render(); window.scrollTo(0, 0); },
    pplus: () => { S.r.people = String((Number(S.r.people) || 0) + 1); saveDraft(); render(); },
    pminus: () => { S.r.people = String(Math.max(0, (Number(S.r.people) || 0) - 1)); saveDraft(); render(); },
    nocomment: () => { S.r.comment = ''; const t = app.querySelector('[data-comment]'); if (t) t.value = ''; saveDraft(); toast('Замечаний нет — так и запишу.'); },
    send: send,
  };

  Object.assign(screens, { loading: viewLoading, error: viewError, other: viewOther, home: viewHome, report: viewReport, finish: viewFinish, done: viewDone });

  // Общее для office.js (экраны руководителя и ПТО).
  window.PRORAB = {
    S, screens, parents, actions, api, boot, render, toast, haptic, I, DEMO,
    esc, round, num, parseNum, pct, isoAdd, longDate, shortDate, plural, callName, hello,
  };

  app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el && actions[el.dataset.act] && !el.disabled) actions[el.dataset.act](el);
  });

  app.addEventListener('input', e => {
    const t = e.target;
    if (t.hasAttribute('data-q')) {
      S.r.q = t.value;
      const list = document.getElementById('list');
      if (list) list.innerHTML = listHtml();
    } else if (t.hasAttribute('data-vol')) {
      const v = parseNum(t.value);
      if (v >= 0) {
        // Остаток проверяем по выходу из поля (change), чтобы не мешать набирать число.
        S.r.vol[t.dataset.vol] = v;
        saveDraft();
        refreshBottom();
      }
    } else if (t.hasAttribute('data-x')) {
      S.r.xf[t.dataset.x] = t.value;
    } else if (t.hasAttribute('data-people')) {
      S.r.people = t.value.replace(/\D/g, '').slice(0, 3);
      saveDraft();
      refreshBottom();
    } else if (t.hasAttribute('data-comment')) {
      S.r.comment = t.value;
      saveDraft();
    }
  });

  app.addEventListener('change', e => {
    const t = e.target;
    if (t.hasAttribute('data-date') && t.value) {
      const min = isoAdd(S.d.today, -S.d.backDays);
      S.r.date = t.value < min ? min : t.value > S.d.today ? S.d.today : t.value;
      saveDraft();
      render();
    } else if (t.hasAttribute('data-vol')) {
      const v = parseNum(t.value);
      setVol(t.dataset.vol, isNaN(v) ? 0 : v);
      // Список не перерисовываем, пока объём не обнулён: change приходит при уходе из поля,
      // и перерисовка съела бы нажатие на соседнюю кнопку.
      if (S.r.vol[t.dataset.vol] > 0) {
        t.value = num(S.r.vol[t.dataset.vol]);
        refreshBottom();
      } else {
        refreshList();
      }
    }
  });

  // ---------- Старт

  if (WA) {
    try {
      WA.ready();
      WA.expand();
      WA.setHeaderColor('#FFFFFF');
      WA.setBackgroundColor('#F3F4F6');
      if (WA.disableVerticalSwipes) WA.disableVerticalSwipes();
      WA.BackButton.onClick(goBack);
    } catch (e) { /* старые клиенты Telegram */ }
  }

  function start() {
    if (DEMO) {
      const s = document.createElement('script');
      s.src = 'demo.js?v=3';
      s.onload = boot;
      document.body.appendChild(s);
    } else if (!tg) {
      S.screen = 'error';
      S.msg = 'Это приложение открывается из Telegram — кнопкой «Открыть» в чате с ботом.';
      render();
    } else {
      boot();
    }
  }
  setTimeout(start, 0);
})();
