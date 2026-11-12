(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.SANTA_CONFIG || {};
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  let data = null, current = null, soundOn = false, actx = null;

  /* ---------- decrypt ---------- */
  async function decryptFor(name, code) {
    const e = data.entries[name];
    const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(e.salt), iterations: data.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(e.iv) }, key, b64(e.ct));
    return JSON.parse(dec.decode(pt)).giftee;
  }

  /* ---------- screens ---------- */
  const show = id => ['step-who', 'step-code', 'step-reveal'].forEach(s => $(s).hidden = s !== id);

  function renderNames() {
    const box = $('names');
    box.innerHTML = '';
    data.people.forEach(p => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="av">${p[0]}</span><span>${p}</span>`;
      b.onclick = () => { current = p; $('who-name').textContent = p; $('error').hidden = true; $('code').value = ''; show('step-code'); setTimeout(() => $('code').focus(), 50); };
      box.appendChild(b);
    });
  }

  $('back').onclick = () => { current = null; show('step-who'); };

  $('code-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const code = $('code').value.trim().toUpperCase();
    if (code.length < 6) return fail();
    const btn = $('go'); btn.disabled = true; btn.textContent = 'Checking the nice list…';
    try {
      const giftee = await decryptFor(current, code);
      prepareReveal(giftee);
    } catch { fail(); }
    btn.disabled = false; btn.textContent = 'Open my gift tag';
  });

  function fail() {
    $('error').hidden = false;
    const i = $('code'); i.classList.remove('shake'); void i.offsetWidth; i.classList.add('shake');
  }

  function prepareReveal(giftee) {
    $('who-name2').textContent = current;
    $('giftee').textContent = giftee;
    $('gift').classList.remove('open');
    $('after').hidden = true; $('tap-hint').hidden = false;
    show('step-reveal');
  }

  function unwrap() {
    const g = $('gift');
    if (g.classList.contains('open')) return;
    g.classList.add('open');
    $('tap-hint').hidden = true;
    chime(); confetti();
    setTimeout(() => { $('after').hidden = false; }, 900);
  }
  $('gift').onclick = unwrap;
  $('gift').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unwrap(); } };

  $('hide').onclick = () => {
    $('giftee').textContent = '';
    current = null; $('code').value = '';
    show('step-who');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------- details, countdown, calendar ---------- */
  function setup() {
    $('title').textContent = cfg.title || 'Secret Santa';
    document.title = cfg.title || 'Secret Santa';

    const hasTime = (cfg.exchangeDate || '').includes('T');
    const d = cfg.exchangeDate ? new Date(hasTime ? cfg.exchangeDate : cfg.exchangeDate + 'T00:00:00+08:00') : null;
    const rows = [];
    if (cfg.budget) rows.push(['Budget', cfg.budget]);
    if (d && !isNaN(d)) rows.push(['When', d.toLocaleString('en-SG', hasTime
      ? { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' }
      : { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })]);
    if (cfg.venue) rows.push(['Where', cfg.venue]);
    if (cfg.note) rows.push(['Note', cfg.note]);
    const dl = $('details');
    if (rows.length) dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    else dl.hidden = true;

    if (d && !isNaN(d)) {
      tick(d); setInterval(() => tick(d), 1000);
      const ics = $('ics'); ics.hidden = false;
      const fmt = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const day = x => x.toISOString().slice(0, 10).replace(/-/g, '');
      const dates = hasTime
        ? ['DTSTART:' + fmt(d), 'DTEND:' + fmt(new Date(d.getTime() + 2 * 3600e3))]
        : ['DTSTART;VALUE=DATE:' + cfg.exchangeDate.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + day(new Date(d.getTime() + 36 * 3600e3))];
      const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SecretSanta//EN', 'BEGIN:VEVENT',
        'UID:secret-santa-' + d.getTime() + '@local', 'DTSTAMP:' + fmt(new Date()), ...dates,
        'SUMMARY:Secret Santa gift exchange 🎁', cfg.venue ? 'LOCATION:' + cfg.venue : '', 'END:VEVENT', 'END:VCALENDAR']
        .filter(Boolean).join('\r\n');
      ics.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
      ics.download = 'secret-santa.ics';
    }
  }
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function tick(d) {
    const el = $('countdown'); el.hidden = false;
    let s = Math.floor((d - Date.now()) / 1000);
    if (s <= 0) { el.className = 'countdown single'; el.textContent = '🎁 It\'s gift day!'; return; }
    const D = Math.floor(s / 86400), H = Math.floor(s % 86400 / 3600), M = Math.floor(s % 3600 / 60), S = s % 60;
    el.className = 'countdown';
    el.innerHTML = [[D, 'days'], [H, 'hrs'], [M, 'min'], [S, 'sec']].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');
  }

  /* ---------- sound ---------- */
  $('mute').onclick = () => {
    soundOn = !soundOn; $('mute').textContent = soundOn ? '🔔' : '🔇';
    if (soundOn) { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); chime(true); }
  };
  function chime() {
    if (!soundOn || !actx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.12;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.65);
    });
  }

  /* ---------- confetti & snow ---------- */
  function confetti() {
    const colors = ['#c8342f', '#e8b94a', '#fbf3e4', '#2f6b45', '#ff7a59'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2 + Math.random() * 2.2 + 's';
      c.style.animationDelay = Math.random() * .4 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c); setTimeout(() => c.remove(), 5000);
    }
  }

  (function snow() {
    const cv = $('snow'), ctx = cv.getContext('2d');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let w, h, flakes = [];
    const resize = () => { w = cv.width = innerWidth; h = cv.height = innerHeight; };
    addEventListener('resize', resize); resize();
    const n = Math.min(110, Math.floor(w / 6));
    for (let i = 0; i < n; i++) flakes.push({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 3, v: .4 + Math.random() * 1.1, p: Math.random() * 6 });
    (function loop() {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,.8)';
      flakes.forEach(f => {
        f.y += f.v; f.p += .01; f.x += Math.sin(f.p) * .4;
        if (f.y > h) { f.y = -5; f.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
      });
      requestAnimationFrame(loop);
    })();
  })();

  /* ---------- boot ---------- */
  fetch('data.json', { cache: 'no-store' }).then(r => r.json()).then(j => { data = j; renderNames(); setup(); })
    .catch(() => { $('names').textContent = 'Could not load the draw. Try refreshing.'; });
})();
