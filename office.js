'use strict';
/**
 * Экраны руководителя (сводка, объект, заявки) и ПТО (проверка факта, КСГ).
 * Общие помощники и состояние — из app.js (window.PRORAB).
 */
(function () {
  const P = window.PRORAB;
  const { S, screens, parents, actions, api, render, toast, haptic, I, esc, num, pct, plural, longDate, shortDate, callName, hello } = P;
  const app = document.getElementById('app');
  const WA = window.Telegram && window.Telegram.WebApp;

  const signed = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(Math.round(x * 100));
  const behindOf = (fact, plan) => fact - plan < -0.05;

  function confirmBox(text, onYes) {
    try {
      if (WA && WA.initData && WA.showConfirm) return WA.showConfirm(text, ok => ok && onYes());
    } catch (e) { /* старые клиенты Telegram */ }
    if (window.confirm(text)) onYes();
    return null;
  }

  // ================= Руководитель =================

  function managerNav(active) {
    const waiting = S.d.requests.filter(r => r.status === 'Новая').length;
    const tab = (id, label, icon) => '<button class="' + (active === id ? 'on' : '') + '" data-act="m-tab" data-v="' + id + '"' +
      (active === id ? ' aria-current="page"' : '') + '>' + icon + label + '</button>';
    return '<nav class="tabbar" aria-label="Разделы">' +
      tab('m-home', 'Сводка', '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>') +
      tab('m-req', 'Заявки' + (waiting ? ' · ' + waiting : ''), '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>') +
      '</nav>';
  }

  function objRow(o) {
    const late = behindOf(o.fact, o.plan);
    return '<button class="orow" data-act="m-obj" data-id="' + esc(o.id) + '">' +
      '<span class="orow-top"><i class="dot' + (o.reported ? ' on' : '') + '" aria-hidden="true"></i>' +
      '<span class="orow-name">' + esc(o.name) + '</span>' +
      '<span class="orow-gap' + (late ? ' late' : '') + '">' + pct(o.fact) + ' · ' + signed(o.fact - o.plan) + '</span></span>' +
      '<span class="pbar"><i class="' + (late ? 'late' : '') + '" style="width:' + pct(Math.min(1, o.fact)) + '"></i>' +
      '<b style="left:' + pct(Math.min(1, o.plan)) + '"></b></span>' +
      '<span class="sr">' + (o.reported ? 'Отчёт сегодня есть' : 'Отчёта сегодня нет') + '</span></button>';
  }

  screens['m-home'] = function () {
    const d = S.d;
    const reported = d.objects.filter(o => o.reported);
    const missing = d.objects.filter(o => !o.reported);
    const people = d.objects.reduce((s, o) => s + (o.people || 0), 0);
    const waiting = d.requests.filter(r => r.status === 'Новая').length;
    return '<div class="screen"><div class="pad">' +
      '<div class="hello"><small>' + longDate(d.today) + '</small><h1>' + hello() + ', ' + esc(callName(d.name, true)) + '</h1></div>' +
      '<div class="kpis">' +
      '<div class="kpi dark"><strong>' + reported.length + '<span>/' + d.objects.length + '</span></strong><small>отчётов сегодня</small></div>' +
      '<div class="kpi"><strong>' + people + '</strong><small>человек на объектах</small></div>' +
      '<button class="kpi' + (waiting ? ' warm' : '') + '" data-act="m-tab" data-v="m-req"><strong>' + waiting + '</strong><small>' +
      (waiting === 1 ? 'заявка ждёт' : 'заявок ждут') + ' решения</small></button></div>' +
      (d.checksWaiting ? '<div class="notice gray">' + I.clock + '<span>На проверке ПТО: ' + plural(d.checksWaiting, 'строка', 'строки', 'строк') +
        ' отчётов. В готовность они попадут после подтверждения.</span></div>' : '') +
      '<div class="card"><div class="card-head"><strong>Объекты</strong><span class="legend"><b></b>план на сегодня</span></div>' +
      '<div class="olist">' + d.objects.map(objRow).join('') + '</div></div>' +
      (missing.length
        ? '<div class="card row-card"><div><strong>Не сдали отчёт: ' + missing.length + '</strong><span>' +
          esc(missing.map(o => o.name).join(', ')) + '</span></div>' +
          '<button class="btn dark" data-act="m-remind">Напомнить</button></div>'
        : '<div class="notice blue">' + I.check + '<span>Сегодня отчитались все объекты.</span></div>') +
      '</div>' + managerNav('m-home') + '</div>';
  };

  screens['m-object'] = function () {
    const o = S.d.objects.find(x => x.id === S.mo);
    if (!o) return screens['m-home']();
    const gap = o.fact - o.plan;
    const max = Math.max.apply(null, o.week.map(x => x.value).concat(0.0001));
    const week = o.week.map(x => '<span class="wk"><i style="height:' + Math.max(2, Math.round(x.value / max * 44)) + 'px"' +
      (x.value > 0 ? '' : ' class="zero"') + '></i><small>' + x.day + '</small></span>').join('');
    const sections = o.sections.map(s => {
      const late = behindOf(s.fact, s.plan);
      return '<div class="prog"><div class="prog-top"><span>' + esc(s.name) + '</span><span class="' + (late ? 'late' : '') + '">' +
        pct(s.fact) + ' из ' + pct(s.plan) + '</span></div>' +
        '<span class="pbar"><i class="' + (late ? 'late' : '') + '" style="width:' + pct(Math.min(1, s.fact)) + '"></i><b style="left:' +
        pct(Math.min(1, s.plan)) + '"></b></span></div>';
    }).join('');
    const worst = o.worst.map(w => '<div class="sum-row"><span><code class="mono">' + esc(w.id) + '</code> ' + esc(w.name) + '</span><b class="late">' +
      pct(w.fact) + ' / ' + pct(w.plan) + '</b></div>').join('');
    const l = o.last;
    const last = l
      ? '<div class="card"><div class="card-head"><strong>Последний отчёт</strong><span>' + esc(l.date) + (l.shift ? ', ' + esc(l.shift.toLowerCase()) : '') +
        ' · ' + esc(l.at.slice(6)) + '</span></div>' +
        (l.onCheck ? '<span class="chip-inline">на проверке ПТО</span>' : '') +
        '<div class="sum">' + l.items.map(it => '<div class="sum-row"><span>' + esc(it.name) + '</span><b>' + num(it.volume) + ' ' + esc(it.unit) + '</b></div>').join('') + '</div>' +
        '<div class="muted">' + esc(l.name) + ' · людей: ' + l.people + ' · ' + (l.comment ? esc(l.comment) : 'без замечаний') + '</div></div>'
      : '<div class="card"><div class="empty">Отчётов по объекту ещё не было.</div></div>';
    return '<div class="screen"><div class="pad">' +
      '<button class="crumb" data-act="m-tab" data-v="m-home">' + I.back + 'Сводка</button>' +
      '<div class="obj"><div class="obj-head"><div><div class="obj-kicker">Объект ' + esc(o.id) + '</div><div class="obj-name">' + esc(o.name) + '</div></div>' +
      '<span class="chip ' + (behindOf(o.fact, o.plan) ? 'behind' : 'ok') + '">' + (behindOf(o.fact, o.plan) ? 'Отстаёт' : 'В графике') + '</span></div>' +
      '<div class="obj-nums"><div><div class="big">' + pct(o.fact) + '</div><small>готовность по факту</small></div>' +
      '<div><div class="mid">' + pct(o.plan) + '</div><small>по графику · ' + signed(gap) + ' п.п.</small></div></div>' +
      '<div class="week" aria-label="Выполнено за неделю по дням">' + week + '</div>' +
      '<small class="obj-note">Выполнено за 7 дней, по дням · работ в КСГ: ' + o.works + ', отстают: ' + o.behind + '</small></div>' +
      (o.reported ? '' : '<div class="card row-card"><div><strong>Сегодня отчёта нет</strong><span>' + esc(o.foremen.join(', ') || 'Прораб не зарегистрирован') +
        '</span></div>' + (o.foremen.length ? '<button class="btn dark" data-act="m-remind" data-object="' + esc(o.name) + '">Напомнить</button>' : '') + '</div>') +
      (sections ? '<div class="card"><div class="card-head"><strong>По разделам</strong><span class="legend"><b></b>план</span></div>' + sections + '</div>' : '') +
      last +
      (worst ? '<div class="card"><div class="card-head"><strong>Сильнее всего отстают</strong><span>факт / график</span></div><div class="sum">' + worst + '</div></div>' : '') +
      '</div></div>';
  };
  parents['m-object'] = 'm-home';

  screens['m-req'] = function () {
    const f = S.mf || 'Новая';
    const list = S.d.requests.filter(r => r.status === f);
    const chip = (st, label) => '<button class="pill' + (f === st ? ' on' : '') + '" data-act="m-rf" data-v="' + st + '">' + label + ' · ' +
      S.d.requests.filter(r => r.status === st).length + '</button>';
    const cards = list.map(r => '<div class="card"><div class="card-head"><strong>№' + r.num + ' · ' + esc(r.object) + '</strong>' +
      '<span>' + esc(r.date) + '</span></div><div class="sum">' + r.items.map(it => '<div class="sum-row"><span>' + esc(it) + '</span></div>').join('') + '</div>' +
      '<div class="muted">' + esc(r.name) + ' · нужно к ' + esc(r.needBy) + '</div>' +
      (r.status === 'Новая'
        ? '<div class="tiles"><button class="btn blue" data-act="m-decide" data-num="' + r.num + '" data-ok="1">Согласовать</button>' +
          '<button class="btn light" data-act="m-decide" data-num="' + r.num + '" data-ok="">Отклонить</button></div>'
        : '<div class="muted">' + esc(r.status) + (r.decidedBy ? ': ' + esc(r.decidedBy) : '') + '</div>') + '</div>').join('');
    return '<div class="screen"><div class="pad">' +
      '<div class="hello"><h1>Заявки на материалы</h1></div>' +
      '<div class="chips">' + chip('Новая', 'Ждут') + chip('Согласована', 'Согласованы') + chip('Отклонена', 'Отклонены') + '</div>' +
      (cards || '<div class="empty" style="padding:24px 4px">Здесь пусто.</div>') +
      '</div>' + managerNav('m-req') + '</div>';
  };

  Object.assign(actions, {
    'm-tab': el => { S.screen = el.dataset.v; render(); window.scrollTo(0, 0); },
    'm-obj': el => { S.mo = el.dataset.id; S.screen = 'm-object'; render(); window.scrollTo(0, 0); },
    'm-rf': el => { S.mf = el.dataset.v; render(); },
    'm-remind': async el => {
      el.disabled = true;
      try {
        const res = await api('remind', { object: el.dataset.object || '' });
        haptic('ok');
        toast(res.sent ? 'Напомнил: ' + (res.names || []).join(', ') : 'Некому напоминать — все отчитались или прорабы не зарегистрированы.');
      } catch (e) {
        toast(e.message);
      }
      el.disabled = false;
    },
    'm-decide': async el => {
      const num = Number(el.dataset.num);
      const ok = !!el.dataset.ok;
      el.disabled = true;
      try {
        const res = await api('decide', { num: num, approve: ok });
        const r = S.d.requests.find(x => x.num === num);
        r.status = res.status || (ok ? 'Согласована' : 'Отклонена');
        r.decidedBy = res.decidedBy || S.d.name;
        haptic('ok');
        toast('Заявка №' + num + ' — ' + r.status.toLowerCase() + '. Прораб получил сообщение.');
        render();
      } catch (e) {
        el.disabled = false;
        toast(e.message);
      }
    },
  });

  // ================= ПТО =================

  function ptoTabs(active) {
    const waiting = S.d.checks.filter(c => c.status === 'Ждёт проверки').length;
    return '<div class="seg ptabs" role="tablist">' +
      '<button class="' + (active === 'p-check' ? 'on' : '') + '" data-act="p-tab" data-v="p-check" role="tab" aria-selected="' + (active === 'p-check') + '">Проверка · ' + waiting + '</button>' +
      '<button class="' + (active === 'p-ksg' ? 'on' : '') + '" data-act="p-tab" data-v="p-ksg" role="tab" aria-selected="' + (active === 'p-ksg') + '">КСГ</button></div>';
  }

  const isWait = c => c.status === 'Ждёт проверки';
  const isClean = c => isWait(c) && !c.flags.length;

  function checkCard(c) {
    const open = S.po === c.row;
    const head = '<button class="chk-head" data-act="p-open" data-row="' + c.row + '" aria-expanded="' + open + '">' +
      '<span class="chk-meta">' + esc(shortDate(c.date || '')) + (c.shift ? ' · ' + esc(c.shift.toLowerCase()) : '') + ' · ' + esc(c.object) + ' · ' + esc(c.name) + '</span>' +
      '<span class="chk-main"><span class="chk-work"><code class="mono">' + esc(c.workId) + '</code>' + esc(c.workName) + '</span>' +
      '<b>' + num(c.volume) + ' ' + esc(c.unit) + '</b></span></button>';
    const flags = c.flags.length && isWait(c) ? '<ul class="flags">' + c.flags.map(f => '<li>' + esc(f) + '</li>').join('') + '</ul>' : '';
    let body = '';
    if (!isWait(c)) {
      body = '<div class="muted">' + esc(c.status) + ' · ' + esc(c.checkedBy) + ' · ' + esc(c.checkedAt) +
        (c.origVolume ? ' · было ' + num(c.origVolume) : '') + (c.ptoComment ? ' · ' + esc(c.ptoComment) : '') + '</div>';
    } else if (open) {
      const ctx = c.plan != null
        ? '<div class="facts"><div><small>Осталось</small><b>' + num(c.left) + '</b></div><div><small>Обычно за смену</small><b>' +
          (c.usual != null ? num(c.usual) : '—') + '</b></div><div><small>План</small><b>' + num(c.plan) + '</b></div></div>'
        : '';
      body = ctx +
        '<div class="muted">' + (c.section ? esc(c.section) + ' · ' : '') + 'людей: ' + c.people + ' · отправлен ' + esc(c.submitted) +
        (c.comment ? '<br>Прораб: «' + esc(c.comment) + '»' : '') + '</div>' +
        '<div class="form flat"><div class="grid2"><label>Комментарий прорабу<input data-pc value="' + esc(S.pc || '') + '" placeholder="Обязательно при возврате"></label>' +
        '<label>Объём, ' + esc(c.unit) + '<input data-pv inputmode="decimal" value="' + esc(S.pv != null ? S.pv : num(c.volume)) + '"></label></div>' +
        '<div class="tiles"><button class="btn blue" data-act="p-ok" data-row="' + c.row + '">Подтвердить</button>' +
        '<button class="btn light warn" data-act="p-back" data-row="' + c.row + '">Вернуть прорабу</button></div></div>';
    }
    return '<div class="chk' + (open ? ' open' : '') + (isWait(c) ? '' : ' done') + (c.flags.length && isWait(c) ? ' flagged' : '') + '">' + head + flags + body + '</div>';
  }

  screens['p-check'] = function () {
    const d = S.d;
    const f = S.pf || 'wait';
    const groups = {
      wait: d.checks.filter(isWait),
      flag: d.checks.filter(c => isWait(c) && c.flags.length),
      done: d.checks.filter(c => !isWait(c)),
    };
    const list = groups[f];
    const clean = d.checks.filter(isClean);
    const chip = (id, label) => '<button class="pill' + (f === id ? ' on' : '') + '" data-act="p-filter" data-v="' + id + '">' + label + ' · ' + groups[id].length + '</button>';
    return '<div class="screen"><div class="pad wide">' +
      '<div class="hello"><small>' + longDate(d.today) + ' · ПТО</small><h1>' + hello() + ', ' + esc(callName(d.name, true)) + '</h1></div>' +
      ptoTabs('p-check') +
      '<div class="chips">' + chip('wait', 'Ждут') + chip('flag', 'С замечаниями') + chip('done', 'Обработанные') + '</div>' +
      (f === 'wait' && clean.length ? '<button class="btn blue full" data-act="p-okall">Подтвердить все без замечаний · ' + clean.length + '</button>' : '') +
      (list.length ? '<div class="chks">' + list.map(checkCard).join('') + '</div>'
        : '<div class="center small"><p>' + (f === 'done' ? 'Пока ничего не проверено.' : 'Всё проверено. Новые отчёты появятся здесь, бот пришлёт уведомление.') + '</p></div>') +
      '</div></div>';
  };

  async function decide(rows, decision, extra) {
    try {
      await api('check', Object.assign({ rows: rows, decision: decision }, extra || {}));
      const label = decision === 'back' ? 'Возвращено' : 'Подтверждено';
      rows.forEach(row => {
        const c = S.d.checks.find(x => x.row === row);
        c.status = extra && extra.volume != null && Number(extra.volume) !== c.volume ? 'Исправлено' : label;
        if (c.status === 'Исправлено') { c.origVolume = c.volume; c.volume = Number(extra.volume); }
        c.checkedBy = S.d.name;
        c.checkedAt = 'только что';
        c.ptoComment = extra && extra.comment || '';
      });
      S.po = null;
      S.pc = '';
      S.pv = null;
      haptic('ok');
      toast(decision === 'back' ? 'Вернул прорабу — он получил сообщение.' : plural(rows.length, 'строка ушла', 'строки ушли', 'строк ушло') + ' в базу факта.');
      S.ksg = {}; // КСГ пересчитается при следующем открытии
      render();
    } catch (e) {
      haptic('err');
      toast(e.message);
      render();
    }
  }

  Object.assign(actions, {
    'p-tab': el => { S.screen = el.dataset.v; render(); window.scrollTo(0, 0); if (S.screen === 'p-ksg') loadKsg(); },
    'p-filter': el => { S.pf = el.dataset.v; S.po = null; render(); },
    'p-open': el => {
      const row = Number(el.dataset.row);
      S.po = S.po === row ? null : row;
      S.pc = '';
      S.pv = null;
      render();
    },
    'p-ok': el => {
      const c = S.d.checks.find(x => x.row === Number(el.dataset.row));
      const v = P.parseNum(S.pv != null ? S.pv : c.volume);
      if (!(v > 0)) return toast('Укажите объём числом.');
      const changed = Math.abs(v - c.volume) > 1e-9;
      el.disabled = true;
      return decide([c.row], 'ok', { volume: changed ? v : null, comment: S.pc || '' });
    },
    'p-back': el => {
      if (!(S.pc || '').trim()) {
        toast('Напишите прорабу, что не так, — он увидит это в чате.');
        const input = app.querySelector('[data-pc]');
        if (input) input.focus();
        return null;
      }
      el.disabled = true;
      return decide([Number(el.dataset.row)], 'back', { comment: S.pc });
    },
    'p-okall': () => {
      const rows = S.d.checks.filter(isClean).map(c => c.row);
      confirmBox('Подтвердить ' + plural(rows.length, 'строку', 'строки', 'строк') + ' без замечаний? Они уйдут в базу факта.',
        () => decide(rows, 'ok'));
    },
  });

  app.addEventListener('input', e => {
    const t = e.target;
    if (t.hasAttribute('data-pc')) S.pc = t.value;
    else if (t.hasAttribute('data-pv')) S.pv = t.value;
    else if (t.hasAttribute('data-kq')) {
      S.kq = t.value;
      const box = document.getElementById('ktree');
      if (box) box.innerHTML = ksgTree();
    }
  });
  app.addEventListener('change', e => {
    const t = e.target;
    if (t.hasAttribute('data-kobj')) {
      S.kobj = t.value;
      S.kopen = {};
      loadKsg();
    }
  });

  // ---------- КСГ

  async function loadKsg() {
    const id = S.kobj || (S.d.objects[0] && S.d.objects[0].id);
    S.kobj = id;
    S.ksg = S.ksg || {};
    if (S.ksg[id]) return render();
    S.kload = true;
    render();
    try {
      S.ksg[id] = await api('ksg', { object: id });
    } catch (e) {
      toast(e.message);
    }
    S.kload = false;
    if (S.screen === 'p-ksg') render();
    return null;
  }

  function planPct(w, today) {
    if (!w.start || !w.end) return 0;
    if (today >= w.end) return 1;
    if (today < w.start) return 0;
    const d = s => new Date(s + 'T00:00:00Z').getTime();
    return (d(today) - d(w.start) + 864e5) / (d(w.end) - d(w.start) + 864e5);
  }
  const STATUS_CLASS = { 'Отстаёт': 'late', 'Превышение объёма': 'late', 'Риск': 'risk', 'Не начато': 'idle' };

  function workRow(w, k) {
    const p = planPct(w, k.today);
    const f = w.plan > 0 ? Math.min(1, w.fact / w.plan) : 0;
    const cls = STATUS_CLASS[w.status] || 'ok';
    return '<div class="krow"><div class="krow-top"><code class="mono">' + esc(w.id) + '</code><span class="kst ' + cls + '">' + esc(w.status) + '</span></div>' +
      '<div class="krow-name">' + esc(w.name) + '</div>' +
      '<div class="krow-nums">' + num(w.fact) + ' из ' + num(w.plan) + ' ' + esc(w.unit) +
      (w.pending ? ' · <span class="pend">на проверке ' + num(w.pending) + '</span>' : '') +
      (w.start ? ' · ' + shortDate(w.start) + '–' + shortDate(w.end) : '') + '</div>' +
      '<span class="pbar"><i class="' + (cls === 'late' ? 'late' : '') + '" style="width:' + Math.round(f * 100) + '%"></i><b style="left:' + Math.round(p * 100) + '%"></b></span></div>';
  }

  function ksgTree() {
    const k = S.ksg && S.ksg[S.kobj];
    if (!k) return '';
    const q = (S.kq || '').trim().toLowerCase();
    if (q) {
      const found = k.works.filter(w => w.name.toLowerCase().indexOf(q) >= 0 || w.id.indexOf(q) >= 0);
      return '<div class="hint">Найдено: ' + found.length + '</div>' + found.slice(0, 80).map(w => workRow(w, k)).join('');
    }
    const top = k.object.id;
    const parentOf = code => {
      const parts = code.split('.');
      for (let i = parts.length - 1; i > 0; i--) {
        const p = parts.slice(0, i).join('.');
        if (k.sections[p] || p === top) return p;
      }
      return top;
    };
    const kids = node => ({
      secs: Object.keys(k.sections).filter(c => parentOf(c) === node),
      works: k.works.filter(w => parentOf(w.id) === node),
    });
    const under = code => k.works.filter(w => w.id.indexOf(code + '.') === 0);
    const branch = (node, depth) => {
      const ch = kids(node);
      return ch.secs.map(c => {
        const ws = under(c);
        if (!ws.length) return '';
        const late = ws.filter(w => STATUS_CLASS[w.status] === 'late').length;
        const open = S.kopen && S.kopen[c];
        return '<div class="ksec" style="margin-left:' + Math.min(depth, 3) * 12 + 'px">' +
          '<button class="ksec-head" data-act="k-toggle" data-id="' + esc(c) + '" aria-expanded="' + !!open + '">' +
          '<span class="arrow">' + (open ? '▾' : '▸') + '</span><code class="mono">' + esc(c) + '</code><span class="ksec-name">' + esc(k.sections[c]) + '</span>' +
          '<em>' + ws.length + (late ? ' · <span class="late">' + late + ' отст.</span>' : '') + '</em></button>' +
          (open ? branch(c, depth + 1) : '') + '</div>';
      }).join('') + (ch.works.length ? '<div style="margin-left:' + Math.min(depth, 3) * 12 + 'px">' + ch.works.map(w => workRow(w, k)).join('') + '</div>' : '');
    };
    return branch(top, 0);
  }

  screens['p-ksg'] = function () {
    const d = S.d;
    const k = S.ksg && S.ksg[S.kobj];
    const count = st => k ? k.works.filter(w => w.status === st).length : 0;
    const extras = k && k.extras.length
      ? '<div class="card"><div class="card-head"><strong>Работы вне КСГ</strong><span>' + k.extras.length + '</span></div>' +
        k.extras.map(x => '<div class="row-card flat"><div><strong>' + esc(x.name) + '</strong><span>' + num(x.volume) + ' ' + esc(x.unit) + ' · ' +
          esc(x.date) + ' · ' + esc(x.foreman) + '</span></div><button class="btn dark" data-act="k-add" data-rid="' + esc(x.reportId) + '" data-idx="' + x.index + '">В КСГ</button></div>').join('') +
        '<div class="muted">Работа попадёт в раздел «' + esc(k.object.id) + '.99» с планом, равным заявленному объёму. План и сроки потом поправьте в Plan_Graph.</div></div>'
      : '';
    return '<div class="screen"><div class="pad wide">' +
      '<div class="hello"><small>ПТО</small><h1>График работ</h1></div>' +
      ptoTabs('p-ksg') +
      '<label class="select"><span class="sr">Объект</span><select data-kobj>' +
      d.objects.map(o => '<option value="' + esc(o.id) + '"' + (o.id === S.kobj ? ' selected' : '') + '>' + esc(o.id + ' · ' + o.name) + '</option>').join('') + '</select></label>' +
      (S.kload && !k ? '<div class="center small"><div class="spinner" aria-hidden="true"></div><p>Загружаю КСГ…</p></div>' : '') +
      (k ? '<div class="kpis">' +
        '<div class="kpi"><strong>' + k.works.length + '</strong><small>работ</small></div>' +
        '<div class="kpi warm"><strong>' + (count('Отстаёт') + count('Превышение объёма')) + '</strong><small>отстают</small></div>' +
        '<div class="kpi"><strong>' + count('Выполнено') + '</strong><small>выполнено</small></div></div>' + extras +
        '<label class="search">' + I.search + '<span class="sr">Поиск по КСГ</span><input type="search" data-kq placeholder="Название или код работы" value="' + esc(S.kq || '') + '" autocomplete="off"></label>' +
        '<div class="muted">Полоса — выполненная доля объёма, чёрная отметка — где работа должна быть по графику сегодня.</div>' +
        '<div class="ktree" id="ktree">' + ksgTree() + '</div>' : '') +
      '</div></div>';
  };

  Object.assign(actions, {
    'k-toggle': el => {
      S.kopen = S.kopen || {};
      S.kopen[el.dataset.id] = !S.kopen[el.dataset.id];
      const box = document.getElementById('ktree');
      if (box) box.innerHTML = ksgTree();
    },
    'k-add': async el => {
      el.disabled = true;
      try {
        const res = await api('kadd', { reportId: el.dataset.rid, index: Number(el.dataset.idx) });
        haptic('ok');
        toast('Добавлено в КСГ: ' + (res.id || '') + ' ' + (res.name || ''));
        delete S.ksg[S.kobj];
        loadKsg();
      } catch (e) {
        el.disabled = false;
        toast(e.message);
      }
    },
  });
})();
