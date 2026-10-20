// FIOTÕES — lógica do jogo: movimento, chat, cerveja, placar, HOMEM, efeitos.
(function () {
  'use strict';
  const FT = window.FT;
  const S = FT.sprites, Wd = FT.world, CFG = window.FIOTOES_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ---------- armazenamento ----------
  const NS = new URLSearchParams(location.search).get('p') || '';
  const K = (k) => `fiotoes:${NS}:${k}`;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch (e) { /* ok */ } };
  const today = () => new Date().toLocaleDateString('sv-SE');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const cleanName = (n) => String(n == null ? '' : n).replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  const uid = () => Math.random().toString(36).slice(2, 10);

  const SPEED = 104;
  const DRINK_MS = 5000;
  const KO_BAC = 24;

  // ---------- estado ----------
  let profile = lsGet('profile', null);
  const sid = uid();
  let me = null;
  const players = new Map();
  let board = {};
  let boardDirty = false;
  let day = today();
  let net = null;
  let running = false;
  let lastT = 0;
  let netStatus = 'connecting';

  // canvas
  const view = $('view'), vctx = view.getContext('2d');
  const scene = document.createElement('canvas'), sctx = scene.getContext('2d');
  const dark = document.createElement('canvas'); dark.width = 160; dark.height = 90;
  const dctx = dark.getContext('2d');
  let Sc = 1, bg = null, homemSpr = null;

  // entrada
  const keys = {};
  let joy = { x: 0, y: 0, id: null };
  let holdBtn = false, holdKey = false;
  let pendingTalk = false;
  const clickMarks = [];

  // efeitos
  let drunkVis = 0, psyVis = 0, psyStart = 0, psyEnd = 0;
  const parts = [];   // fumaça
  const floats = [];  // textos flutuantes

  // ---------- perfil ----------
  function newProfile(p) {
    return { pid: (profile && profile.pid) || uid() + uid(), name: p.name, look: p.look, day: today(), beers: 0, bac: 0, bacT: Date.now() };
  }
  function saveProfile() {
    if (!me) return;
    profile.name = me.name; profile.look = me.look; profile.day = day;
    profile.beers = me.beers; profile.bac = me.bac; profile.bacT = Date.now();
    lsSet('profile', profile);
  }

  // ---------- jogadores ----------
  function makePlayer(id, d) {
    return {
      id, pid: d.pid || id, name: cleanName(d.name) || 'Alguém', look: S.sanitizeLook(d.look),
      x: num(d.x, 330), y: num(d.y, 220), ix: 0, iy: 0, tx: null, ty: null, ex: 0, ey: 0,
      face: d.face < 0 ? -1 : 1, up: false, anim: 0, moving: false, stuck: 0,
      beers: clamp(num(d.beers, 0) | 0, 0, 999), drunk: clamp(num(d.drunk, 0), 0, 1),
      drinking: false, smoking: false, redUntil: Date.now() + clamp(num(d.rd, 0), 0, 120000), koUntil: 0,
      bubble: null, lastMv: 0, lastChat: 0,
    };
  }

  function stepMover(p, dt, spd, wob) {
    let dx = 0, dy = 0;
    if (p.tx != null) {
      const vx = p.tx - p.x, vy = p.ty - p.y, d = Math.hypot(vx, vy);
      if (d < 3) { p.tx = p.ty = null; } else { dx = vx / d; dy = vy / d; }
    } else { dx = p.ix; dy = p.iy; }
    let m = Math.hypot(dx, dy);
    p.moving = m > 0.05;
    if (p.moving) {
      if (m > 1) { dx /= m; dy /= m; m = 1; }
      if (wob) { const c = Math.cos(wob), s = Math.sin(wob); const nx = dx * c - dy * s; dy = dx * s + dy * c; dx = nx; }
      const ox = p.x, oy = p.y;
      p.x += dx * spd * dt;
      p.y += dy * spd * dt * 0.8;
      Wd.resolve(p);
      if (Math.abs(dx) > 0.25) p.face = dx > 0 ? 1 : -1;
      p.up = dy < -0.55 && Math.abs(dy) > Math.abs(dx);
      p.anim += dt;
      if (p.tx != null) {
        const moved = Math.hypot(p.x - ox, p.y - oy);
        p.stuck = moved < spd * dt * 0.15 ? p.stuck + dt : 0;
        if (p.stuck > 0.5) { p.tx = p.ty = null; p.stuck = 0; }
      }
    } else { p.anim = 0; }
  }

  // ---------- rede ----------
  function getMeta() {
    return {
      pid: me.pid, n: me.name, l: me.look, x: Math.round(me.x), y: Math.round(me.y), b: me.beers,
      d: +drunkLevel().toFixed(2), rd: Math.max(0, me.redUntil - Date.now()), fc: me.face,
    };
  }
  let metaTimer = null;
  function pushMeta() {
    if (!net) return;
    clearTimeout(metaTimer);
    metaTimer = setTimeout(() => net && net.setMeta(getMeta()), 400);
  }
  const send = (o) => { if (net) { o.id = sid; net.send(o); } };

  function onPeer(id, m) {
    if (!m || typeof m !== 'object') return;
    let p = players.get(id);
    if (!p) {
      p = makePlayer(id, { pid: m.pid, name: m.n, look: m.l, x: m.x, y: m.y, beers: m.b, drunk: m.d, rd: m.rd, face: m.fc });
      players.set(id, p);
      boardSet(p.pid, p.name, p.beers);
      addLog(null, `${p.name} entrou no bar 🍻`, true);
      FT.audio.clink();
      // o "mais antigo" manda o placar pro recém-chegado
      const ids = [sid, ...players.keys()].filter((k) => k !== id).sort();
      if (ids[0] === sid) setTimeout(() => send({ t: 'bd', day, board }), 600 + Math.random() * 400);
    } else onPeerUpdate(id, m);
    updateOnline();
  }
  function onPeerUpdate(id, m) {
    const p = players.get(id);
    if (!p || !m) return;
    p.name = cleanName(m.n) || p.name;
    p.look = S.sanitizeLook(m.l);
    p.beers = Math.max(p.beers, clamp(num(m.b, 0) | 0, 0, 999));
    p.drunk = clamp(num(m.d, 0), 0, 1);
    if (m.rd > 0) p.redUntil = Math.max(p.redUntil, Date.now() + clamp(num(m.rd, 0), 0, 120000));
    boardSet(p.pid, p.name, p.beers);
    if (!p.moving && Date.now() - p.lastMv > 2500) {
      p.x = clamp(num(m.x, p.x), 20, 620); p.y = clamp(num(m.y, p.y), 152, 352);
    }
  }
  function onLeave(id) {
    const p = players.get(id);
    if (!p) return;
    players.delete(id);
    addLog(null, `${p.name} saiu do bar`, true);
    updateOnline();
  }
  function onStatus(s) {
    netStatus = s;
    const el = $('netmode');
    el.textContent = s === 'online' ? '🟢 online' : s === 'local' ? '🧪 teste' : s === 'error' ? '🔴 offline' : '…';
    el.title = s === 'local' ? 'Modo teste: só enxerga outras abas deste navegador. Configure o Supabase em js/config.js' : s === 'error' ? 'Sem conexão com o servidor — modo teste' : '';
  }
  function updateOnline() { $('online').textContent = '👥 ' + (players.size + 1); }

  function onMsg(m) {
    if (!m || typeof m !== 'object' || m.id === sid) return;
    if (m.t === 'bd') { mergeBoard(m); return; }
    const p = players.get(m.id);
    if (!p) return;
    switch (m.t) {
      case 'mv':
        p.lastMv = Date.now();
        p.ix = clamp(num(m.ix, 0), -1, 1); p.iy = clamp(num(m.iy, 0), -1, 1);
        p.tx = m.tx == null ? null : clamp(num(m.tx, 0), 20, 620);
        p.ty = m.ty == null ? null : clamp(num(m.ty, 0), 152, 352);
        p.drunk = clamp(num(m.d, p.drunk), 0, 1);
        {
          const nx = clamp(num(m.x, p.x), 20, 620), ny = clamp(num(m.y, p.y), 152, 352);
          if (Math.hypot(nx - p.x, ny - p.y) > 70) { p.x = nx; p.y = ny; p.ex = p.ey = 0; }
          else { p.ex = nx - p.x; p.ey = ny - p.y; }
        }
        break;
      case 'dr': p.drinking = !!m.v; if (m.v) FT.audio.gulp(); break;
      case 'bw': {
        const b = clamp(num(m.b, 0) | 0, 0, 999);
        p.drinking = false;
        if (b > p.beers) { p.beers = b; milestone(p.name, b, false); }
        p.drunk = clamp(num(m.d, p.drunk), 0, 1);
        boardSet(p.pid, p.name, p.beers);
        if (Math.random() < 0.5) FT.audio.burp();
        break;
      }
      case 'sm':
        p.smoking = !!m.v;
        if (m.rd > 0) p.redUntil = Date.now() + clamp(num(m.rd, 0), 0, 120000);
        break;
      case 'ko': p.koUntil = Date.now() + clamp(num(m.ms, 0), 0, 15000); p.drinking = false; break;
      case 'ch': {
        const now = performance.now();
        if (now - p.lastChat < 500) return;
        p.lastChat = now;
        const text = String(m.m == null ? '' : m.m).replace(/[<>]/g, '').slice(0, 90);
        if (!text) return;
        p.bubble = { text, until: now + 6500 };
        addLog(p.name, text, false);
        break;
      }
    }
  }

  // ---------- placar ----------
  function boardSet(pid, n, b) {
    if (!pid || !(b >= 0)) return;
    n = cleanName(n);
    const e = board[pid];
    if (!e || b > e.b) { board[pid] = { n: n || (e && e.n) || '?', b: Math.min(999, b | 0) }; boardDirty = true; }
    else if (n && e.n !== n && b === e.b) { e.n = n; boardDirty = true; }
  }
  function mergeBoard(m) {
    if (m.day !== day || !m.board || typeof m.board !== 'object') return;
    for (const pid of Object.keys(m.board).slice(0, 200)) {
      const e = m.board[pid];
      if (e && typeof e === 'object') boardSet(String(pid).slice(0, 24), e.n, num(e.b, 0));
    }
  }
  function boardRows() {
    const online = new Set([me.pid]);
    players.forEach((p) => online.add(p.pid));
    return Object.entries(board)
      .map(([pid, e]) => ({ pid, n: e.n, b: e.b, on: online.has(pid), me: pid === me.pid }))
      .sort((a, b) => b.b - a.b || a.n.localeCompare(b.n));
  }
  function openRanking() {
    const ol = $('rank-list');
    ol.innerHTML = '';
    const rows = boardRows();
    if (!rows.length) { const li = document.createElement('li'); li.textContent = 'Ninguém bebeu ainda… seja o primeiro! 🍺'; li.style.cssText = 'counter-increment:none'; ol.appendChild(li); }
    rows.forEach((r) => {
      const li = document.createElement('li');
      if (r.me) li.className = 'me';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.n;
      const dot = document.createElement('span'); dot.className = 'dot' + (r.on ? ' on' : '');
      const n = document.createElement('span'); n.className = 'n'; n.textContent = r.b + ' 🍺';
      li.append(nm, dot, n);
      ol.appendChild(li);
    });
    $('ranking').hidden = false;
  }
  function milestone(name, b, isMe) {
    if (b >= 5 && b % 5 === 0) {
      addLog(null, `${isMe ? 'Você' : name} já tomou ${b} cervejas! 🍻`, true);
      if (isMe) toast(`${b} cervejas! 🍻`);
    }
  }

  // ---------- chat / avisos ----------
  function addLog(name, text, sys) {
    const log = $('chatlog');
    const d = document.createElement('div');
    if (sys) { d.className = 'sys'; d.textContent = text; }
    else { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b, document.createTextNode(text)); }
    log.appendChild(d);
    while (log.children.length > 7) log.removeChild(log.firstChild);
    setTimeout(() => d.remove(), 16000);
  }
  function toast(text) {
    const box = $('toast');
    const d = document.createElement('div');
    d.textContent = text;
    box.appendChild(d);
    setTimeout(() => d.remove(), 3700);
  }
  function slur(text, d) {
    if (d < 0.25) return text;
    let out = '';
    for (const ch of text) {
      out += ch;
      if (/[a-zà-úA-Z]/.test(ch) && Math.random() < d * 0.2) out += ch;
      if (Math.random() < d * 0.04) out += '…';
    }
    if (d > 0.45 && Math.random() < 0.5) out += ' *hic*';
    return out;
  }

  // ---------- álcool ----------
  function drunkLevel() { return Math.sqrt(clamp((me.bac - 9) / 10, 0, 1)); }
  function levelLabel(b) {
    return b < 3 ? 'Sóbrio' : b < 6 ? 'Alegrinho' : b < 9 ? 'Animado' : b < 12 ? 'Bêbado 🥴' : b < 16 ? 'Muito bêbado' : b < 21 ? 'Chapado' : 'Quase apagando 😵';
  }
  const isKO = () => Date.now() < me.koUntil;

  // ---------- beber ----------
  let drinkT = 0, drinkDur = DRINK_MS, drinkingNow = false, gulpT = 0;
  function updateDrink(dt) {
    const want = (holdBtn || holdKey) && !isKO() && !me.smoking && !dialogOpen();
    if (want) {
      if (!drinkingNow) {
        drinkingNow = true; drinkT = Math.max(0, drinkT); drinkDur = DRINK_MS * rnd(0.9, 1.1) * (1 + drunkLevel() * 0.25);
        me.drinking = true; send({ t: 'dr', v: 1 }); FT.audio.clink();
      }
      drinkT += dt * 1000;
      gulpT -= dt;
      if (gulpT <= 0) { FT.audio.gulp(); gulpT = rnd(0.35, 0.6); }
      if (drinkT >= drinkDur) { finishBeer(); drinkT = 0; drinkDur = DRINK_MS * rnd(0.9, 1.1) * (1 + drunkLevel() * 0.25); }
    } else {
      if (drinkingNow) { drinkingNow = false; me.drinking = false; send({ t: 'dr', v: 0 }); }
      drinkT = Math.max(0, drinkT - dt * 2500);
    }
    const p = clamp((drinkT / drinkDur) * 100, 0, 100);
    $('btn-drink').style.setProperty('--p', p.toFixed(1));
    $('btn-drink').classList.toggle('on', drinkingNow);
  }
  function finishBeer() {
    me.beers++; me.bac += 1;
    me.drinking = true; // segue com a caneca na mão se continuar segurando
    boardSet(me.pid, me.name, me.beers);
    saveProfile();
    floats.push({ x: me.x, y: me.y - 70, t: 0, text: '+1 🍺', col: '#ffb43a' });
    FT.audio.burp();
    if (Math.random() < 0.5) me.bubble = { text: ['*ARROTO*', 'Aaaah, gelada!', 'Mais uma!', 'Saúde! 🍻', 'Bora!'][Math.floor(Math.random() * 5)], until: performance.now() + 2000 };
    send({ t: 'bw', b: me.beers, d: +drunkLevel().toFixed(2) });
    milestone(me.name, me.beers, true);
    pushMeta();
    if (me.bac >= KO_BAC) knockOut();
    updateStatus();
  }
  function knockOut() {
    me.koUntil = Date.now() + 10000;
    me.bac = Math.max(0, me.bac - 6);
    drinkingNow = false; me.drinking = false; drinkT = 0;
    send({ t: 'dr', v: 0 }); send({ t: 'ko', ms: 10000 });
    FT.audio.thud();
    toast('Você apagou! 😵💤');
    me.tx = me.ty = null;
  }

  // ---------- HOMEM / baseado ----------
  let dlgTimer = null;
  const dialogOpen = () => !$('dialog').hidden;
  function say(text, opts) {
    const box = $('dialog');
    box.hidden = false;
    $('dlg-text').textContent = '';
    const optsEl = $('dlg-opts');
    optsEl.innerHTML = '';
    clearInterval(dlgTimer);
    let i = 0;
    dlgTimer = setInterval(() => {
      i += 2;
      $('dlg-text').textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(dlgTimer); showOpts(); }
    }, 22);
    const showOpts = () => {
      optsEl.innerHTML = '';
      opts.forEach((o) => {
        const b = document.createElement('button');
        b.textContent = o.label;
        b.onclick = () => { FT.audio.blip(); o.fn(); };
        optsEl.appendChild(b);
      });
    };
    $('dialog').onclick = (e) => {
      if (e.target.closest('button')) return;
      if (i < text.length) { i = text.length; $('dlg-text').textContent = text; clearInterval(dlgTimer); showOpts(); }
    };
  }
  function closeDialog() { clearInterval(dlgTimer); $('dialog').hidden = true; }
  function talkHomem() {
    pendingTalk = false;
    me.tx = me.ty = null;
    const now = Date.now();
    if (me.hasJoint) return say('Já tá com um na mão, parceiro. Vai fumar, vai! 😏', [{ label: 'Beleza', fn: closeDialog }]);
    if (now < me.jointReadyAt) return say('Calma, calma... acabou de fumar. Volta daqui uns minutinhos. 🤫', [{ label: 'Tá bom', fn: closeDialog }]);
    say('Psiu... vem cá. Tá procurando alguma coisa pra... relaxar?', [
      { label: 'Sei lá, tem o quê?', fn: step2 },
      { label: 'Tô de boa', fn: closeDialog },
    ]);
  }
  function step2() {
    say('Tenho um baseadinho aqui. Cortesia da casa. Mas fica entre nós, hein? 🤫', [
      { label: 'Pegar o baseado 🚬', fn: give },
      { label: 'Melhor não', fn: closeDialog },
    ]);
  }
  function give() {
    me.hasJoint = true;
    $('btn-smoke').hidden = false;
    FT.audio.pop();
    say('Toma. Fuma ali no cantinho mesmo... depois me procura se quiser outro.', [{ label: 'Valeu! 🙏', fn: closeDialog }]);
    toast('Você ganhou um baseado 🚬');
  }
  function startSmoking() {
    if (!me.hasJoint || me.smoking || isKO()) return;
    closeDialog();
    me.hasJoint = false; me.smoking = true; me.smokeLeft = 6.5; me.puffT = 0;
    me.redUntil = Date.now() + 90000;
    $('btn-smoke').hidden = true;
    me.tx = me.ty = null;
    send({ t: 'sm', v: 1, rd: 90000 });
    FT.audio.puff();
  }
  function endSmoking() {
    me.smoking = false;
    me.redUntil = Date.now() + 90000;
    me.jointReadyAt = Date.now() + 40000;
    psyStart = performance.now(); psyEnd = psyStart + 60000;
    send({ t: 'sm', v: 0, rd: 90000 });
    pushMeta();
    FT.audio.psy();
    toast('Eita... tá tudo colorido 🌈👁️');
  }

  // ---------- entrada ----------
  function kbVec() {
    let x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    return { x, y };
  }
  function toWorld(e) {
    const r = view.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * Wd.W, y: ((e.clientY - r.top) / r.height) * Wd.H };
  }
  function nearHomem() { return Math.hypot(me.x - Wd.HOMEM.x, (me.y - Wd.HOMEM.y) * 1.2) < 62; }

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      if (!running) return;
      const inChat = document.activeElement === $('chatinput');
      if (e.key === 'Escape') { $('chatinput').blur(); closeDialog(); $('ranking').hidden = true; $('chatform').classList.remove('open'); return; }
      if (inChat) return;
      if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); openChat(); return; }
      if (e.code === 'Space') { e.preventDefault(); holdKey = true; return; }
      if (e.code === 'KeyE') { if (me.hasJoint) startSmoking(); else if (nearHomem()) talkHomem(); return; }
      if (e.code === 'Tab') { e.preventDefault(); openRanking(); return; }
      keys[e.code] = true;
      if (/^(Arrow|Key[WASD])/.test(e.code)) { if (e.code.startsWith('Arrow')) e.preventDefault(); me.tx = me.ty = null; pendingTalk = false; }
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space') holdKey = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; holdKey = false; holdBtn = false; });

    // clicar / tocar no cenário
    view.addEventListener('pointerdown', (e) => {
      if (!running || (e.pointerType === 'mouse' && e.button !== 0)) return;
      FT.audio.init();
      closeDialog();
      const w = toWorld(e);
      if (isKO()) return;
      const hm = Wd.HOMEM;
      if (w.x > hm.x - 18 && w.x < hm.x + 18 && w.y > hm.y - 70 && w.y < hm.y + 6) {
        if (nearHomem()) talkHomem();
        else { me.tx = hm.x + 34; me.ty = hm.y + 6; pendingTalk = true; clickMarks.push({ x: me.tx, y: me.ty, t: 0 }); }
        return;
      }
      const P = Wd.POSTER;
      if (w.x > P.x && w.x < P.x + P.w && w.y > P.y && w.y < P.y + P.h) { openRanking(); return; }
      pendingTalk = false;
      me.tx = clamp(w.x, 20, 620); me.ty = clamp(w.y, 152, 352);
      clickMarks.push({ x: me.tx, y: me.ty, t: 0 });
    });

    // botão de beber (segurar)
    const db = $('btn-drink');
    const down = (e) => { e.preventDefault(); FT.audio.init(); holdBtn = true; try { db.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } };
    const up = () => { holdBtn = false; };
    db.addEventListener('pointerdown', down);
    db.addEventListener('pointerup', up);
    db.addEventListener('pointercancel', up);
    db.addEventListener('lostpointercapture', up);
    db.addEventListener('contextmenu', (e) => e.preventDefault());

    $('btn-smoke').onclick = startSmoking;
    $('btn-board').onclick = openRanking;
    $('rank-close').onclick = () => { $('ranking').hidden = true; };
    $('ranking').addEventListener('pointerdown', (e) => { if (e.target === $('ranking')) $('ranking').hidden = true; });
    $('btn-sound').onclick = () => { FT.audio.init(); FT.audio.setMuted(!FT.audio.muted); $('btn-sound').textContent = FT.audio.muted ? '🔇' : '🔊'; };
    $('btn-chat').onclick = () => { $('chatform').classList.toggle('open'); if ($('chatform').classList.contains('open')) $('chatinput').focus(); };
    $('btn-edit').onclick = editLook;

    $('chatform').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('chatinput');
      let text = inp.value.replace(/[<>]/g, '').trim().slice(0, 80);
      inp.value = '';
      inp.blur();
      $('chatform').classList.remove('open');
      if (!text || !running) return;
      text = slur(text, drunkVis);
      me.bubble = { text, until: performance.now() + 6500 };
      addLog(me.name, text, false);
      send({ t: 'ch', m: text });
    });

    // joystick virtual
    const joyEl = $('joy'), knob = $('joy-knob');
    const R = 50;
    const moveJoy = (e) => {
      const r = joyEl.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const m = Math.hypot(dx, dy) / R;
      joy.x = m < 0.18 ? 0 : dx / R; joy.y = m < 0.18 ? 0 : dy / R;
      if (m >= 0.18) { me.tx = me.ty = null; pendingTalk = false; }
    };
    joyEl.addEventListener('pointerdown', (e) => { e.preventDefault(); FT.audio.init(); joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
    joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) moveJoy(e); });
    const joyEnd = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
    joyEl.addEventListener('pointerup', joyEnd);
    joyEl.addEventListener('pointercancel', joyEnd);

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { holdBtn = holdKey = false; } });
  }
  function openChat() {
    $('chatform').classList.add('open');
    $('chatinput').focus();
  }

  // ---------- atualização ----------
  let sendSig = '', lastMvSent = 0, wasMoving = false, metaAfterStop = false;
  function update(dt, tms) {
    // dia virou?
    if (today() !== day) { day = today(); board = {}; me.beers = 0; me.bac = 0; boardSet(me.pid, me.name, 0); saveProfile(); toast('Novo dia, novo torneio! 🍺'); }

    const ko = isKO();
    if (me.koWas && !ko) { toast('Você acordou 🥴'); me.koWas = false; }
    me.koWas = ko;

    // movimento do jogador
    const kb = kbVec();
    let ix = kb.x + joy.x, iy = kb.y + joy.y;
    if (ko || me.smoking || dialogOpen()) { ix = iy = 0; }
    const mag = Math.hypot(ix, iy);
    if (mag > 0.05) { me.tx = me.ty = null; }
    me.ix = ix; me.iy = iy;
    const dl = drunkLevel();
    const wob = dl > 0 ? Math.sin(tms * 0.0021) * dl * 0.85 + Math.sin(tms * 0.0057) * dl * 0.3 : 0;
    const slow = (drinkingNow ? 0.6 : 1) * (1 - dl * 0.15);
    if (ko || me.smoking) { me.tx = me.ty = null; }
    stepMover(me, dt, SPEED * slow, wob);
    if (pendingTalk && nearHomem()) { me.tx = me.ty = null; talkHomem(); }

    // álcool diminui devagar
    me.bac = Math.max(0, me.bac - dt / 50);

    // fumando
    if (me.smoking) {
      me.smokeLeft -= dt;
      me.puffT -= dt;
      if (me.puffT <= 0) { me.puffT = 1.1; FT.audio.puff(); emitSmoke(me, 6); }
      if (me.smokeLeft <= 0) endSmoking();
    }
    updateDrink(dt);

    // rede: movimento
    const sig = [me.tx == null ? '' : Math.round(me.tx), me.ty == null ? '' : Math.round(me.ty), Math.round(me.ix * 8), Math.round(me.iy * 8)].join(',');
    const now = performance.now();
    if (sig !== sendSig || (me.moving && now - lastMvSent > 600) || (wasMoving && !me.moving)) {
      sendSig = sig; lastMvSent = now;
      send({ t: 'mv', x: Math.round(me.x), y: Math.round(me.y), ix: +me.ix.toFixed(2), iy: +me.iy.toFixed(2), tx: me.tx == null ? null : Math.round(me.tx), ty: me.ty == null ? null : Math.round(me.ty), d: +dl.toFixed(2) });
      if (wasMoving && !me.moving) pushMeta();
    }
    wasMoving = me.moving;

    // outros jogadores
    players.forEach((p) => {
      const k = Math.min(1, dt * 6), ax = p.ex * k, ay = p.ey * k;
      p.x += ax; p.y += ay; p.ex -= ax; p.ey -= ay;
      if (Date.now() < p.koUntil) { p.ix = p.iy = 0; p.tx = p.ty = null; p.moving = false; }
      else stepMover(p, dt, SPEED * (p.drinking ? 0.6 : 1) * (1 - p.drunk * 0.15), p.drunk > 0 ? Math.sin(tms * 0.0021 + p.x) * p.drunk * 0.5 : 0);
      if (p.smoking) { p.puffT = (p.puffT || 0) - dt; if (p.puffT <= 0) { p.puffT = 1.1; emitSmoke(p, 5); } }
    });

    // efeitos visuais
    const dTarget = dl;
    drunkVis += (dTarget - drunkVis) * Math.min(1, dt * 1.2);
    if (psyEnd > tms) {
      const el = (tms - psyStart) / 1000, left = (psyEnd - tms) / 1000;
      psyVis = Math.min(1, el / 3, left / 10);
    } else psyVis += (0 - psyVis) * Math.min(1, dt * 2);
    if (psyVis < 0.005) psyVis = 0;

    // fumaça do homem
    if (Math.random() < dt * 1.4) parts.push({ x: Wd.HOMEM.x + 8, y: Wd.HOMEM.y - 38, vx: rnd(-3, 4), vy: rnd(-12, -7), life: 0, max: rnd(2.2, 3.4), s: rnd(2.5, 4) });
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.s += dt * 3;
      if (q.life > q.max) parts.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= dt * 18; if (f.t > 1.6) floats.splice(i, 1); }
    for (let i = clickMarks.length - 1; i >= 0; i--) { clickMarks[i].t += dt; if (clickMarks[i].t > 0.6) clickMarks.splice(i, 1); }

    // hic ocasional
    if (dl > 0.3 && !ko && Math.random() < dt * 0.05 * dl) { me.bubble = { text: 'hic!', until: performance.now() + 1500 }; FT.audio.hic(); }

    if (boardDirty && Math.floor(tms / 3000) !== update._bt) { update._bt = Math.floor(tms / 3000); lsSet('board:' + day, board); boardDirty = false; }
    if (Math.floor(tms / 5000) !== update._st) { update._st = Math.floor(tms / 5000); saveProfile(); }
    if (Math.floor(tms / 250) !== update._ht) { update._ht = Math.floor(tms / 250); updateStatus(); }
    if (tms > 12000) $('hint').classList.add('gone');
  }
  function emitSmoke(p, n) {
    for (let i = 0; i < n; i++) parts.push({ x: p.x + p.face * 5 + rnd(-2, 2), y: p.y - 42, vx: rnd(-6, 6) + p.face * 3, vy: rnd(-16, -8), life: 0, max: rnd(1.8, 3), s: rnd(2, 4), g: 1 });
  }
  function updateStatus() {
    $('beer-n').textContent = me.beers;
    $('level-label').textContent = levelLabel(me.bac);
    $('level-bar').style.width = clamp((me.bac / KO_BAC) * 100, 0, 100) + '%';
  }

  // ---------- desenho ----------
  function wrapText(c, text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function drawBubble(c, text, x, y, fs) {
    c.font = `800 ${fs}px Nunito, sans-serif`;
    const lines = wrapText(c, text, fs * 11);
    let w = 0; lines.forEach((l) => { w = Math.max(w, c.measureText(l).width); });
    const lh = fs * 1.15, pad = fs * 0.5;
    const bw = w + pad * 2, bh = lines.length * lh + pad * 1.2;
    const bx = clamp(x - bw / 2, 4, Wd.W - bw - 4), by = y - bh - fs * 0.5;
    c.fillStyle = 'rgba(255,255,255,.96)'; c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 1;
    rrect(c, bx, by, bw, bh, fs * 0.5); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - fs * 0.35, by + bh - 0.5); c.lineTo(x, by + bh + fs * 0.5); c.lineTo(x + fs * 0.35, by + bh - 0.5); c.fillStyle = 'rgba(255,255,255,.96)'; c.fill();
    c.fillStyle = '#1b1020'; c.textAlign = 'center'; c.textBaseline = 'top';
    lines.forEach((l, i) => c.fillText(l, bx + bw / 2, by + pad * 0.7 + i * lh));
  }

  function drawPlayer(c, p, tms, isMe) {
    const koNow = isMe ? isKO() : Date.now() < p.koUntil;
    const frame = p.moving ? [0, 1, 0, 2][Math.floor(p.anim * 7.5) % 4] : 0;
    const pose = p.drinking ? 'mug' : p.smoking ? 'joint' : 'none';
    const red = Date.now() < p.redUntil;
    const spr = S.get(p.look, { dir: p.up && !koNow ? 'up' : 'down', frame: koNow ? 0 : frame, pose: koNow ? 'none' : pose, red: red && !koNow });
    // sombra
    c.fillStyle = 'rgba(0,0,0,.32)';
    c.beginPath(); c.ellipse(p.x, p.y, 13, 4, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(p.x, p.y);
    const dd = isMe ? drunkVis : p.drunk;
    if (dd > 0 && !koNow) c.rotate(Math.sin(tms * 0.0023 + p.x * 0.05) * dd * 0.09);
    if (koNow) { c.rotate(-Math.PI / 2 * p.face); c.translate(0, -2); }
    if (p.face < 0) c.scale(-1, 1);
    c.drawImage(spr, -20, -64);
    c.restore();
    if (koNow) {
      c.font = '800 14px Nunito, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#cfe0ff';
      c.fillText('z', p.x + 10, p.y - 34 - ((tms / 400) % 3) * 4); c.fillText('Z', p.x + 20, p.y - 44 - ((tms / 500) % 3) * 4);
    }
  }

  function drawLabel(c, p, fs, isMe) {
    const top = p.y - 68;
    c.font = `900 ${fs}px Nunito, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const label = p.name + (p.beers ? '  🍺' + p.beers : '');
    c.lineWidth = fs * 0.28; c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineJoin = 'round';
    c.strokeText(label, p.x, top);
    c.fillStyle = isMe ? '#ffd24a' : '#ffffff';
    c.fillText(label, p.x, top);
    if (p.bubble && p.bubble.until > performance.now()) drawBubble(c, p.bubble.text, p.x, top - fs * 1.1, fs);
  }

  function drawNeon(c, tms) {
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const fl = Math.sin(tms * 0.0021) > 0.992 || (Math.floor(tms / 90) % 61 === 0) ? 0.45 : 1;
    c.globalAlpha = fl;
    c.font = '34px Bungee, Impact, sans-serif';
    c.shadowColor = '#ff2d84'; c.shadowBlur = 22 * Sc;
    c.fillStyle = '#ff6fb0'; c.fillText('FIOTÕES', 190, 44);
    c.shadowBlur = 8 * Sc; c.fillStyle = '#ffe3f0'; c.fillText('FIOTÕES', 190, 44);
    c.shadowBlur = 0;
    c.font = '9px Bungee, Impact, sans-serif';
    c.shadowColor = '#38e1ff'; c.shadowBlur = 8 * Sc; c.fillStyle = '#9defff';
    c.fillText('· BAR & TORNEIO DA GELADA ·', 190, 56);
    c.restore();
  }

  function drawPoster(c) {
    const P = Wd.POSTER;
    c.save();
    c.beginPath(); c.rect(P.x, P.y, P.w, P.h); c.clip();
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#7a1c1c'; c.font = '16px Bungee, Impact, sans-serif';
    c.fillText('TORNEIO FIOTÕES', P.x + P.w / 2, P.y + 20);
    c.fillStyle = '#5a4020'; c.font = '800 8px Nunito, sans-serif';
    c.fillText('QUEM BEBE MAIS? · ' + day.split('-').reverse().slice(0, 2).join('/'), P.x + P.w / 2, P.y + 31);
    c.fillStyle = '#7a1c1c'; c.fillRect(P.x + 12, P.y + 34, P.w - 24, 1);
    const rows = boardRows().slice(0, 6);
    c.textBaseline = 'middle';
    if (!rows.length) {
      c.fillStyle = '#5a4020'; c.font = '800 10px Nunito, sans-serif';
      c.fillText('Ninguém bebeu ainda...', P.x + P.w / 2, P.y + 64);
      c.fillText('seja o primeiro! 🍺', P.x + P.w / 2, P.y + 80);
    }
    rows.forEach((r, i) => {
      const y = P.y + 45 + i * 11.4;
      c.font = '900 9px Nunito, sans-serif';
      c.textAlign = 'left';
      c.fillStyle = i === 0 ? '#b8860b' : '#5a4020';
      c.fillText(String(i + 1) + 'º', P.x + 14, y);
      c.fillStyle = r.me ? '#c0145a' : '#2a1608';
      c.fillText(r.n.length > 13 ? r.n.slice(0, 12) + '…' : r.n, P.x + 36, y);
      if (r.on) { c.fillStyle = '#2aa84a'; c.beginPath(); c.arc(P.x + 128, y, 2, 0, 6.3); c.fill(); }
      c.textAlign = 'right'; c.fillStyle = '#7a1c1c'; c.font = '900 10px Nunito, sans-serif';
      c.fillText(r.b + ' 🍺', P.x + P.w - 14, y);
    });
    c.restore();
  }

  function lighting(tms) {
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, 160, 90);
    dctx.fillStyle = 'rgba(10,4,20,0.6)';
    dctx.fillRect(0, 0, 160, 90);
    dctx.globalCompositeOperation = 'destination-out';
    const flick = 0.8 + 0.2 * Math.sin(tms * 0.013) * Math.sin(tms * 0.0071);
    const lights = Wd.LIGHTS.concat([{ x: Wd.HOMEM.x + 6, y: Wd.HOMEM.y - 30, r: 46, a: 0.55 * flick }]);
    for (const L of lights) {
      const x = L.x / 4, y = L.y / 4, r = L.r / 4;
      const g = dctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${L.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g; dctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function glows(c, tms) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const blob = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
    blob(190, 40, 130, 'rgba(255,45,130,.16)');
    blob(606, 120, 60, `rgba(${100 + 90 * Math.sin(tms / 500)},60,${150 + 90 * Math.sin(tms / 650 + 2)},.22)`);
    blob(Wd.HOMEM.x + 6, Wd.HOMEM.y - 32, 38, `rgba(255,40,40,${0.16 * (0.8 + 0.2 * Math.sin(tms * 0.013))})`);
    c.restore();
  }

  function renderScene(tms) {
    const c = sctx;
    c.setTransform(Sc, 0, 0, Sc, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
    c.drawImage(bg, 0, 0);

    // objetos ordenados por profundidade
    const objs = [];
    const T = Wd.sprites;
    Wd.TABLES.forEach((t) => objs.push({ y: t.y + 10, f: () => c.drawImage(T.table, t.x - 40, t.y + 10 - 48) }));
    objs.push({ y: Wd.CRATES.y + Wd.CRATES.h + 2, f: () => c.drawImage(T.crates, 10, Wd.CRATES.y + Wd.CRATES.h + 2 - 42) });
    objs.push({ y: Wd.PLANT.y + 4, f: () => c.drawImage(T.plant, Wd.PLANT.x - 15, Wd.PLANT.y + 4 - 42) });
    objs.push({ y: Wd.HOMEM.y, f: () => { c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(Wd.HOMEM.x, Wd.HOMEM.y, 13, 4, 0, 0, 6.3); c.fill(); c.drawImage(homemSpr, Wd.HOMEM.x - 20, Wd.HOMEM.y - 64); } });
    players.forEach((p) => objs.push({ y: p.y, f: () => drawPlayer(c, p, tms, false) }));
    objs.push({ y: me.y, f: () => drawPlayer(c, me, tms, true) });
    objs.sort((a, b) => a.y - b.y);
    objs.forEach((o) => o.f());

    // fumaça (homem + jogadores)
    parts.forEach((q) => {
      const a = (1 - q.life / q.max) * (q.g ? 0.5 : 0.28);
      c.fillStyle = `rgba(225,225,235,${a})`;
      c.beginPath(); c.arc(q.x, q.y, q.s, 0, 6.3); c.fill();
    });

    // iluminação
    lighting(tms);
    c.imageSmoothingEnabled = true;
    c.drawImage(dark, 0, 0, Wd.W, Wd.H);
    c.imageSmoothingEnabled = false;
    glows(c, tms);
    drawNeon(c, tms);
    drawPoster(c);

    // marcadores de clique
    clickMarks.forEach((m) => {
      const k = m.t / 0.6;
      c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(m.x, m.y, 4 + k * 12, (4 + k * 12) * 0.5, 0, 0, 6.3); c.stroke();
    });

    // nomes e balões
    const fs = Math.max(9, 10.5 / Sc);
    const all = [...players.values(), me].sort((a, b) => a.y - b.y);
    all.forEach((p) => drawLabel(c, p, fs, p === me));

    // dica do homem
    if (nearHomem() && !dialogOpen() && !me.smoking) {
      drawBubble(c, me.hasJoint ? '…' : 'psiu… vem cá 👆', Wd.HOMEM.x, Wd.HOMEM.y - 74, fs);
    }
    // textos flutuantes
    floats.forEach((f) => {
      c.globalAlpha = clamp(1.6 - f.t, 0, 1);
      c.font = `900 ${fs * 1.3}px Nunito, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)';
      c.strokeText(f.text, f.x, f.y); c.fillStyle = f.col; c.fillText(f.text, f.x, f.y);
    });
    c.globalAlpha = 1;
  }

  let lastFilter = '';
  function composite(tms) {
    const w = view.width, h = view.height;
    const d = drunkVis, ps = psyVis;
    const c = vctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    if (ps > 0.02) {
      // rastro psicodélico: reaproveita o quadro anterior, levemente ampliado e girado
      c.globalAlpha = 1;
      c.save();
      c.translate(w / 2, h / 2); c.rotate(Math.sin(tms / 900) * 0.006 * ps); c.scale(1 + 0.012 * ps, 1 + 0.012 * ps); c.translate(-w / 2, -h / 2);
      c.drawImage(view, 0, 0);
      c.restore();
      c.globalAlpha = 1 - ps * 0.55;
    } else { c.globalAlpha = 1; c.clearRect(0, 0, w, h); }
    c.save();
    c.translate(w / 2, h / 2);
    const sway = Math.sin(tms * 0.0013) * d * 0.045 + Math.sin(tms * 0.0031) * d * 0.015;
    const zoom = 1 + d * 0.05 + d * 0.025 * Math.sin(tms * 0.0017) + ps * 0.02 * Math.sin(tms / 700);
    c.rotate(sway); c.scale(zoom, zoom); c.translate(-w / 2, -h / 2);
    c.drawImage(scene, 0, 0);
    if (d > 0.12) {
      c.globalAlpha = (ps > 0.02 ? 1 - ps * 0.55 : 1) * (0.22 + 0.3 * d);
      c.translate(Math.sin(tms * 0.0013) * w * 0.012 * d * 2.4, Math.cos(tms * 0.0009) * h * 0.01 * d * 2.4);
      c.drawImage(scene, 0, 0);
    }
    c.restore();
    c.globalAlpha = 1;

    // filtros CSS
    const blur = d * 2.4 + (d > 0.5 ? Math.max(0, Math.sin(tms * 0.0011)) * (d - 0.5) * 3 : 0);
    const hue = ps > 0 ? (tms / 25) % 360 : d * 18 * Math.sin(tms * 0.0005);
    const f = `${blur > 0.15 ? `blur(${blur.toFixed(1)}px) ` : ''}${ps > 0 || d > 0.2 ? `hue-rotate(${hue.toFixed(0)}deg) saturate(${(1 + ps * 1.6 + d * 0.3).toFixed(2)}) ` : ''}${ps > 0 ? `contrast(${(1 + ps * 0.15).toFixed(2)})` : ''}`.trim();
    if (f !== lastFilter) { view.style.filter = f || 'none'; lastFilter = f; }

    $('fx-psy').style.opacity = (ps * 0.5).toFixed(2);
    $('fx-vignette').style.opacity = Math.min(1, d * 0.85).toFixed(2);
    // pálpebras pesadas
    let lid = 0;
    if (d > 0.5) lid = (d - 0.5) * 2 * 36 * Math.pow(0.5 + 0.5 * Math.sin(tms * 0.0009 + Math.sin(tms * 0.0003) * 2), 3);
    if (isKO()) lid = 50;
    lid = clamp(lid, 0, 50);
    $('fx-lid-top').style.height = lid + '%';
    $('fx-lid-bot').style.height = lid + '%';
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    const a = performance.now();
    update(dt, t);
    const b = performance.now();
    renderScene(t);
    const c2 = performance.now();
    composite(t);
    const d2 = performance.now();
    frame.perf = { update: +(b - a).toFixed(1), scene: +(c2 - b).toFixed(1), comp: +(d2 - c2).toFixed(1), w: view.width, h: view.height };
    requestAnimationFrame(frame);
  }

  // ---------- setup ----------
  function resize() {
    const stage = $('stage');
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.width = Math.round(r.width * dpr); view.height = Math.round(r.height * dpr);
    scene.width = view.width; scene.height = view.height;
    Sc = view.width / Wd.W;
    lastFilter = '';
  }

  let inputBound = false;
  function startGame(p) {
    FT.audio.init();
    day = today();
    // perfil do dia (a contagem de cervejas continua se for o mesmo dia)
    profile = newProfile(p);
    const prev = lsGet('profile', null);
    const sameDay = prev && prev.day === day && prev.pid === profile.pid;
    profile.beers = sameDay ? prev.beers | 0 : 0;
    profile.bac = sameDay ? Math.max(0, (prev.bac || 0) - (Date.now() - (prev.bacT || Date.now())) / 50000) : 0;
    lsSet('profile', profile);
    board = lsGet('board:' + day, {});

    $('screen-create').hidden = true;
    $('screen-game').hidden = false;
    if (!bg) { bg = Wd.renderBg(); Wd.buildSprites(); homemSpr = S.get(S.HOMEM_LOOK, {}); }
    resize();

    players.clear();
    $('chatlog').innerHTML = '';
    me = makePlayer(sid, { pid: profile.pid, name: profile.name, look: profile.look, x: rnd(300, 360), y: rnd(200, 230), beers: profile.beers });
    me.bac = profile.bac; me.hasJoint = false; me.jointReadyAt = 0; me.smokeLeft = 0; me.koWas = false;
    drunkVis = Math.min(1, drunkLevel()); psyVis = 0; psyEnd = 0; lastFilter = '';
    boardSet(me.pid, me.name, me.beers);
    drinkT = 0; drinkingNow = false; holdBtn = holdKey = false; pendingTalk = false;
    $('btn-smoke').hidden = true; $('dialog').hidden = true; $('ranking').hidden = true; $('hint').classList.remove('gone');
    $('btn-sound').textContent = FT.audio.muted ? '🔇' : '🔊';
    updateStatus(); updateOnline();

    // retrato do homem
    const fc = $('dlg-face').getContext('2d');
    fc.imageSmoothingEnabled = false; fc.clearRect(0, 0, 72, 72);
    fc.drawImage(homemSpr, 4, 0, 32, 30, 0, 0, 72, 68);

    if (!inputBound) { bindInput(); inputBound = true; }
    netStatus = 'connecting'; onStatus('connecting');
    net = FT.createNet({ room: CFG.ROOM || 'fiotoes', sid, cfg: CFG, meta: getMeta(), onMsg, onPeer, onPeerUpdate, onLeave, onStatus });
    addLog(null, 'Você entrou no FIOTÕES. Bora beber! 🍺', true);
    if (window.matchMedia('(pointer: coarse) and (orientation: portrait)').matches) toast('Dica: vire o celular na horizontal 📱↔️');
    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  function editLook() {
    running = false;
    saveProfile();
    if (net) { send({ t: 'sm', v: 0 }); net.close(); net = null; }
    view.style.filter = 'none';
    FT.creator.show(profile, startGame);
  }

  function boot() {
    FT.creator.show(profile, startGame);
    window.addEventListener('beforeunload', saveProfile);
    window.__ft = { get me() { return me; }, players, get board() { return board; }, get net() { return net; }, finishBeer, set bac(v) { me.bac = v; }, get psy() { return psyVis; }, get perf() { return frame.perf; }, tick(n, dt) { for (let i = 0; i < n; i++) update(dt || 0.05, performance.now()); renderScene(performance.now()); composite(performance.now()); }, bench(n) { const t0 = performance.now(); for (let i = 0; i < n; i++) { renderScene(t0 + i * 16); composite(t0 + i * 16); vctx.getImageData(0, 0, 1, 1); } return (performance.now() - t0) / n; }, get drunk() { return drunkVis; }, startSmoking, endSmoking };
  }
  let booted = false;
  const bootOnce = () => { if (!booted) { booted = true; boot(); } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(bootOnce);
  setTimeout(bootOnce, 1500);
})();
