// 파티클, 화면 흔들림, 데미지 숫자, 배너, WebAudio 효과음
var FX = (function () {
  function rnd(a, b) { return a + Math.random() * (b - a); }

  var fx = {
    parts: [], rings: [], nums: [], banners: [], flashes: [],
    shakeAmt: 0, ox: 0, oy: 0, muted: false,
  };

  fx.reset = function () {
    fx.parts.length = fx.rings.length = fx.nums.length = fx.banners.length = fx.flashes.length = 0;
    fx.shakeAmt = fx.ox = fx.oy = 0;
  };

  // p: {x,y,vx,vy,life,size,color,shape,g,drag,rot,vr}
  fx.particle = function (p) {
    p.max = p.life; p.rot = p.rot || 0; p.vr = p.vr || 0; p.g = p.g || 0;
    p.drag = p.drag == null ? 1 : p.drag; p.shape = p.shape || 'dot';
    fx.parts.push(p);
    if (fx.parts.length > 900) fx.parts.splice(0, 150);   // 너무 많으면 오래된 것부터 한 번에 정리 (매번 shift하면 느림)
    return p;
  };

  fx.burst = function (x, y, color, n, speed, size, life, shape, extra) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = speed * rnd(0.3, 1);
      var p = { x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * rnd(0.6, 1.2),
        size: size * rnd(0.6, 1.3), color: color, shape: shape || 'dot', drag: 0.9, vr: rnd(-10, 10) };
      if (extra) for (var k in extra) p[k] = extra[k];
      fx.particle(p);
    }
  };

  fx.ring = function (x, y, r0, r1, life, color, width) {
    fx.rings.push({ x: x, y: y, r0: r0, r1: r1, life: life, max: life, color: color, width: width || 8 });
  };

  // 데미지 숫자 / 월드 텍스트
  fx.num = function (x, y, amount, o) {
    o = o || {};
    var v = o.precise ? Math.round(amount * 10) / 10 : Math.round(amount);   // precise: 소수 첫째 자리까지 (포식자 8.8)
    if (v <= 0) return;
    var size = o.dot ? 30 : Math.min(130, 46 + amount * 2.4);
    fx.nums.push({ x: x + rnd(-24, 24), y: y, vy: o.dot ? -90 : -230, life: o.dot ? 0.7 : 1.0, max: o.dot ? 0.7 : 1.0,
      text: String(v), size: size, color: o.color || '#ffffff', pop: !o.dot });
  };
  fx.text = function (x, y, text, color, size, life) {
    fx.nums.push({ x: x, y: y, vy: -70, life: life || 1.1, max: life || 1.1, text: text, size: size || 64, color: color || '#fff', pop: true, label: true });
  };

  // 화면 중앙 큰 텍스트
  fx.banner = function (text, o) {
    o = o || {};
    if (fx.banners.length >= 3) fx.banners.shift();
    fx.banners.push({ text: text, sub: o.sub || '', color: o.color || '#fff', size: o.size || 120,
      life: o.life || 1.3, max: o.life || 1.3, y: o.y || CONFIG.screen.y + CONFIG.screen.h * 0.4 });
  };

  fx.flash = function (color, alpha, life) {
    fx.flashes.push({ color: color, alpha: alpha, life: life, max: life });
  };

  fx.shake = function (a) {
    if (!CONFIG.fx.shake) return;
    fx.shakeAmt = Math.min(70, Math.max(fx.shakeAmt, a * CONFIG.fx.shakeScale));
  };

  fx.update = function (dt) {
    var i, p;
    for (i = fx.parts.length - 1; i >= 0; i--) {
      p = fx.parts[i];
      p.life -= dt;
      if (p.life <= 0) { fx.parts.splice(i, 1); continue; }
      var d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d; p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (i = fx.rings.length - 1; i >= 0; i--) { fx.rings[i].life -= dt; if (fx.rings[i].life <= 0) fx.rings.splice(i, 1); }
    for (i = fx.nums.length - 1; i >= 0; i--) {
      p = fx.nums[i]; p.life -= dt; p.y += p.vy * dt; p.vy *= Math.pow(0.9, dt * 60);
      if (p.life <= 0) fx.nums.splice(i, 1);
    }
    for (i = fx.banners.length - 1; i >= 0; i--) { fx.banners[i].life -= dt; if (fx.banners[i].life <= 0) fx.banners.splice(i, 1); }
    for (i = fx.flashes.length - 1; i >= 0; i--) { fx.flashes[i].life -= dt; if (fx.flashes[i].life <= 0) fx.flashes.splice(i, 1); }
    fx.shakeAmt = Math.max(0, fx.shakeAmt - dt * (fx.shakeAmt * 7 + 6));
    fx.ox = rnd(-1, 1) * fx.shakeAmt; fx.oy = rnd(-1, 1) * fx.shakeAmt;
  };

  // ---------- 그리기 ----------
  fx.drawWorld = function (ctx) {
    var i, r, p, t;
    for (i = 0; i < fx.rings.length; i++) {
      r = fx.rings[i]; t = 1 - r.life / r.max;
      var e = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = r.color; ctx.lineWidth = r.width * (1 - t * 0.7);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2); ctx.stroke();
    }
    for (i = 0; i < fx.parts.length; i++) {
      p = fx.parts[i]; t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.5) * (p.alpha || 1);
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      if (p.shape === 'smoke') {
        ctx.globalAlpha = t * 0.55;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.8 - t), 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = p.size * 0.5; ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.shape === 'shard' || p.shape === 'square' || p.shape === 'feather') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath();
        if (p.shape === 'shard') { ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, p.size * 0.6); ctx.lineTo(-p.size * 0.6, p.size * 0.4); }
        else if (p.shape === 'feather') ctx.ellipse(0, 0, p.size, p.size * 0.35, 0, 0, Math.PI * 2);
        else ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.fill(); ctx.restore();
      } else if (p.shape === 'custom') {   // 직접 그리는 파티클 (부랄딱밤 사진 등)
        ctx.globalAlpha = Math.min(1, t * 2.5);
        p.draw(ctx, p.x, p.y, t, p);
      } else if (p.shape === 'ghost') {
        ctx.globalAlpha = t * 0.35;
        p.draw(ctx, p.x, p.y);
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  };

  function outlined(ctx, text, x, y, size, color, glow) {
    ctx.font = '700 ' + size + 'px "Do Hyeon","Malgun Gothic",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.09); ctx.strokeStyle = '#0a0612';
    ctx.strokeText(text, x, y);
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.35; }
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }
  fx.outlined = outlined;

  fx.drawNums = function (ctx) {
    for (var i = 0; i < fx.nums.length; i++) {
      var n = fx.nums[i], t = 1 - n.life / n.max;
      var s = n.pop && t < 0.15 ? 0.5 + (t / 0.15) * 0.7 : n.pop && t < 0.3 ? 1.2 - (t - 0.15) / 0.15 * 0.2 : 1;
      ctx.globalAlpha = Math.min(1, n.life / n.max * 2.5);
      outlined(ctx, n.text, n.x, n.y, n.size * s, n.color, n.label ? n.color : null);
    }
    ctx.globalAlpha = 1;
  };

  fx.drawScreen = function (ctx) {
    var W = CONFIG.W, H = CONFIG.H, i;
    for (i = 0; i < fx.flashes.length; i++) {
      var f = fx.flashes[i];
      ctx.globalAlpha = f.alpha * (f.life / f.max);
      ctx.fillStyle = f.color; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < fx.banners.length; i++) {
      var b = fx.banners[i], t = 1 - b.life / b.max;
      var s = t < 0.1 ? 0.3 + t / 0.1 * 1.0 : t < 0.2 ? 1.3 - (t - 0.1) / 0.1 * 0.3 : 1 + (t - 0.2) * 0.08;
      ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
      var y = b.y - (fx.banners.length - 1 - i) * b.size * 0.9;
      ctx.save(); ctx.translate(W / 2, y); ctx.rotate(-0.05); ctx.scale(s, s);
      outlined(ctx, b.text, 0, 0, b.size, b.color, b.color);
      if (b.sub) outlined(ctx, b.sub, 0, b.size * 0.75, b.size * 0.36, '#ffffff');
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  // ---------- 사운드 (WebAudio 합성) ----------
  var ac = null, master = null, noiseBuf = null, lastPlay = {};
  fx.initAudio = function () {
    if (ac || typeof window === 'undefined') return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = fx.muted ? 0 : CONFIG.sound.volume;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
  };
  fx.setMuted = function (m) {
    fx.muted = m;
    if (master) master.gain.value = m ? 0 : CONFIG.sound.volume;
  };

  function tone(type, f0, f1, dur, vol, delay, vib) {
    var t = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vib) {
      var l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = vib[0]; lg.gain.value = vib[1];
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, type, delay) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = ac.currentTime + (delay || 0);
    var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }

  var SFX = {
    hit: function () { noise(0.07, 0.35, 2500); tone('sine', 220, 70, 0.1, 0.4); },
    bigHit: function () { noise(0.2, 0.6, 1500); tone('sine', 140, 40, 0.3, 0.7); tone('square', 300, 80, 0.12, 0.15); },
    skill: function () { tone('sawtooth', 320, 960, 0.16, 0.18); tone('square', 640, 1280, 0.1, 0.08, 0.05); },
    roll: function () { noise(0.5, 0.3, 400); tone('triangle', 120, 60, 0.45, 0.3); },
    throw: function () { noise(0.15, 0.25, 3000, 'highpass'); tone('sine', 600, 300, 0.15, 0.15); },
    scream: function () { tone('sawtooth', 800, 1250, 0.75, 0.28, 0, [17, 90]); tone('square', 1200, 1700, 0.7, 0.08, 0.02, [13, 120]); noise(0.6, 0.25, 2600, 'bandpass'); },
    awaken: function () { tone('sawtooth', 60, 40, 1.0, 0.4); tone('sine', 900, 120, 0.9, 0.2); noise(0.9, 0.3, 300); },
    slam: function () { noise(0.4, 0.8, 600); tone('sine', 110, 30, 0.5, 0.9); },
    thump: function () { noise(0.15, 0.4, 700); tone('sine', 160, 50, 0.2, 0.5); },
    bird: function () { tone('sine', 2200, 3200, 0.08, 0.12); tone('sine', 2600, 3600, 0.08, 0.12, 0.1); },
    slash: function () { noise(0.18, 0.5, 5000, 'highpass'); tone('sawtooth', 1800, 400, 0.15, 0.12); },
    arm: function () { tone('triangle', 1400, 2400, 0.12, 0.15); },
    dye: function () { for (var i = 0; i < 8; i++) tone('square', 600 + i * 90, 600 + i * 90, 0.05, 0.08, i * 0.08); },
    ding: function () { tone('triangle', 1320, 1320, 0.4, 0.25); tone('triangle', 1980, 1980, 0.4, 0.12, 0.05); },
    fire: function () { noise(0.4, 0.4, 900); },
    zap: function () { for (var i = 0; i < 5; i++) tone('square', 400 + Math.random() * 1600, 200, 0.05, 0.12, i * 0.04); },
    freeze: function () { tone('sine', 2400, 1200, 0.3, 0.15); noise(0.3, 0.2, 7000, 'highpass'); },
    shatter: function () { noise(0.35, 0.6, 6000, 'highpass'); tone('triangle', 3000, 800, 0.25, 0.2); },
    quake: function () { noise(0.45, 0.8, 250); tone('sine', 70, 30, 0.5, 0.9); },
    vanish: function () { tone('sine', 500, 60, 0.4, 0.3); noise(0.4, 0.2, 800); },
    blind: function () { tone('sine', 1800, 3600, 0.3, 0.2); tone('triangle', 2700, 5400, 0.3, 0.1); },
    phase: function () { tone('sine', 90, 30, 1.0, 0.8); tone('sawtooth', 200, 1600, 0.6, 0.18); noise(0.7, 0.35, 500); },
    ko: function () { noise(0.6, 0.8, 1200); tone('sawtooth', 400, 40, 0.8, 0.35); },
    count: function () { tone('square', 660, 660, 0.12, 0.18); },
    go: function () { tone('square', 990, 990, 0.35, 0.2); tone('square', 1320, 1320, 0.35, 0.1); },
    // 승리 팡파레: 북 + 빠른 상승 아르페지오 + 크게 울리는 장화음 + 반짝임
    victory: function () {
      noise(0.25, 0.6, 500); tone('sine', 150, 50, 0.3, 0.7);
      [392, 523, 659, 784].forEach(function (f, i) { tone('square', f, f, 0.12, 0.13, i * 0.09); tone('triangle', f, f, 0.14, 0.18, i * 0.09); });
      [523, 659, 784, 1047].forEach(function (f) { tone('sawtooth', f, f * 1.005, 1.1, 0.07, 0.38, [5, 6]); tone('triangle', f, f, 1.2, 0.12, 0.38); });
      tone('triangle', 131, 131, 1.2, 0.35, 0.38); noise(0.2, 0.5, 600, 'lowpass', 0.38);
      noise(0.9, 0.12, 9000, 'highpass', 0.4);
      [1568, 2093, 2637].forEach(function (f, i) { tone('sine', f, f, 0.25, 0.06, 0.6 + i * 0.12); });
    },
    // 보스에게 졌을 때: 내려가는 단조
    lose: function () { [392, 349, 311, 262].forEach(function (f, i) { tone('triangle', f, f * 0.98, 0.32, 0.2, i * 0.22); tone('sawtooth', f / 2, f / 2, 0.32, 0.06, i * 0.22); }); noise(0.6, 0.2, 300, 'lowpass', 0.66); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone('triangle', f, f, 0.35, 0.22, i * 0.11); }); },
    click: function () { tone('square', 900, 1200, 0.05, 0.12); },
    // 조하람 주뱃: 초음파 발사 / 명중 / 충전기 생성 / 해피
    ultra: function () {
      tone('sine', 2500, 9000, 0.4, 0.3, 0, [30, 600]); tone('square', 1200, 4200, 0.35, 0.12, 0.03);
      tone('sawtooth', 300, 1800, 0.3, 0.15); noise(0.35, 0.35, 6000, 'highpass');
    },
    ultraHit: function () {
      noise(0.3, 0.7, 5000, 'highpass'); tone('sine', 240, 45, 0.45, 0.9); tone('triangle', 5000, 900, 0.3, 0.25);
      tone('square', 3000, 3000, 0.08, 0.15, 0.05); tone('square', 3600, 3600, 0.08, 0.15, 0.13);
    },
    spawn: function () { tone('sine', 1400, 2100, 0.12, 0.18); tone('sine', 2100, 2800, 0.12, 0.14, 0.08); },
    happy: function () { [880, 1108, 1318, 1760, 2217].forEach(function (f, i) { tone('triangle', f, f * 1.02, 0.18, 0.25, i * 0.06); }); noise(0.3, 0.15, 8000, 'highpass', 0.2); },
    // 문남휘 / 유재운 / 진형권
    patch: function () { for (var i = 0; i < 6; i++) tone('square', 200 + Math.random() * 2400, 100 + Math.random() * 800, 0.04, 0.12, i * 0.035); },
    laserCharge: function () { tone('sawtooth', 150, 1400, 0.6, 0.15); tone('sine', 300, 2800, 0.6, 0.1); },
    laser: function () { tone('sawtooth', 110, 90, 0.45, 0.45); tone('square', 55, 50, 0.45, 0.35); noise(0.45, 0.6, 1800, 'bandpass'); tone('sine', 1800, 300, 0.4, 0.2); },
    bass: function () { tone('sawtooth', 82, 78, 0.45, 0.5); tone('sine', 41, 40, 0.5, 0.7); tone('square', 164, 160, 0.15, 0.12); noise(0.1, 0.3, 300); },
    pickup: function () { tone('square', 500, 1000, 0.1, 0.15); },
    powerup: function () { tone('triangle', 300, 1500, 0.35, 0.3); tone('square', 150, 750, 0.35, 0.12); noise(0.2, 0.2, 400); },
    glitch: function () { for (var i = 0; i < 8; i++) tone(i % 2 ? 'square' : 'sawtooth', 80 + Math.random() * 3000, 60 + Math.random() * 600, 0.05, 0.14, i * 0.03); noise(0.25, 0.3, 3000, 'bandpass'); },
    drool: function () { noise(0.12, 0.25, 600, 'lowpass'); tone('sine', 300, 120, 0.12, 0.2); },
    bite: function () { noise(0.1, 0.5, 2500); tone('square', 520, 180, 0.12, 0.25); tone('sawtooth', 900, 1300, 0.15, 0.12, 0.05); },
    punch: function () { noise(0.25, 0.8, 900); tone('sine', 180, 40, 0.35, 0.9); tone('square', 90, 60, 0.2, 0.25); },
    coin: function () { tone('square', 988, 988, 0.07, 0.12); tone('square', 1319, 1319, 0.25, 0.12, 0.07); },
    stockUp: function () { [523, 659, 784].forEach(function (f, i) { tone('triangle', f, f, 0.12, 0.2, i * 0.06); }); },
    stockDown: function () { tone('sawtooth', 600, 120, 0.4, 0.22); noise(0.3, 0.3, 700); },
    crash: function () { noise(0.7, 0.7, 500); tone('sawtooth', 300, 50, 0.8, 0.35); tone('square', 880, 440, 0.3, 0.15, 0.1); },
    guitar: function () { [82, 110, 147, 196].forEach(function (f, i) { tone('sawtooth', f * 1.03, f, 0.6, 0.18, i * 0.02, [6, 8]); }); tone('square', 233, 220, 0.5, 0.12, 0, [11, 30]); noise(0.15, 0.2, 2000); },
    type: function () { for (var i = 0; i < 3; i++) { noise(0.025, 0.25, 4000, 'highpass', i * 0.05); tone('square', 1800 + Math.random() * 600, 1200, 0.02, 0.06, i * 0.05); } },
    ddakbam: function () { noise(0.08, 0.9, 5000, 'highpass'); tone('square', 1600, 200, 0.2, 0.35); tone('sine', 120, 40, 0.6, 0.8, 0.05); tone('sawtooth', 900, 1500, 0.5, 0.2, 0.15, [20, 120]); },
    shy: function () { tone('sine', 900, 400, 0.25, 0.15); },
    heal: function () { tone('sine', 660, 990, 0.2, 0.18); tone('sine', 990, 1320, 0.2, 0.12, 0.1); },
  };

  fx.sfx = function (name) {
    if (!ac || fx.muted || !SFX[name]) return;
    var now = ac.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.05) return; // 같은 소리 폭주 방지
    lastPlay[name] = now;
    try { SFX[name](); } catch (e) { /* 오디오 실패는 게임 진행에 영향 없음 */ }
  };

  return fx;
})();
