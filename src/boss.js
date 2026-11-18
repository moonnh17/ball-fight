// 보스전: 보스 정의(BOSSES), 보스 스킬, pixelfx 스프라이트 시트 재생, 보스전 전용 UI
// 보스 수치는 CONFIG.bosses (easy / hard 덮어쓰기), 이펙트 시트 정보는 fxsheets.js

// ---------- pixelfx 스프라이트 시트 ----------
var FxImg = {
  cache: {},
  get: function (name) {
    if (typeof Image === 'undefined' || !FX_SHEETS[name]) return null;
    var im = this.cache[name];
    if (!im) { im = this.cache[name] = new Image(); im.src = FX_SHEETS[name].src; }
    return im.complete && im.naturalWidth ? im : null;
  },
  preload: function () { var self = this; Object.keys(FX_SHEETS).forEach(function (k) { self.get(k); }); },
};
// 시트 한 번 재생 (loop 시트는 life초 동안). follow: 따라다닐 공
class SheetFx {
  constructor(name, x, y, o) {
    o = o || {};
    this.name = name; this.m = FX_SHEETS[name]; this.x = x; this.y = y; this.s = o.scale || 2; this.rot = o.rot || 0;
    this.t = 0; this.z = o.z != null ? o.z : 2; this.follow = o.follow || null; this.life = o.life != null ? o.life : null;
    this.alpha = o.alpha == null ? 1 : o.alpha; this.add = !!o.add; this.speed = o.speed || 1;
  }
  dur() { return this.m.n / this.m.fps / this.speed; }
  update(dt) {
    this.t += dt;
    if (this.follow) { if (!this.follow.alive) { this.dead = true; return; } this.x = this.follow.x; this.y = this.follow.y; }
    if (this.life != null ? this.t >= this.life : (!this.m.loop && this.t >= this.dur())) this.dead = true;
  }
  draw(ctx) {
    var img = FxImg.get(this.name); if (!img) return;
    var m = this.m, f = Math.floor(this.t * m.fps * this.speed);
    f = m.loop ? f % m.n : Math.min(m.n - 1, f);
    var a = this.alpha;
    if (this.life != null && this.life - this.t < 0.4) a *= Math.max(0, (this.life - this.t) / 0.4);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.translate(this.x, this.y); if (this.rot) ctx.rotate(this.rot);
    ctx.globalAlpha = a; if (this.add) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, (f % m.cols) * m.w, Math.floor(f / m.cols) * m.h, m.w, m.h, -m.px * this.s, -m.py * this.s, m.w * this.s, m.h * this.s);
    ctx.restore();
  }
}
function bfx(bt, name, x, y, o) { return bt.add(new SheetFx(name, x, y, o)); }

// ---------- 수치 ----------
function _bmerge(a, b) {
  var o = Object.assign({}, a);
  Object.keys(b || {}).forEach(function (k) {
    var v = b[k];
    o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? _bmerge(a[k], v) : v;
  });
  return o;
}
// 난이도 덮어쓰기 + 도전자 수만큼 체력
function bossConfig(id, diff, players) {
  var base = CONFIG.bosses[id], c = _bmerge(base, base[diff] || {});
  delete c.easy; delete c.hard;
  c.hp = Math.round(c.hpPerPlayer * Math.pow(Math.max(1, players), c.hpExp || 1));   // 인원이 많으면 광역기가 나눠 맞아서 조금 더 가파르게
  return c;
}

// ---------- 공용 ----------
function _bPlayers(bt, b) { return bt.enemies(b).filter(function (o) { return o.targetable; }); }
function _bPick(bt, b) { var ps = _bPlayers(bt, b); return ps.length ? ps[Math.floor(Math.random() * ps.length)] : null; }
// 지갑전사·자학개그가 안 통하는 사람: IZK 1기 + 진형권
function _bossImmune(o) { return _isIzk(o) || o.def.name === '진형권'; }
function _bClamp(v, a, z) { return v < a ? a : v > z ? z : v; }
function bossCast(bt, b, name, color) {
  b.data.cast = name; b.data.castT = 2.2;
  FX.banner(name, { color: color || '#ffd400', sub: b.name, size: 96, life: 1.2, y: CONFIG.arena.y + 130 });
  FX.sfx('skill');
}
// 핫식스 박스 탄 / 보스 투사체 공용: 플레이어에게 맞으면 피해
class BossBullet {
  constructor(bt, owner, x, y, ang, speed, damage, sheet) {
    this.bt = bt; this.owner = owner; this.x = x; this.y = y; this.ang = ang; this.vx = Math.cos(ang) * speed; this.vy = Math.sin(ang) * speed;
    this.dmg = damage; this.sheet = sheet; this.t = 0; this.z = 1;
  }
  update(dt) {
    var A = CONFIG.arena, self = this;
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > 3 || this.x < A.x || this.x > A.x + A.w || this.y < A.y || this.y > A.y + A.h) { this.dead = true; return; }
    var hit = _bPlayers(this.bt, this.owner).find(function (o) { return !o.air && _dist(o, self) < o.r + 12; });
    if (!hit) return;
    this.dead = true;
    this.bt.damage(hit, this.dmg, this.owner, { color: '#d6a8ff', kind: 'bossBullet' });
    FX.burst(this.x, this.y, '#c684ff', 8, 300, 6, 0.3, 'spark');
  }
  draw(ctx) {
    var img = FxImg.get(this.sheet), m = FX_SHEETS[this.sheet];
    if (!img) { ctx.fillStyle = '#c684ff'; ctx.beginPath(); ctx.arc(this.x, this.y, 10, 0, Math.PI * 2); ctx.fill(); return; }
    var f = Math.floor(this.t * m.fps) % m.n;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(this.x, this.y); ctx.rotate(this.ang);
    ctx.drawImage(img, (f % m.cols) * m.w, Math.floor(f / m.cols) * m.h, m.w, m.h, -m.px * 2, -m.py * 2, m.w * 2, m.h * 2);
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 60 }; }
}

// ---------- 히어로 바통 ----------
// 핫식스 박스: 보스가 먹으면 버프, 도전자가 먹으면 터지며 탄막
class Hot6Box {
  constructor(bt, owner, p, c) { this.bt = bt; this.owner = owner; this.x = p.x; this.y = p.y; this.c = c; this.t = 0; this.z = -1; this.k = c.size || 1; this.r = 44 * this.k; }
  update(dt) {
    var o = this.owner, c = this.c, bt = this.bt, self = this, i;
    this.t += dt;
    if (!o.alive || this.t > c.life) { this.dead = true; FX.burst(this.x, this.y, '#9b5cff', 14, 300, 8, 0.4, 'smoke'); return; }
    if (this.t < 0.6) return;
    if (!o.hidden && !o.phasing && _dist(o, this) < o.r + this.r) {   // 보스가 원샷
      this.dead = true;
      o.status.haste = c.buffTime; o.status.hasteMul = c.buffSpeed;
      o.status.atk = c.buffTime; o.status.atkMul = c.buffAtk;
      bfx(bt, 'blast_gold', o.x, o.y, { scale: 1.6 });
      bt.skillText(o, '핫식스 원샷!', '#ffd400'); FX.sfx('powerup'); FX.shake(12);
      bt.emit('bossBuff');
      return;
    }
    var e = _bPlayers(bt, o).find(function (q) { return !q.air && _dist(q, self) < q.r + self.r; });
    if (!e) return;
    this.dead = true;
    bt.damage(e, c.damage, o, { color: '#c684ff', kind: 'hot6box' });
    bfx(bt, 'blast_grape', this.x, this.y, { scale: 1.7 });
    var off = _rnd(0, Math.PI * 2);
    for (i = 0; i < c.bullets; i++) bt.add(new BossBullet(bt, o, this.x, this.y, off + i / c.bullets * Math.PI * 2, c.bulletSpeed, c.bulletDamage, 'orb_grape'));
    FX.sfx('shatter'); FX.shake(16);
    bt.emit('hot6Boom', { who: e.def.id });
  }
  draw(ctx) {
    var blink = this.c.life - this.t < 2 && Math.sin(this.t * 20) > 0, s = Math.min(1, this.t / 0.3), bob = Math.sin(this.t * 3) * 3;
    ctx.save(); ctx.translate(this.x, this.y + bob); ctx.scale(s * this.k, s * this.k); ctx.globalAlpha = blink ? 0.5 : 1;
    ctx.shadowColor = '#b07cff'; ctx.shadowBlur = 26;
    ctx.fillStyle = '#b5834a'; Battle.roundRect(ctx, -42, -30, 84, 60, 6); ctx.fill();   // 상자
    ctx.shadowBlur = 0; ctx.fillStyle = '#8f6233'; ctx.fillRect(-42, -30, 84, 10);
    ctx.fillStyle = '#5a1f9a'; ctx.fillRect(-30, -6, 60, 22);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 16px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('HOT6 x24', 0, 6);
    for (var i = 0; i < 6; i++) {   // 위로 보이는 캔
      ctx.fillStyle = '#7a35c8'; ctx.beginPath(); ctx.arc(-30 + i * 12, -34, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c0c0d0'; ctx.beginPath(); ctx.arc(-30 + i * 12, -34, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 100 }; }
}
// 지갑전사 지폐: 맞으면 조금 회복되지만 잠깐 아무것도 못 함 (IZK는 무효). 최휘는 잔고도 오름
class CoinShot {
  constructor(bt, owner, ang, c) {
    this.bt = bt; this.owner = owner; this.c = c; this.x = owner.x; this.y = owner.y; this.vx = Math.cos(ang) * c.speed; this.vy = Math.sin(ang) * c.speed; this.t = 0; this.z = 1;
    this.spin = _rnd(-10, 10);
  }
  update(dt) {
    var A = CONFIG.arena, self = this, c = this.c, bt = this.bt;
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > 3 || this.x < A.x || this.x > A.x + A.w || this.y < A.y || this.y > A.y + A.h) { this.dead = true; return; }
    if (Math.random() < dt * 14) FX.particle({ x: this.x, y: this.y, vx: _rnd(-40, 40), vy: _rnd(-40, 40), life: 0.4, size: 5, color: '#9be59b', shape: 'spark' });
    var e = _bPlayers(bt, this.owner).find(function (q) { return !q.air && _dist(q, self) < q.r + 20; });
    if (!e) return;
    this.dead = true;
    if (_bossImmune(e)) { FX.text(e.x, e.y - e.r - 40, '안 받아!', '#00e5ff', 40, 0.8); bt.emit('walletImmune', { who: e.def.id }); return; }
    bt.heal(e, c.heal);
    e.status.stun = Math.max(e.status.stun, c.stun);
    FX.text(e.x, e.y - e.r - 50, '돈이다…!', '#9be59b', 44, 1.0); FX.sfx('coin');
    FX.burst(e.x, e.y, '#6fdc7a', 16, 400, 8, 0.5, 'square');
    if (e.data && e.data.chart && typeof hauSet === 'function') {   // 최휘: 받은 돈은 계좌로
      hauSet(bt, e, e.data.bal + c.money);
      FX.text(e.x, e.y - e.r - 90, '입금 +' + c.money + '만', '#ffd400', 40, 1.0);
      bt.emit('walletHau', { bal: e.data.bal });
    }
    bt.emit('walletHit', { who: e.def.id });
  }
  draw(ctx) {   // 빙글 돌며 펄럭이는 지폐
    var a = this.t * this.spin;
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(a); ctx.scale(1, 0.35 + Math.abs(Math.cos(this.t * 9)) * 0.65);
    ctx.shadowColor = '#6fdc7a'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#7fe08a'; ctx.fillRect(-34, -17, 68, 34);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#2e8b3d'; ctx.lineWidth = 3; ctx.strokeRect(-29, -12, 58, 24);
    ctx.fillStyle = '#1f5f2a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8f5cc'; ctx.font = '700 13px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('₩', 0, 1);
    ctx.fillStyle = '#1f5f2a'; ctx.font = '700 10px "Malgun Gothic",sans-serif'; ctx.fillText('50000', -17, -5); ctx.fillText('50000', 17, 6);
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 70 }; }
}
var BATON_JOKES = ['히어로는 무슨... 그냥 바통이에요', '굴러다니는 게 제 인생이죠', '지갑은 얇고 배는 두껍고', '저 같은 게 보스라니...', '바통 터치도 못 받는 바통', '오늘도 혼자 끼야아악'];
// 자학개그: 맞으면 공격력 감소 (IZK는 무효)
class JokeShot {
  constructor(bt, owner, ang, c) {
    this.bt = bt; this.owner = owner; this.c = c; this.x = owner.x; this.y = owner.y; this.vx = Math.cos(ang) * c.speed; this.vy = Math.sin(ang) * c.speed; this.t = 0; this.z = 2;
    this.text = BATON_JOKES[Math.floor(Math.random() * BATON_JOKES.length)];
  }
  update(dt) {
    var A = CONFIG.arena, self = this, c = this.c, bt = this.bt;
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > 3.5 || this.x < A.x - 40 || this.x > A.x + A.w + 40 || this.y < A.y || this.y > A.y + A.h) { this.dead = true; return; }
    var e = _bPlayers(bt, this.owner).find(function (q) { return !q.air && _dist(q, self) < q.r + 30; });
    if (!e) return;
    this.dead = true;
    if (_bossImmune(e)) { FX.text(e.x, e.y - e.r - 40, '안 웃겨', '#00e5ff', 40, 0.8); bt.emit('jokeImmune', { who: e.def.id }); return; }
    bt.damage(e, c.damage, this.owner, { color: '#ffd400', kind: 'batonJoke' });
    e.status.atk = c.time; e.status.atkMul = c.atkMul;
    bfx(bt, 'pow', e.x, e.y - 10, { scale: 0.9 });
    FX.text(e.x, e.y - e.r - 60, '공격력 ↓', '#ff6b8a', 38, 0.9);
    bt.emit('jokeHit', { who: e.def.id });
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.sin(this.t * 9) * 0.08);
    FX.outlined(ctx, this.text, 0, 0, 28, '#ffd400');
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 110 }; }
}
// 뱅커 조준 표시
class BankMark {
  constructor(x, y, life, r, follow, color) { this.x = x; this.y = y; this.life = life; this.t = 0; this.r = r; this.z = -1; this.follow = follow || null; this.col = color || '#ff2b3b'; }
  update(dt) {
    this.t += dt;
    if (this.follow && this.follow.alive && this.t < this.life - 0.1) { this.x = this.follow.x; this.y = this.follow.y; }   // 거의 끝까지 따라감
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx) {
    var k = this.t / this.life;
    ctx.save(); ctx.strokeStyle = this.col; ctx.lineWidth = 6; ctx.shadowColor = this.col; ctx.shadowBlur = 20;
    ctx.globalAlpha = 0.5 + Math.sin(this.t * 30) * 0.3;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.fillStyle = this.col; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
// 바지 강림 (패시브, 고유 쿨타임): 보스 머리 위에서 카드가 뒤집히고
//   플(파랑) = 맵 전체에 원형 폭발이 무작위로 / 뱅(빨강) = 한 명을 끝까지 쫓는 큰 번개 (근처도 휘말림)
class Baccarat {
  constructor(bt, b, force) { this.bt = bt; this.b = b; this.force = force; this.t = 0; this.done = false; this.z = 3; b.data.bac = { t: 0, res: null }; }
  update(dt) {
    var b = this.b, bt = this.bt, c = b.cfg.baccarat;
    this.t += dt;
    if (!b.alive) { this.dead = true; b.data.bac = null; return; }
    b.data.bac.t = this.t;
    if (this.t < c.flip) { if (Math.random() < dt * 10) FX.sfx('click'); return; }
    if (!this.done) {
      this.done = true;
      var roll = Math.random(), res = this.force || (roll < c.tieChance ? 'T' : roll < c.tieChance + (1 - c.tieChance) / 2 ? 'P' : 'B'); b.data.bac.res = res;
      if (res === 'P') baccaratPlayer(bt, b, c); else if (res === 'B') baccaratBanker(bt, b, c); else baccaratTie(bt, b, c);
      bt.emit('baccarat', { res: res });
    }
    if (this.t >= c.flip + 0.8) { this.dead = true; b.data.bac = null; }
  }
  draw() {}
}
function startBaccarat(bt, b, force) {
  if (b.data.bac) return;
  bossCast(bt, b, '바지 강림', '#ff2b3b');
  bt.add(new Baccarat(bt, b, force));
  bt.emit('bossSkill', { skill: 'baccarat' });
}
function baccaratPlayer(bt, b, c) {
  var A = CONFIG.arena;
  FX.text(b.x, b.y - b.r - 90, '플레이어!', '#3b8bff', 70, 1.2); FX.sfx('freeze'); FX.shake(14);
  for (var i = 0; i < c.blasts; i++) (function (k) {
    var p = { x: _rnd(A.x + c.blastRadius * 0.5, A.x + A.w - c.blastRadius * 0.5), y: _rnd(A.y + c.blastRadius * 0.5, A.y + A.h - c.blastRadius * 0.5) };
    var delay = c.blastDelay + k * c.blastGap;
    bt.add(new BankMark(p.x, p.y, delay, c.blastRadius, null, '#3b8bff'));
    bt.after(delay, function () {
      bfx(bt, 'burst_blue', p.x, p.y, { scale: c.blastRadius / 70 });
      FX.ring(p.x, p.y, 20, c.blastRadius, 0.35, '#7fb3ff', 12); FX.shake(10); FX.sfx('shatter');
      _bPlayers(bt, b).forEach(function (o) { if (Math.hypot(o.x - p.x, o.y - p.y) < c.blastRadius + o.r * 0.5) bt.damage(o, c.playerDamage, b, { color: '#7fb3ff', kind: 'baccaratP' }); });
    });
  })(i);
}
// 무승부 연출: 경기장이 초록으로 물들었다가 빠짐
class TieTint {
  constructor(life) { this.t = 0; this.life = life; this.z = 2; }
  update(dt) { this.t += dt; if (this.t >= this.life) this.dead = true; }
  draw(ctx) {
    var A = CONFIG.arena, k = this.t / this.life, a = (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * 0.38;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(A.x + A.w / 2, A.y + A.h / 2, 0, A.x + A.w / 2, A.y + A.h / 2, Math.max(A.w, A.h) * 0.75);
    g.addColorStop(0, 'rgba(57,255,136,' + a * 0.6 + ')'); g.addColorStop(1, 'rgba(57,255,136,' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(A.x, A.y, A.w, A.h);
    ctx.restore();
  }
}
// 무승부(초록): 맵이 크게 흔들리고 초록으로 물들며 곳곳이 폭발, 도전자 전원 피해
function baccaratTie(bt, b, c) {
  var A = CONFIG.arena;
  bt.add(new TieTint(c.tieTint));
  for (var i = 0; i < c.tieBlasts; i++) (function (k) {
    var p = { x: _rnd(A.x + 60, A.x + A.w - 60), y: _rnd(A.y + 60, A.y + A.h - 60) }, delay = 0.45 + k * 0.13;
    bt.add(new BankMark(p.x, p.y, delay, c.tieBlastRadius, null, '#39ff88'));
    bt.after(delay, function () {
      bfx(bt, 'blast_gold', p.x, p.y, { scale: c.tieBlastRadius / 75 });
      FX.ring(p.x, p.y, 20, c.tieBlastRadius * 1.2, 0.4, '#39ff88', 14);
      FX.burst(p.x, p.y, '#39ff88', 18, 650, 12, 0.6, 'square'); FX.burst(p.x, p.y, '#eaffef', 8, 400, 8, 0.4);
      FX.shake(16); FX.sfx('thump');
      _bPlayers(bt, b).forEach(function (o) { if (Math.hypot(o.x - p.x, o.y - p.y) < c.tieBlastRadius + o.r * 0.5) bt.damage(o, c.tieBlastDamage, b, { color: '#7dff9a', kind: 'baccaratT' }); });
    });
  })(i);
  FX.banner('무승부!!', { color: '#39ff88', sub: '바지 강림 · 판이 뒤집힌다', size: 150, life: 1.5 });
  FX.flash('#39ff88', 0.35, 0.35); FX.sfx('quake'); FX.sfx('scream');
  [0, 0.25, 0.5, 0.75].forEach(function (d) { bt.after(d, function () { FX.shake(55 - d * 30); FX.sfx('slam'); }); });
  bfx(bt, 'blast_gold', b.x, b.y, { scale: 4 });
  for (var i = 0; i < 5; i++) FX.ring(b.x, b.y, b.r, 2200, 0.6 + i * 0.15, i % 2 ? '#ffffff' : '#39ff88', 22 - i * 3);
  _bPlayers(bt, b).forEach(function (o) {
    bt.damage(o, c.tieDamage, b, { color: '#7dff9a', kind: 'baccaratT' });
    FX.burst(o.x, o.y, '#39ff88', 12, 400, 9, 0.5, 'square');
  });
  bt.emit('baccaratTie');
}
function baccaratBanker(bt, b, c) {
  var tgt = _bPick(bt, b);
  FX.text(b.x, b.y - b.r - 90, '뱅커!!', '#ff2b3b', 76, 1.2);
  if (!tgt) return;
  var mark = bt.add(new BankMark(tgt.x, tgt.y, c.bankerDelay, c.bankerRadius, tgt));
  bfx(bt, 'strike_red', tgt.x, tgt.y, { scale: c.strikeScale, follow: tgt });
  bt.after(c.bankerDelay, function () {
    var mx = mark.x, my = mark.y;
    FX.shake(40); FX.flash('#ff2b3b', 0.35, 0.3); FX.sfx('ddakbam'); FX.sfx('bigHit');
    bfx(bt, 'smash_red', mx, my, { scale: c.bankerRadius / 32 });
    for (var i = 0; i < 3; i++) FX.ring(mx, my, 20, c.bankerRadius * (1 + i * 0.15), 0.4 + i * 0.12, i % 2 ? '#ffffff' : '#ff2b3b', 16 - i * 4);
    if (tgt.alive) bt.damage(tgt, c.bankerDamage, b, { color: '#ff5a50', kind: 'baccaratB' });
    _bPlayers(bt, b).forEach(function (o) { if (o !== tgt && Math.hypot(o.x - mx, o.y - my) < c.bankerRadius + o.r * 0.5) bt.damage(o, c.bankerDamage * c.splash, b, { color: '#ff5a50', kind: 'baccaratB' }); });
    bt.emit('banker', { who: tgt.def.id });
  });
}

// 노광석의 힘 파장: 틈(gap)으로 피할 수 있는 고리
class SongWave {
  constructor(bt, owner, x, y, c) {
    this.bt = bt; this.owner = owner; this.x = x; this.y = y; this.c = c; this.r = owner.r; this.hit = new Set(); this.z = 1; this.t = 0;
    var half = c.gapDeg * Math.PI / 360; this.half = half; this.gaps = [];
    for (var i = 0; i < c.gaps; i++) {   // 아래쪽 반원 안에서 서로 안 겹치게
      for (var k = 0; k < 20; k++) {
        var a = _rnd(0.12, 0.88) * Math.PI;
        if (this.gaps.every(function (g) { return Math.abs(g - a) > half * 2.4; })) { this.gaps.push(a); break; }
      }
    }
    this.gaps.sort(function (p, q) { return p - q; });
  }
  inGap(a) { var self = this; return this.gaps.some(function (g) { return Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < self.half; }); }
  update(dt) {
    var self = this, c = this.c;
    this.t += dt; this.r += c.speed * dt;
    _bPlayers(this.bt, this.owner).forEach(function (o) {
      if (self.hit.has(o) || o.air) return;
      var d = Math.hypot(o.x - self.x, o.y - self.y);
      if (Math.abs(d - self.r) > c.width / 2 + o.r * 0.6) return;
      if (self.inGap(Math.atan2(o.y - self.y, o.x - self.x))) return;
      self.hit.add(o);
      self.bt.damage(o, c.damage, self.owner, { color: '#ff7ad9', kind: 'song' });
      self.bt.emit('songHit', { who: o.def.id });
    });
    if (this.r > 2300) this.dead = true;
  }
  draw(ctx) {
    var c = this.c, self = this, a0 = -Math.PI * 0.05, a1 = Math.PI * 1.05;   // 위쪽은 맵 밖이라 아래쪽만
    var cuts = [a0]; this.gaps.forEach(function (g) { cuts.push(g - self.half, g + self.half); }); cuts.push(a1);
    ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = '#ff7ad9'; ctx.shadowBlur = 25; ctx.globalAlpha = Math.max(0.2, 1 - this.r / 2300);
    for (var i = 0; i < cuts.length; i += 2) {
      ctx.strokeStyle = '#ff7ad9'; ctx.lineWidth = c.width;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, cuts[i], cuts[i + 1]); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = c.width * 0.3; ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.font = '36px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    for (var n = 0; n < 6; n++) {
      var a = a0 + (n + 0.5) / 6 * (a1 - a0);
      if (!this.inGap(a)) ctx.fillText(n % 2 ? '♪' : '♬', this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r);
    }
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y + this.r * 0.7, r: this.r * 0.6 + 80 }; }
}
// 보스 오라: 발밑 마법진(pixelfx) + 흩날리는 불티
class BossAura {
  constructor(bt, b) { this.bt = bt; this.b = b; this.t = 0; this.z = -2; }
  update(dt) {
    var b = this.b;
    this.t += dt;
    if (!b.alive) { this.dead = true; return; }
    if (b.hidden) return;
    var col = b.color(), n = dt * (b.phase >= 3 ? 40 : 26);
    for (var i = 0; i < n || Math.random() < n - i; i++) {
      var a = _rnd(0, Math.PI * 2), rr = b.r * _rnd(0.9, 1.3);
      FX.particle({ x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr, vx: Math.cos(a) * _rnd(20, 80), vy: Math.sin(a) * _rnd(20, 80) - _rnd(40, 120), life: _rnd(0.5, 1.1), size: _rnd(5, 11), color: Math.random() < 0.3 ? '#ffffff' : col, shape: Math.random() < 0.5 ? 'spark' : 'square', vr: 6 });
      if (i > 6) break;
    }
  }
  draw(ctx) {
    var b = this.b; if (b.hidden || !b.alive) return;
    var name = b.phase >= 3 ? 'rune_red' : 'rune_gold', img = FxImg.get(name), m = FX_SHEETS[name];
    var s = b.r * 2 * 1.7 / m.w;
    ctx.save(); ctx.globalAlpha = 0.85; ctx.imageSmoothingEnabled = false;
    if (img) {
      var f = Math.floor(this.t * m.fps) % m.n;
      ctx.drawImage(img, (f % m.cols) * m.w, Math.floor(f / m.cols) * m.h, m.w, m.h, b.x - m.w * s / 2, b.y + b.r * 0.15 - m.h * s / 2, m.w * s, m.h * s);
    }
    // 은은한 후광
    var g = ctx.createRadialGradient(b.x, b.y, b.r * 0.8, b.x, b.y, b.r * 1.9);
    g.addColorStop(0, b.color() + '55'); g.addColorStop(1, b.color() + '00');
    ctx.globalAlpha = 0.7 + Math.sin(this.t * 4) * 0.2; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  light() { return { x: this.b.x, y: this.b.y, r: this.b.r * 2.4 }; }
}

// 스킬들: 전부 action을 돌려줌
var BATON_SKILLS = {
  // 1-1 끝까지 구르기: 구른 뒤 한 번 더 (하드는 세 번)
  roll: function (bt, b) {
    var c = b.cfg.roll, left = c.rolls, st, t, dir, dist, hit, gt = 0;
    bossCast(bt, b, '끝까지 구르기');
    function aim() {
      var tgt = _bPick(bt, b), p = tgt ? { x: tgt.x, y: tgt.y } : bt.randomPoint();
      var dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
      dir = { x: dx / d, y: dy / d }; dist = d + 240; st = 'wind'; t = 0; hit = new Set(); b.vx = b.vy = 0;
      b.data.tele = { kind: 'arrow', x: b.x, y: b.y, dx: dir.x, dy: dir.y, len: dist };
    }
    aim();
    return {
      moves: false, spinning: true,
      update: function (dt) {
        t += dt;
        if (st === 'wind') {
          b.rot -= dt * 10; b.jx = _rnd(-5, 5); b.jy = _rnd(-5, 5);
          if (t >= c.windup) { st = 'roll'; b.phasing = true; b.jx = b.jy = 0; b.data.tele = null; FX.sfx('roll'); }
          return false;
        }
        var step = c.speed * dt;
        b.x += dir.x * step; b.y += dir.y * step; dist -= step; b.rot += step / b.r;
        if (bt.walls(b)) dist = 0;
        gt += dt; if (gt > 0.03) { gt = 0; _ghost(b); }
        FX.particle({ x: b.x + _rnd(-40, 40), y: b.y + b.r * 0.8, vx: -dir.x * 100 + _rnd(-60, 60), vy: _rnd(-90, -10), life: 0.5, size: _rnd(16, 28), color: '#bfa27a', shape: 'smoke' });
        _bPlayers(bt, b).forEach(function (o) {
          if (hit.has(o) || o.air || _dist(o, b) > o.r + b.r) return;
          hit.add(o);
          bt.damage(o, c.damage, b, { color: '#ffe066', kind: 'bossRoll' });
          o.vx += dir.x * 900 + (o.x - b.x) * 3; o.vy += dir.y * 900 + (o.y - b.y) * 3;
        });
        if (dist > 0) return false;
        // 멈추는 자리에서 쿵
        bfx(bt, 'smash_gold', b.x, b.y, { scale: 3.2 }); FX.shake(24); FX.sfx('slam');
        _bPlayers(bt, b).forEach(function (o) { if (_dist(o, b) < b.r + c.aoe) bt.damage(o, c.aoeDamage, b, { color: '#ffe066', kind: 'bossRollAoe' }); });
        b.phasing = false; bt.emit('bossRoll');
        if (--left > 0) { aim(); return false; }
        return true;
      },
      end: function () { b.phasing = false; b.jx = b.jy = 0; b.data.tele = null; _restoreSpeed(b, dir.x, dir.y); },
    };
  },
  // 1-2 핫식스 한 박스 쟁여놓기
  hot6: function (bt, b) {
    var c = b.cfg.hot6, t = 0;
    bossCast(bt, b, '핫식스 한 박스 쟁여놓기', '#c684ff');   // 박스는 한 개 (config hot6.boxes)
    for (var i = 0; i < c.boxes; i++) {
      var p = bt.randomPoint(90);
      for (var k = 0; k < 12 && _dist(p, b) < b.r + 160; k++) p = bt.randomPoint(90);
      bt.add(new Hot6Box(bt, b, p, c));
      FX.ring(p.x, p.y, 10, 110, 0.5, '#9b5cff', 8);
    }
    FX.sfx('pickup'); bt.emit('hot6Box');
    return { moves: false, update: function (dt) { t += dt; b.jy = Math.sin(t * 30) * 4; return t >= 0.6; }, end: function () { b.jy = 0; _restoreSpeed(b, b.vx, b.vy); } };
  },
  // 2-1 지갑전사 바통
  wallet: function (bt, b) {
    var c = b.cfg.wallet, t = 0, tgt = _bPick(bt, b), base = tgt ? Math.atan2(tgt.y - b.y, tgt.x - b.x) : _rnd(0, Math.PI * 2), spread = 1.1;
    bossCast(bt, b, '지갑전사 바통', '#ffe066');
    for (var i = 0; i < c.coins; i++) bt.add(new CoinShot(bt, b, base - spread / 2 + spread * (c.coins > 1 ? i / (c.coins - 1) : 0.5), c));
    FX.burst(b.x, b.y, '#6fdc7a', 30, 600, 10, 0.6, 'square'); FX.sfx('coin');
    bt.emit('wallet');
    return { moves: false, update: function (dt) { t += dt; return t >= 0.5; }, end: function () { _restoreSpeed(b, b.vx, b.vy); } };
  },
  // 2-2 바통의 근원: 맵 밖으로 나갔다가 킥보드 타고 소주 마시며 일직선 돌격
  origin: function (bt, b) {
    var c = b.cfg.origin, A = CONFIG.arena, done = 0, st = 'out', t = 0, line = null, hit, gt = 0;
    bossCast(bt, b, '바통의 근원', '#7dff9a');
    bfx(bt, 'implode', b.x, b.y, { scale: 1.3 }); FX.sfx('vanish');
    b.hidden = true; b.phasing = true; b.vx = b.vy = 0;
    function plan() {
      var tgt = _bPick(bt, b), tx = tgt ? tgt.x : A.x + A.w / 2, ty = tgt ? tgt.y : A.y + A.h / 2, m = b.r + 10;
      if (Math.random() < 0.5) {
        var y = _bClamp(ty, A.y + b.r, A.y + A.h - b.r), L = Math.random() < 0.5;
        line = { x0: L ? A.x - m : A.x + A.w + m, y0: y, x1: L ? A.x + A.w + m : A.x - m, y1: y };
      } else {
        var x = _bClamp(tx, A.x + b.r, A.x + A.w - b.r), T = Math.random() < 0.5;
        line = { x0: x, y0: T ? A.y - m : A.y + A.h + m, x1: x, y1: T ? A.y + A.h + m : A.y - m };
      }
      st = 'warn'; t = 0; hit = new Set();
      b.data.tele = { kind: 'lane', x0: line.x0, y0: line.y0, x1: line.x1, y1: line.y1, w: b.r * 2 };
      FX.sfx('laserCharge');
    }
    return {
      moves: false, uninterruptible: true,
      update: function (dt) {
        t += dt;
        if (st === 'out') { if (t >= c.out) plan(); return false; }
        if (st === 'warn') {
          if (t >= c.warn) { st = 'dash'; t = 0; b.hidden = false; b.x = line.x0; b.y = line.y0; b.data.kick = true; b.data.tele = null; FX.sfx('roll'); FX.text(b.x, b.y, '부릉~', '#7dff9a', 50, 0.8); }
          return false;
        }
        var dx = line.x1 - line.x0, dy = line.y1 - line.y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
        b.x += ux * c.speed * dt; b.y += uy * c.speed * dt; b.vx = ux * c.speed; b.vy = uy * c.speed;
        gt += dt; if (gt > 0.035) { gt = 0; _ghost(b); }
        if (Math.random() < dt * 25) FX.particle({ x: b.x - ux * b.r, y: b.y - uy * b.r, vx: -ux * 200 + _rnd(-80, 80), vy: -uy * 200 + _rnd(-80, 80), life: 0.5, size: 10, color: '#7dff9a', shape: 'square' });
        _bPlayers(bt, b).forEach(function (o) {
          if (hit.has(o) || o.air || _dist(o, b) > o.r + b.r) return;
          hit.add(o);
          bt.damage(o, c.damage, b, { color: '#7dff9a', kind: 'bossKick' });
          var side = ((o.x - b.x) * -uy + (o.y - b.y) * ux) >= 0 ? 1 : -1;
          o.vx += ux * c.knock * 0.6 - uy * side * c.knock * 0.8; o.vy += uy * c.knock * 0.6 + ux * side * c.knock * 0.8;
          bfx(bt, 'crit', o.x, o.y, { scale: 1.2 }); FX.shake(18);
          bt.emit('bossKickHit', { who: o.def.id });
        });
        if ((b.x - line.x1) * ux + (b.y - line.y1) * uy < 0) return false;
        if (Math.random() < (c.chain[done++] || 0)) { b.hidden = true; b.data.kick = false; st = 'out'; t = c.out * 0.5; FX.text(b.x, b.y, '한 번 더!', '#7dff9a', 46, 0.8); return false; }
        return true;
      },
      end: function () {
        b.hidden = false; b.phasing = false; b.data.kick = false; b.data.tele = null;
        b.x = _bClamp(b.x, A.x + b.r, A.x + A.w - b.r); b.y = _bClamp(b.y, A.y + b.r, A.y + A.h - b.r);
        _restoreSpeed(b, A.x + A.w / 2 - b.x, A.y + A.h / 2 - b.y);
      },
    };
  },
  // 3-1 자학개그
  joke: function (bt, b) {
    var c = b.cfg.joke, t = 0, n = 0;
    bossCast(bt, b, '자학개그', '#ffd400');
    return {
      moves: false,
      update: function (dt) {
        t += dt;
        while (n < c.count && t >= n * 0.18) {
          var tgt = _bPick(bt, b), a = tgt ? Math.atan2(tgt.y - b.y, tgt.x - b.x) + _rnd(-0.35, 0.35) : _rnd(0, Math.PI * 2);
          bt.add(new JokeShot(bt, b, a, c)); n++; FX.sfx('type');
        }
        return n >= c.count && t >= c.count * 0.18 + 0.3;
      },
      end: function () { _restoreSpeed(b, b.vx, b.vy); },
    };
  },
  // 3-2 바지 강림: 이제 고유 쿨타임 패시브 (다른 스킬과 동시에). 여기선 시작만 하고 행동은 안 막음
  baccarat: function (bt, b, force) { startBaccarat(bt, b, force); return null; },
  // 패시브 2 끼야아아악: 페이즈 바뀔 때 맵 전체
  scream: function (bt, b) {
    var c = b.cfg.scream, t = 0;
    FX.banner('끼야아아악!!', { color: '#ffd400', sub: '히어로 바통 · 패시브', size: 150, life: 1.3 });
    bfx(bt, 'blast_gold', b.x, b.y, { scale: 4.5 });
    for (var i = 0; i < 5; i++) FX.ring(b.x, b.y, b.r, 1600, 0.6 + i * 0.15, i % 2 ? '#ffffff' : '#ffd400', 20 - i * 3);
    FX.sfx('scream'); FX.shake(40); FX.flash('#ffd400', 0.25, 0.3);
    _bPlayers(bt, b).forEach(function (o) { bt.damage(o, c.damage, b, { color: '#ffe066', kind: 'bossScream' }); });
    bt.emit('bossScream');
    return { moves: false, uninterruptible: true, update: function (dt) { t += dt; b.jx = _rnd(-8, 8); b.jy = _rnd(-8, 8); return t >= 0.8; }, end: function () { b.jx = b.jy = 0; } };
  },
  // 패시브 3 일단 씻고 오겠습니다: 페이즈 3에서 잠깐 사라졌다가 회복해서 돌아옴
  // 샤워 타월을 걸치고 사라졌다가, 맵 밖에서 데굴데굴 굴러서 돌아옴
  wash: function (bt, b) {
    var c = b.cfg.wash, A = CONFIG.arena, t = 0, st = 'towel', from = null, to = null, gt = 0, dir = 1;
    FX.banner('일단 씻고 오겠습니다', { color: '#78ccf4', sub: '히어로 바통 · 패시브', size: 110, life: 1.6 });
    b.vx = b.vy = 0; b.phasing = true; b.data.towel = 0;
    bt.emit('bossWashOut');
    return {
      moves: false, uninterruptible: true, spinning: true,
      update: function (dt) {
        t += dt;
        if (st === 'towel') {   // 수건이 위에서부터 덮어 내려옴
          b.data.towel = Math.min(1, t / 0.7); b.jy = Math.sin(t * 14) * 3;
          if (Math.random() < dt * 20) FX.particle({ x: b.x + _rnd(-b.r, b.r), y: b.y + _rnd(-b.r, b.r) * 0.6, vx: _rnd(-30, 30), vy: _rnd(-120, -60), life: 0.8, size: _rnd(6, 12), color: '#cdeeff', shape: 'dot' });
          if (t >= 1.1) {
            st = 'away'; t = 0; b.jy = 0; b.data.towel = 0;
            bfx(bt, 'implode', b.x, b.y, { scale: 1.3 }); FX.burst(b.x, b.y, '#fff4f8', 24, 500, 14, 0.6, 'smoke'); FX.sfx('vanish');
            var healed = bt.heal(b, b.maxHp * c.heal);   // 맵 밖으로 나가는 순간 씻고 회복
            FX.text(b.x, b.y - b.r - 40, '샤워 중… +' + Math.round(healed), '#78ccf4', 52, 1.2);
            bt.emit('bossWash', { healed: healed });
            b.hidden = true;
          }
          return false;
        }
        if (st === 'away') {
          if (t < c.time) return false;
          st = 'roll'; t = 0; dir = Math.random() < 0.5 ? 1 : -1;
          to = { x: A.x + A.w / 2, y: A.y + A.h * 0.35 };
          from = { x: dir > 0 ? A.x - b.r : A.x + A.w + b.r, y: to.y };
          b.x = from.x; b.y = from.y; b.hidden = false;
          FX.sfx('roll'); FX.text(b.x + dir * b.r * 2, b.y - b.r, '뽀득뽀득~', '#78ccf4', 50, 1.0);
          return false;
        }
        var k = Math.min(1, t / 1.2), e = 1 - Math.pow(1 - k, 3), px = b.x;
        b.x = from.x + (to.x - from.x) * e; b.y = to.y;
        b.rot += (b.x - px) / b.r;
        gt += dt; if (gt > 0.04) { gt = 0; _ghost(b); }
        if (Math.random() < dt * 30) FX.particle({ x: b.x - dir * b.r * 0.6, y: b.y + b.r * 0.7, vx: -dir * _rnd(60, 160), vy: _rnd(-80, -20), life: 0.5, size: _rnd(7, 13), color: Math.random() < 0.5 ? '#cdeeff' : '#ffffff', shape: 'dot' });
        return k >= 1;
      },
      end: function () {
        b.hidden = false; b.phasing = false; b.data.towel = 0; b.jy = 0;
        if (to) { b.x = to.x; b.y = to.y; } else { b.x = A.x + A.w / 2; b.y = A.y + A.h * 0.35; }
        bfx(bt, 'heal_water', b.x, b.y + b.r * 0.6, { scale: 3 });
        FX.burst(b.x, b.y, '#78ccf4', 40, 700, 10, 0.8);
        bt.skillText(b, '개운하다~', '#78ccf4');
        _restoreSpeed(b, 0, 1);
      },
    };
  },
  // 하드 전용 노광석의 힘: 맵 맨 위 가운데로 올라가 노래 → 틈이 있는 파장
  song: function (bt, b) {
    var c = b.cfg.song, A = CONFIG.arena, st = 'move', t = 0, from = { x: b.x, y: b.y }, to = { x: A.x + A.w / 2, y: A.y + b.r + 20 }, fire = c.every;
    FX.banner('노광석의 힘', { color: '#ff7ad9', sub: '히어로 바통 · 하드 · 무적', size: 130, life: 1.6 });
    b.phasing = true; b.invuln = true; FX.sfx('guitar');   // 노래하는 동안 피해 안 받음
    return {
      moves: false, uninterruptible: true,
      update: function (dt) {
        t += dt;
        if (st === 'move') {
          var k = Math.min(1, t / 0.7), e = 1 - (1 - k) * (1 - k);
          b.x = from.x + (to.x - from.x) * e; b.y = from.y + (to.y - from.y) * e;
          if (k >= 1) { st = 'sing'; t = 0; b.data.singing = true; }
          return false;
        }
        b.x = to.x; b.y = to.y; b.vx = b.vy = 0;
        if (Math.random() < dt * 22) {   // 흔들리며 퍼지는 음표
          var na = _rnd(0.1, 0.9) * Math.PI, nv = _rnd(160, 320), nc = ['#ff7ad9', '#c684ff', '#7dd3ff', '#ffe066'][Math.floor(Math.random() * 4)], ch = ['♪', '♫', '♬', '♩'][Math.floor(Math.random() * 4)], ph = _rnd(0, 6);
          FX.particle({ x: b.x + Math.cos(na) * b.r, y: b.y + Math.sin(na) * b.r, vx: Math.cos(na) * nv, vy: Math.sin(na) * nv, drag: 0.985, life: _rnd(1.2, 2), size: _rnd(40, 70), color: nc, shape: 'custom', vr: _rnd(-2, 2),
            draw: function (ctx2, px, py, k, p) {
              ctx2.save(); ctx2.translate(px + Math.sin(p.rot * 3 + ph) * 18, py); ctx2.rotate(Math.sin(p.rot * 2) * 0.4);
              ctx2.font = '700 ' + Math.round(p.size) + 'px "Segoe UI Symbol","Malgun Gothic",sans-serif'; ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
              ctx2.lineWidth = 6; ctx2.strokeStyle = 'rgba(0,0,0,0.6)'; ctx2.strokeText(ch, 0, 0);
              ctx2.fillStyle = p.color; ctx2.shadowColor = p.color; ctx2.shadowBlur = 18; ctx2.fillText(ch, 0, 0); ctx2.restore();
            } });
        }
        fire += dt;
        if (fire >= c.every) {
          fire -= c.every;
          bt.add(new SongWave(bt, b, to.x, to.y, c)); FX.sfx('bass');
          for (var i = 0; i < 4; i++) FX.text(to.x + _rnd(-b.r, b.r), to.y + b.r * 0.6, i % 2 ? '♪' : '♬', '#ff7ad9', 46, 1.0);
          bt.emit('songWave');
        }
        return t >= c.time;
      },
      end: function () { b.phasing = false; b.invuln = false; b.data.singing = false; _restoreSpeed(b, 0.3, 1); },
    };
  },
};
function bossPhase(bt, b, n) {
  var d = b.data;
  b.phase = n; b.pulse = 1.1;
  bt.freeze = Math.max(bt.freeze, CONFIG.battle.phaseFreeze);
  if (b.action && b.action.end) b.action.end();
  b.action = null;
  FX.banner('PHASE ' + n, { color: b.color(), sub: b.name + (n === 3 ? ' 최종 페이즈' : ' 분노'), size: 170, life: 1.6 });
  FX.flash('#ffffff', 0.4, 0.3); FX.shake(26); FX.sfx('phase');
  Array.prototype.push.apply(d.queue, b.def.phaseQueue(n));   // 보스마다 페이즈 전환 패시브 (바통: 끼야아아악 · 씻기 / 규순이: 발작)
  d.cd = Math.max(d.cd, 1.0);
  bt.emit('bossPhase', { n: n });
}
function bossPool(b) {
  var P = b.cfg.pools, out = [];
  for (var p = 1; p <= b.phase; p++) if (b.cfg.cumulative || p === b.phase) out = out.concat(P[p]);
  return b.def.poolFix ? b.def.poolFix(b, out) : out;
}
// 보스 공용 스킬 순서: 대기열(패시브 등) 먼저, 아니면 쿨타임마다 이번 페이즈 풀에서 직전과 다른 스킬. 스킬이 끝나면 onSkillEnd
function bossNext(bt, b, dt, SK) {
  var c = b.cfg, d = b.data;
  if (!b.action && !b.hidden && d.cur) { var done = d.cur; d.cur = null; if (b.def.onSkillEnd) b.def.onSkillEnd(bt, b, done); }
  if (b.action || b.hidden) return;
  if (d.queue.length) { var q = d.queue.shift(); d.cur = q; b.action = SK[q](bt, b); bt.emit('bossSkill', { skill: q }); return; }
  if (b.disabled) return;
  d.cd -= dt * b.cdRate;
  if (d.cd > 0) return;
  var pool = bossPool(b), opts = pool.filter(function (k) { return k !== d.last; }), k = (opts.length ? opts : pool)[Math.floor(Math.random() * (opts.length || pool.length))];
  d.last = k; d.cur = k; d.cd = c.cd * (c.phaseCd[b.phase - 1] || 1);   // 페이즈가 오를수록 짧아짐
  b.action = SK[k](bt, b);
  bt.emit('bossSkill', { skill: k });
}

// ---------- 규순이 ----------
// 아우라: 바통(금빛 룬 · 불티)과 다르게 보랏빛 연기 + 공 둘레를 도는 깃털, 페이즈 3은 이중인격 잔상(청록 · 분홍 어긋난 테)
class GyuAura {
  constructor(bt, b) { this.bt = bt; this.b = b; this.t = 0; this.z = -2; }
  update(dt) {
    var b = this.b;
    this.t += dt;
    if (!b.alive) { this.dead = true; return; }
    if (b.hidden) return;
    if (Math.random() < dt * 14) FX.particle({ x: b.x + _rnd(-b.r, b.r), y: b.y + b.r * _rnd(0.2, 0.9), vx: _rnd(-30, 30), vy: _rnd(-150, -70), life: _rnd(0.9, 1.6), size: _rnd(24, 44), color: Math.random() < 0.5 ? 'rgba(120,40,170,0.45)' : 'rgba(255,79,216,0.3)', shape: 'smoke' });
    if (Math.random() < dt * 2.5) FX.text(b.x + _rnd(-b.r, b.r), b.y - b.r * 0.4, '♡', '#ff9cf0', 40, 1.0);
  }
  draw(ctx) {
    var b = this.b; if (b.hidden || !b.alive) return;
    var t = this.t, col = b.color(), i;
    ctx.save();
    var g = ctx.createRadialGradient(b.x, b.y, b.r * 0.7, b.x, b.y, b.r * 2.1);   // 보랏빛 안개
    g.addColorStop(0, 'rgba(90,20,140,0.5)'); g.addColorStop(0.6, col + '33'); g.addColorStop(1, col + '00');
    ctx.globalAlpha = 0.75 + Math.sin(t * 2.3) * 0.2; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    for (i = 0; i < 8; i++) {   // 도는 깃털
      var a = t * (i % 2 ? 1.1 : -0.8) + i * Math.PI / 4, rr = b.r * (1.35 + 0.08 * Math.sin(t * 3 + i));
      ctx.save(); ctx.translate(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr * 0.85); ctx.rotate(a + Math.PI / 2 + Math.sin(t * 4 + i) * 0.4);
      ctx.fillStyle = i % 3 ? '#f3e6ff' : '#ff9cf0'; ctx.shadowColor = col; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,60,160,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 24); ctx.stroke();
      ctx.restore();
    }
    if (b.phase >= 3) {   // 이중인격 잔상
      [['#00f0ff', 1], ['#ff2bd6', -1]].forEach(function (q) {
        var o = Math.sin(t * 13 * q[1]) * 10;
        ctx.globalAlpha = 0.55; ctx.lineWidth = 7; ctx.strokeStyle = q[0];
        ctx.beginPath(); ctx.arc(b.x + o, b.y - o * 0.4, b.r * 1.08, 0, Math.PI * 2); ctx.stroke();
      });
    }
    ctx.restore();
  }
  light() { return { x: this.b.x, y: this.b.y, r: this.b.r * 2.4 }; }
}
// 캐치캐치: 착지한 높이에서 좌우로 맵 끝까지 가는 띠 파동
class HWave {
  constructor(bt, owner, x, y, dir, c) { this.bt = bt; this.owner = owner; this.x = x; this.y = y; this.dir = dir; this.c = c; this.hit = new Set(); this.t = 0; this.z = -1; }
  update(dt) {
    var A = CONFIG.arena, self = this, c = this.c;
    this.t += dt; this.x += this.dir * c.speed * dt;
    if (this.x < A.x - 40 || this.x > A.x + A.w + 40) { this.dead = true; return; }
    _bPlayers(this.bt, this.owner).forEach(function (o) {
      if (self.hit.has(o) || o.air || Math.abs(o.y - self.y) > c.band / 2 + o.r * 0.5 || Math.abs(o.x - self.x) > o.r + 40) return;
      self.hit.add(o);
      self.bt.damage(o, c.damage, self.owner, { color: '#ff9cf0', kind: 'bossCatch' });
      o.vx += self.dir * 700;
      self.bt.emit('catchHit', { who: o.def.id });
    });
  }
  draw(ctx) {
    var h = this.c.band, g = ctx.createLinearGradient(this.x - this.dir * 160, 0, this.x, 0);
    g.addColorStop(0, 'rgba(255,79,216,0)'); g.addColorStop(1, 'rgba(255,79,216,0.55)');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(Math.min(this.x, this.x - this.dir * 160), this.y - h / 2, 160, h);
    ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 24; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(this.x, this.y - h / 2); ctx.quadraticCurveTo(this.x + this.dir * 40, this.y, this.x, this.y + h / 2); ctx.stroke();
    ctx.restore();
  }
}
// 개큰돌: 굴러가며 맞은 적 넉백 + 기절, maxHits명 맞히면 그 자리에서 부서짐
class BigRock {
  constructor(bt, owner, ang, c) {
    this.bt = bt; this.owner = owner; this.c = c; this.r = c.radius; this.vx = Math.cos(ang) * c.speed; this.vy = Math.sin(ang) * c.speed;
    this.x = owner.x + Math.cos(ang) * (owner.r + this.r * 0.5); this.y = owner.y + Math.sin(ang) * (owner.r + this.r * 0.5);
    this.hits = 0; this.hit = new Set(); this.rot = 0; this.z = 1; this.t = 0;
  }
  update(dt) {
    var A = CONFIG.arena, self = this, c = this.c;
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += c.speed * dt / this.r * (this.vx >= 0 ? 1 : -1);
    if (Math.random() < dt * 30) FX.particle({ x: this.x + _rnd(-this.r, this.r) * 0.6, y: this.y + this.r * 0.7, vx: _rnd(-60, 60), vy: _rnd(-90, -20), life: 0.5, size: _rnd(14, 26), color: '#9a8a7a', shape: 'smoke' });
    _bPlayers(this.bt, this.owner).forEach(function (o) {
      if (self.dead || self.hit.has(o) || o.air || _dist(o, self) > o.r + self.r) return;
      self.hit.add(o); self.hits++;
      self.bt.damage(o, c.damage, self.owner, { color: '#d8c8b0', kind: 'bossRock' });
      var d = _dist(o, self) || 1; o.vx = (o.x - self.x) / d * c.knock; o.vy = (o.y - self.y) / d * c.knock;
      o.status.stun = Math.max(o.status.stun, c.stun);
      FX.shake(16); FX.sfx('slam');
      self.bt.emit('rockHit', { who: o.def.id });
      if (self.hits >= c.maxHits) self.smash();
    });
    if (!this.dead && (this.x < A.x - this.r || this.x > A.x + A.w + this.r || this.y < A.y - this.r || this.y > A.y + A.h + this.r || this.t > 4)) this.smash();
  }
  smash() {
    this.dead = true;
    FX.burst(this.x, this.y, '#8a7a6a', 30, 700, 18, 0.7, 'square'); FX.burst(this.x, this.y, '#c8b8a8', 16, 400, 26, 0.6, 'smoke');
    FX.shake(14); FX.sfx('thump'); this.bt.emit('rockBreak');
  }
  draw(ctx) {
    var r = this.r;
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(10, r * 0.75, r * 0.95, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(this.rot);
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#b8aa98'); g.addColorStop(1, '#5e5246');
    ctx.fillStyle = g; ctx.beginPath();
    for (var i = 0; i < 11; i++) { var a = i / 11 * Math.PI * 2, rr = r * (0.88 + 0.12 * Math.sin(i * 2.7)); if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#3a3028'; ctx.lineWidth = 6; ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.2); ctx.lineTo(0, r * 0.1); ctx.lineTo(r * 0.3, -r * 0.3); ctx.moveTo(0, r * 0.1); ctx.lineTo(r * 0.1, r * 0.5); ctx.stroke();
    ctx.restore();
  }
}
// 디바 자세: 맵 가운데로 던진 의자가 fuse초 뒤 터지며 파편
class ChairBomb {
  constructor(bt, owner, c) {
    var A = CONFIG.arena;
    this.bt = bt; this.owner = owner; this.c = c; this.sx = owner.x; this.sy = owner.y; this.tx = A.x + A.w / 2; this.ty = A.y + A.h / 2;
    this.x = this.sx; this.y = this.sy; this.t = 0; this.z = 1; this.rot = 0; this.landed = false;
  }
  update(dt) {
    var c = this.c, bt = this.bt, self = this;
    this.t += dt;
    if (!this.landed) {
      var k = Math.min(1, this.t / 0.6);
      this.x = this.sx + (this.tx - this.sx) * k; this.y = this.sy + (this.ty - this.sy) * k - Math.sin(k * Math.PI) * 220; this.rot += dt * 14;
      if (k >= 1) { this.landed = true; this.t = 0; this.rot = 0.2; FX.shake(14); FX.sfx('thump'); FX.burst(this.x, this.y, '#8a5f3a', 14, 400, 10, 0.5, 'square'); }
      return;
    }
    if (this.t < c.fuse) return;
    this.dead = true;
    bfx(bt, 'blast_gold', this.x, this.y, { scale: c.blastRadius / 75 }); FX.shake(30); FX.sfx('slam'); FX.flash('#ff7ad9', 0.25, 0.25);
    _bPlayers(bt, this.owner).forEach(function (o) { if (_dist(o, self) < c.blastRadius + o.r * 0.5) bt.damage(o, c.blastDamage, self.owner, { color: '#ffb066', kind: 'divaBlast' }); });
    for (var i = 0; i < c.shards; i++) bt.add(new Shard(bt, this.owner, this.x, this.y, i / c.shards * Math.PI * 2 + _rnd(-0.08, 0.08), c));
    bt.emit('divaBlast');
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.landed) {   // 터지기 전 경고
      var k = this.t / this.c.fuse;
      ctx.globalAlpha = 0.25 + 0.25 * Math.abs(Math.sin(this.t * (6 + k * 14)));
      ctx.fillStyle = '#ff4f6a'; ctx.beginPath(); ctx.arc(0, 0, this.c.blastRadius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.setLineDash([16, 12]); ctx.strokeStyle = '#ff4f6a'; ctx.lineWidth = 5; ctx.stroke(); ctx.setLineDash([]);
      ctx.translate(_rnd(-1, 1) * k * 6, 0);
    }
    ctx.rotate(this.rot); if (typeof drawChair === 'function') drawChair(ctx, 2.2);
    ctx.restore();
  }
}
class Shard {
  constructor(bt, owner, x, y, ang, c) { this.bt = bt; this.owner = owner; this.x = x; this.y = y; this.vx = Math.cos(ang) * c.shardSpeed; this.vy = Math.sin(ang) * c.shardSpeed; this.c = c; this.t = 0; this.z = 1; this.rot = _rnd(0, 6); }
  update(dt) {
    var A = CONFIG.arena, self = this;
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += dt * 12;
    if (this.t > 3 || this.x < A.x || this.x > A.x + A.w || this.y < A.y || this.y > A.y + A.h) { this.dead = true; return; }
    var o = _bPlayers(this.bt, this.owner).find(function (q) { return !q.air && _dist(q, self) < q.r + 16; });
    if (!o) return;
    this.dead = true;
    this.bt.damage(o, this.c.shardDamage, this.owner, { color: '#ffb066', kind: 'divaShard' });
    FX.burst(this.x, this.y, '#8a5f3a', 6, 300, 6, 0.3, 'square');
  }
  draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.fillStyle = '#8a5f3a'; ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 3; ctx.fillRect(-16, -5, 32, 10); ctx.strokeRect(-16, -5, 32, 10); ctx.restore(); }
}
// 훔친 스킬은 그 캐릭터 수치(cfg)로 돌림: 쓰는 동안만 보스 cfg 위에 그 캐릭터 cfg를 덮음 (보스 고유 값은 유지)
function gyuRunStolen(bt, b) {
  var st = b.data.stolen, sk = CHARACTERS[st.id].skills[st.idx], saved = b.cfg, t = 0;
  var mix = Object.assign({}, saved, CONFIG.chars[st.id], { hp: saved.hp, speed: saved.speed, radius: saved.radius, color: saved.color, phase2Color: saved.phase2Color, contactDamage: saved.contactDamage });
  function run(fn, fallback) {   // 쓰는 동안만 그 캐릭터 수치로 (겹치는 키는 그 캐릭터 값)
    b.cfg = mix;
    try { return fn(); } catch (e) { console.warn('[볼파이트] 규순이 훔친 스킬 오류: ' + st.id + ' ' + sk.key, e); return fallback; } finally { b.cfg = saved; }
  }
  bossCast(bt, b, '쌔비기: ' + sk.name, '#c77dff');
  var act = run(function () { return sk.start(bt, b); }, null);
  bt.emit('stolenCast', { id: st.id, key: sk.key });
  if (!act) return { moves: false, update: function (dt) { t += dt; return t >= 0.5; } };
  return {
    get moves() { return act.moves; }, get uninterruptible() { return act.uninterruptible; }, get spinning() { return act.spinning; },
    update: function (dt) { return run(function () { return act.update(dt); }, true); },
    end: function () { if (act.end) run(function () { act.end(); }); },
  };
}
var GYU_NO_REPEAT = ['steal', 'seizure', 'diva'];   // I said 누누이로 다시 안 쓰는 것
function gyuWait(t0, then) { var t = 0; return { moves: false, update: function (dt) { t += dt; return t >= t0; }, end: then }; }
var GYU_SKILLS = {
  // 1-1 날아가야돼: 새가 너무 좋아 + 양 옆 날개를 위아래로 빠르게 흔듦 (날개에 맞으면 피해 + 크게 넉백)
  wings: function (bt, b) {
    var c = b.cfg.wings, t = 0, flap = 0, cd = {};
    bossCast(bt, b, '날아가야돼', '#e6c8ff');
    GYUSUN_SKILLS.birds(bt, b, true);
    b.data.wing = 0; b.vx = b.vy = 0;
    return {
      moves: false,
      update: function (dt) {
        t += dt; b.data.wing = t; b.jy = Math.sin(t * 40) * 6;
        flap += dt;
        if (flap < c.flapEvery) return t >= c.time;
        flap -= c.flapEvery; FX.sfx('throw');
        _bPlayers(bt, b).forEach(function (o) {
          var dx = o.x - b.x, dy = o.y - b.y;
          if (o.air || Math.abs(dy) > c.width / 2 + o.r * 0.5 || Math.abs(dx) < b.r * 0.6 || Math.abs(dx) > b.r + c.length + o.r * 0.5 || cd[o.id] > bt.time) return;
          cd[o.id] = bt.time + c.hitGap;
          bt.damage(o, c.damage, b, { color: '#e6c8ff', kind: 'bossWing' });
          o.vx = (dx > 0 ? 1 : -1) * c.knock; o.vy = dy * 3;
          FX.burst(o.x, o.y, '#ffffff', 12, 600, 10, 0.5, 'feather');
          bt.emit('wingHit', { who: o.def.id });
        });
        return t >= c.time;
      },
      end: function () { b.data.wing = null; b.jy = 0; _restoreSpeed(b, Math.random() - 0.5, 1); },
    };
  },
  // 1-2 춤: 토카토카 / 캐치캐치 / 체포하겠어 중 하나
  dance: function (bt, b) {
    var pick = ['toka', 'catch', 'arrest'][Math.floor(Math.random() * 3)];
    b.data.danced = pick; bt.emit('gyuDance', { pick: pick });
    if (pick === 'toka') { bossCast(bt, b, '춤: 토카토카', '#00f0ff'); return GYUSUN_SKILLS.toka(bt, b); }
    if (pick === 'catch') return GYU_SKILLS._catch(bt, b);
    return GYU_SKILLS._arrest(bt, b);
  },
  _catch: function (bt, b) {   // 제자리 점프 → 착지마다 좌우 끝까지 띠 파동
    var c = b.cfg.catchc, i = 0, t = 0, keep = { vx: b.vx, vy: b.vy };
    bossCast(bt, b, '춤: 캐치캐치', '#ff4fd8'); b.vx = b.vy = 0;
    return {
      moves: false,
      update: function (dt) {
        t += dt;
        var p = Math.min(1, t / c.jumpTime);
        b.lift = Math.sin(Math.PI * p) * 0.6; b.air = b.lift > 0.15;
        if (p < 1) return false;
        t = 0; i++; b.lift = 0; b.air = false;
        bt.add(new HWave(bt, b, b.x, b.y, 1, c)); bt.add(new HWave(bt, b, b.x, b.y, -1, c));
        FX.ring(b.x, b.y, b.r, b.r * 1.6, 0.3, '#ff4fd8', 12); FX.shake(14); FX.sfx('thump');
        FX.text(b.x, b.y - b.r - 50, '캐치!', '#ff9cf0', 56, 0.6);
        bt.emit('catchWave');
        return i >= c.jumps;
      },
      end: function () { b.lift = 0; b.air = false; _restoreSpeed(b, keep.vx, keep.vy); },
    };
  },
  _arrest: function (bt, b) {   // 휘슬 두 번: 휘슬마다 도전자 전원 그 자리에 정지
    var c = b.cfg.arrest, n = 0, t = c.gap;
    bossCast(bt, b, '춤: 체포하겠어', '#7dd3ff'); b.vx = b.vy = 0; b.data.whistle = true;
    return {
      moves: false,
      update: function (dt) {
        t += dt;
        if (t < c.gap || n >= c.whistles) return t >= c.gap + 0.5;
        t = 0; n++;
        FX.text(b.x, b.y - b.r - 70, '삐익!!', '#ffffff', 80, 0.8); FX.sfx('ding'); FX.shake(10);
        for (var k = 0; k < 3; k++) FX.ring(b.x, b.y, b.r, 1600, 0.5 + k * 0.12, k % 2 ? '#ffffff' : '#7dd3ff', 12 - k * 3);
        _bPlayers(bt, b).forEach(function (o) { o.status.stun = Math.max(o.status.stun, c.stun); o.vx = o.vy = 0; FX.text(o.x, o.y - o.r - 40, '얼음!', '#7dd3ff', 42, 0.8); });
        bt.emit('whistle', { n: n });
        return false;
      },
      end: function () { b.data.whistle = false; _restoreSpeed(b, Math.random() - 0.5, 1); },
    };
  },
  // 2-1 루차루차: 이비 루차루차와 같고 범위가 큼
  lucha: function (bt, b) { bossCast(bt, b, '루차루차', '#ff4fd8'); return GYUSUN_SKILLS.lucha(bt, b); },
  // 2-2 BURP VENOM: 진행 방향 부채꼴로 맵 끝까지 트림 + 냄새 지속 피해
  burp: function (bt, b) {
    var c = b.cfg.burp, t = 0, fired = false, sp = Math.hypot(b.vx, b.vy), tgt = _bPick(bt, b);
    var ang = sp > 20 ? Math.atan2(b.vy, b.vx) : tgt ? Math.atan2(tgt.y - b.y, tgt.x - b.x) : _rnd(0, Math.PI * 2);
    bossCast(bt, b, 'BURP VENOM', '#9cff57'); b.vx = b.vy = 0;
    b.data.tele = { kind: 'cone', ang: ang, half: c.half };
    return {
      moves: false,
      update: function (dt) {
        t += dt; b.jx = _rnd(-3, 3) * Math.min(1, t / c.windup);
        if (!fired && t >= c.windup) {
          fired = true; b.data.tele = null;
          FX.banner('구우우으으어어어어어어억!!!', { color: '#9cff57', size: 92, life: 1.4 });
          FX.sfx('quake'); FX.shake(26);
          for (var i = 0; i < 70; i++) { var a = ang + _rnd(-c.half, c.half), v = _rnd(500, 1500); FX.particle({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.97, life: _rnd(0.8, 1.6), size: _rnd(30, 70), color: Math.random() < 0.5 ? 'rgba(156,255,87,0.5)' : 'rgba(110,170,40,0.45)', shape: 'smoke' }); }
          _bPlayers(bt, b).forEach(function (o) {
            var da = Math.atan2(o.y - b.y, o.x - b.x) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) > c.half + Math.atan2(o.r, Math.max(1, _dist(o, b)))) return;
            bt.damage(o, c.damage, b, { color: '#9cff57', kind: 'bossBurp' });
            o.status.poison = Math.max(o.status.poison, c.time); o.status.poisonDps = c.dps;
            FX.text(o.x, o.y - o.r - 50, '으 냄새…', '#9cff57', 40, 1.0);
            bt.emit('burpHit', { who: o.def.id });
          });
        }
        return t >= c.windup + 0.6;
      },
      end: function () { b.data.tele = null; b.jx = 0; _restoreSpeed(b, Math.cos(ang), Math.sin(ang)); },
    };
  },
  // 3-1 개큰돌 던지기
  rock: function (bt, b) {
    var c = b.cfg.rock, t = 0, thrown = false, tgt = _bPick(bt, b), ang = tgt ? Math.atan2(tgt.y - b.y, tgt.x - b.x) : _rnd(0, Math.PI * 2);
    bossCast(bt, b, '개큰돌 던지기', '#d8c8b0'); b.vx = b.vy = 0;
    b.data.tele = { kind: 'arrow', x: b.x, y: b.y, dx: Math.cos(ang), dy: Math.sin(ang), len: 1400 };
    return {
      moves: false,
      update: function (dt) {
        t += dt;
        if (tgt && tgt.targetable && t < c.windup * 0.7) { ang = Math.atan2(tgt.y - b.y, tgt.x - b.x); b.data.tele.dx = Math.cos(ang); b.data.tele.dy = Math.sin(ang); }
        if (!thrown && t >= c.windup) { thrown = true; b.data.tele = null; bt.add(new BigRock(bt, b, ang, c)); FX.sfx('throw'); FX.shake(12); bt.emit('rockThrow'); }
        return t >= c.windup + 0.3;
      },
      end: function () { b.data.tele = null; _restoreSpeed(b, -Math.cos(ang), -Math.sin(ang)); },
    };
  },
  // 3-2 쌔비기 마스터: 한 판에 한 번, 살아 있는 도전자 스킬 하나를 훔치고 그 스킬은 봉인. 이후 이 자리엔 훔친 스킬
  steal: function (bt, b) {
    var d = b.data, cands = [];
    d.stoleUsed = true;
    bossCast(bt, b, '쌔비기 마스터', '#c77dff');
    _bPlayers(bt, b).forEach(function (o) {
      if (o.def.id === 'ripley') return;   // ???는 변신하면 스킬이 바뀌어서 제외
      o.skills.forEach(function (sk, i) { if (!sk.def.passive && !sk.sealed) cands.push({ o: o, i: i }); });
    });
    if (!cands.length) return gyuWait(0.6);
    var p = cands[Math.floor(Math.random() * cands.length)], sk = p.o.skills[p.i];
    sk.sealed = true;
    d.stolen = { id: p.o.def.id, idx: p.i, name: sk.def.name, from: p.o.name };
    // 훔친 스킬이 남긴 투사체 등이 나중에도 보스 cfg · data에서 그 캐릭터 값을 찾으므로, 보스에 없는 키만 합쳐 둠 (보스 고유 값은 그대로)
    var cc = CONFIG.chars[p.o.def.id], tmp = {}, keep = { takenMult: b.takenMult, slow: b.slow, synTaken: b.synTaken, speed: b.speed, dmgMult: b.dmgMult, maxHp: b.maxHp, hp: b.hp, r: b.r, data: b.data, cfg: b.cfg }, add = bt.add;
    Object.keys(cc).forEach(function (k) { if (!(k in b.cfg)) b.cfg[k] = cc[k]; });
    if (p.o.def.init) {   // 그 캐릭터 init으로 상태 준비 (init이 까는 장판 등은 안 깜, 보스 능력치는 그대로)
      bt.add = function (e) { return e; }; b.data = tmp; b.cfg = Object.assign({}, b.cfg, cc);
      try { p.o.def.init(bt, b); } catch (e) { console.warn('[볼파이트] 규순이 쌔비기 init 오류: ' + p.o.def.id, e); }
      bt.add = add; Object.assign(b, keep);
      Object.keys(tmp).forEach(function (k) { if (!(k in d)) d[k] = tmp[k]; });
    }
    FX.text(p.o.x, p.o.y - p.o.r - 70, '🫳 ' + sk.def.name + ' 봉인!', '#c77dff', 46, 1.4);
    FX.banner('쌔비기 마스터!', { color: '#c77dff', sub: p.o.name + '의 「' + sk.def.name + '」 훔침', size: 110, life: 1.6 });
    for (var i = 0; i < 24; i++) { var k = i / 24; FX.particle({ x: p.o.x + (b.x - p.o.x) * k, y: p.o.y + (b.y - p.o.y) * k, vx: _rnd(-30, 30), vy: _rnd(-30, 30), life: 0.6 + k * 0.4, size: 10, color: '#c77dff', shape: 'spark' }); }
    FX.sfx('glitch');
    bt.emit('steal', { from: p.o.def.id, key: sk.def.key });
    return gyuWait(0.8);
  },
  stolen: function (bt, b) { return gyuRunStolen(bt, b); },
  // 패시브 발작: 맵 가운데로 가서 부들부들 떨며 머리를 세 번 내리침 → 구석까지는 안 닿는 파동
  seizure: function (bt, b) {
    var c = b.cfg.seizure, A = CONFIG.arena, st = 'move', t = 0, n = 0, from = { x: b.x, y: b.y }, to = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
    var R = Math.hypot(A.w / 2, A.h / 2) * c.reach;
    FX.banner('발작', { color: '#ff4fd8', sub: '규순이 · 패시브', size: 140, life: 1.4 });
    b.phasing = true; b.vx = b.vy = 0;
    b.data.tele = { kind: 'ring', x: to.x, y: to.y, r: R };
    return {
      moves: false, uninterruptible: true,
      update: function (dt) {
        t += dt;
        if (st === 'move') {
          var k = Math.min(1, t / 0.6), e = 1 - (1 - k) * (1 - k);
          b.x = from.x + (to.x - from.x) * e; b.y = from.y + (to.y - from.y) * e;
          if (k >= 1) { st = 'shake'; t = 0; }
          return false;
        }
        b.x = to.x + _rnd(-9, 9); b.y = to.y + _rnd(-9, 9);
        if (st === 'shake') { if (t >= 0.5) { st = 'smash'; t = c.gap; } return false; }
        if (t < c.gap) { b.scale = 1 + 0.15 * Math.max(0, 1 - t / 0.2); return false; }
        if (n >= c.smashes) return true;
        t = 0; n++; b.scale = 1.15;
        bt.add(new Wave(bt, b, to.x, to.y, R, c.speed, c.damage, '#ff4fd8', 'seizureHit', { knock: 500 }));
        FX.text(to.x, to.y - b.r - 60, '쾅!' + (n === c.smashes ? '!!' : ''), '#ffffff', 70, 0.7);
        FX.shake(22); FX.sfx('slam'); FX.flash('#ff4fd8', 0.15, 0.2);
        bt.emit('seizureSmash', { n: n });
        return false;
      },
      end: function () { b.phasing = false; b.scale = 1; b.data.tele = null; b.x = to.x; b.y = to.y; _restoreSpeed(b, Math.random() - 0.5, 1); },
    };
  },
  // 하드 전용 디바 자세
  diva: function (bt, b) {
    var c = b.cfg.diva;
    FX.banner('디바 자세', { color: '#ff7ad9', sub: '"이것도 x발 너프해봐 개x끼들아!!!"', size: 120, life: 2.0 });
    FX.text(b.x, b.y - b.r - 80, '이것도 x발 너프해봐 개x끼들아!!!', '#ff7ad9', 50, 1.8);
    FX.sfx('awaken'); FX.shake(18);
    bt.add(new ChairBomb(bt, b, c)); bt.emit('diva');
    b.vx = b.vy = 0;
    return gyuWait(0.7, function () { _restoreSpeed(b, Math.random() - 0.5, 1); });
  },
};


var BOSSES = {
  heroBaton: {
    id: 'heroBaton', name: '히어로 바통', sub: '보스',
    batonBoss: true,   // 진형권 '손님 사냥꾼' 대상 (유재후)
    images: {
      base: { src: 'assets/hero_baton1.jpg', fx: 0.5, fy: 0.27, s: 0.75 },
      p2:   { src: 'assets/hero_baton2.jpg', fx: 0.75, fy: 0.37, s: 0.32 },
      p3:   { src: 'assets/hero_baton3.jpg', fx: 0.53, fy: 0.22, s: 0.9 },
    },
    portrait: function (b) { return b.phase >= 3 ? 'p3' : b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '보스',
    title: '굴러온 정의',
    intro: '정의의 이름으로 굴러온 히어로 바통. 체력에 따라 세 페이즈로 바뀌고, 페이즈가 바뀔 때마다 끼야아아악을 지른다. IZK 1기에게 묵은 울분이 있다.',
    // 로비·전투 화면 설명 (d: 난이도별 수치)
    info: {
      passives: [
        { name: '울분', desc: function (c) { return 'IZK 1기 멤버에게 주는 피해 +' + Math.round((c.izkRage - 1) * 100) + '%'; } },
        { name: '끼야아아악', desc: function (c) { return '페이즈가 바뀔 때마다 맵 전체에 비명 (도전자 전원 ' + c.scream.damage + ' 피해)'; } },
        { name: '점점 빨라짐', desc: function (c) { return '스킬 간격 ' + c.cd + '초 → 페이즈 2 x' + c.phaseCd[1] + ' → 페이즈 3 x' + c.phaseCd[2]; } },
        { name: '일단 씻고 오겠습니다', desc: function (c) { return '페이즈 3이 되면 ' + c.wash.time + '초 동안 자리를 비우고, 씻고 와서 최대 체력의 ' + Math.round(c.wash.heal * 100) + '% 회복 (맵 밖으로 나가는 순간)'; } },
      ],
      skills: [
        { key: 'roll', phase: 1, name: '끝까지 구르기', desc: function (c) { return '예고 화살표 방향으로 굴러 부딪힌 도전자에게 피해, 멈추면 쿵! 연속 ' + c.roll.rolls + '번'; } },
        { key: 'hot6', phase: 1, name: '핫식스 한 박스 쟁여놓기', desc: function (c) { return '핫식스 한 박스를 깜. 보스가 먹으면 이속·공격력 상승, 도전자가 먹으면 터지며 탄막 ' + c.hot6.bullets + '발'; } },
        { key: 'wallet', phase: 2, name: '지갑전사 바통', desc: function (c) { return '지폐 ' + c.wallet.coins + '장을 뿌림. 맞으면 체력이 조금 차지만 ' + c.wallet.stun + '초 동안 아무것도 못 함 (IZK·진형권 무효, 최휘는 잔고 +' + c.wallet.money + ')'; } },
        { key: 'origin', phase: 2, name: '바통의 근원', desc: function (c) { return '맵 밖으로 나갔다가 예고된 차선으로 킥보드를 타고 소주를 마시며 돌격. 맞으면 피해와 넉백. ' + Math.round(c.origin.chain[0] * 100) + '% 확률로 한 번 더, 그다음 ' + Math.round(c.origin.chain[1] * 100) + '% 확률로 또 한 번'; } },
        { key: 'joke', phase: 3, name: '자학개그', desc: function (c) { return '자학개그 ' + c.joke.count + '개를 날림. 맞으면 공격력 ' + Math.round((1 - c.joke.atkMul) * 100) + '% 감소 (IZK·진형권 무효)'; } },
        { key: 'baccarat', phase: 3, name: '바지 강림 (고유 쿨타임)', desc: function (c) { return c.baccarat.cd + '초마다 다른 스킬과 함께 바카라! 플(파랑)이면 맵 곳곳에 원형 폭발 ' + c.baccarat.blasts + '번(각 ' + c.baccarat.playerDamage + '), 뱅(빨강)이면 한 명을 끝까지 쫓는 거대한 번개 ' + c.baccarat.bankerDamage + ' (근처도 휘말림). ' + Math.round(c.baccarat.tieChance * 100) + '% 확률로 초록 무승부: 맵이 흔들리고 초록으로 물들며 전원 ' + c.baccarat.tieDamage + ', 곳곳에 폭발 ' + c.baccarat.tieBlasts + '번(각 ' + c.baccarat.tieBlastDamage + ')'; } },
      ],
      hard: { key: 'song', name: '노광석의 힘', desc: function (c) { return '체력 ' + Math.round(c.song.at * 100) + '% 이하에서 맵 맨 위로 올라가 노래 (그동안 무적). 빠르고 두꺼운 파장이 쏟아지고 좁은 틈으로만 피할 수 있음'; } },
    },
    skills: [], noAutoPhase2: true,
    color: function (b) { return b.phase >= 3 ? b.cfg.phase3Color : b.phase >= 2 ? b.cfg.phase2Color : b.cfg.color; },
    // 패시브 1 울분: IZK 소속에게 피해 +10%
    dealMult: function (bt, s, t) { return _isIzk(t) ? s.cfg.izkRage : 1; },
    init: function (bt, b) {
      b.data = { cd: b.cfg.firstCast, queue: [], last: null, sang: false, cast: '', castT: 0 };
      bt.add(new BossAura(bt, b));
    },
    update: function (bt, b, dt) {
      var c = b.cfg, d = b.data, st = b.status;
      st.stun = Math.min(st.stun, c.ccCap); st.freeze = Math.min(st.freeze, c.ccCap);   // 보스는 군중 제어에 강함
      if (d.castT > 0) d.castT -= dt;
      if (b.phase === 1 && b.hp <= b.maxHp * c.phases[0]) bossPhase(bt, b, 2);
      else if (b.phase === 2 && b.hp <= b.maxHp * c.phases[1]) bossPhase(bt, b, 3);
      if (c.song.at > 0 && !d.sang && b.phase >= 3 && b.hp <= b.maxHp * c.song.at) { d.sang = true; d.queue.push('song'); }
      if (b.phase >= 3 && !b.hidden && !d.bac) {   // 바지 강림: 고유 쿨타임, 다른 스킬 중에도 발동
        d.bacT = (d.bacT == null ? c.baccarat.first : d.bacT) - dt;
        if (d.bacT <= 0) { d.bacT = c.baccarat.cd; startBaccarat(bt, b); }
      }
      bossNext(bt, b, dt, BATON_SKILLS);
    },
    phaseQueue: function (n) { return n === 3 ? ['scream', 'wash'] : ['scream']; },
    hudNames: function () { return { scream: '끼야아아악', wash: '일단 씻고 오겠습니다' }; },
    lobbyNote: { easy: '4명 + 시너지 하나로 도전해 보세요 · 페이즈마다 스킬 두 개', hard: '더 많이 구르고 더 많이 뿌림 · 이전 페이즈 스킬도 섞어 씀 · 노광석의 힘 등장' },
    // 바통의 근원 킥보드: 공 밑에 크게 (주황 발판 + 노란 손잡이 + 바퀴 빛)
    drawUnder: function (ctx, b, bt, x, y, r, time) {
      if (!b.data.kick) return;
      var a = Math.atan2(b.vy, b.vx), L = r * 1.6;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ff8a00'; ctx.lineWidth = 6;
      for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-L - 20, i * 22); ctx.lineTo(-L - 120 - (i * 37 % 60 + 60), i * 22); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.shadowColor = '#ff8a00'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#ff8a00'; Battle.roundRect(ctx, -L, -r * 0.42, L * 2, r * 0.84, r * 0.3); ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.fillStyle = '#2a2a35'; Battle.roundRect(ctx, -L * 0.8, -r * 0.25, L * 1.4, r * 0.5, r * 0.2); ctx.fill();
      ctx.fillStyle = '#ffd400'; ctx.fillRect(L * 0.82, -r * 0.95, 22, r * 1.9);
      ctx.beginPath(); ctx.arc(L * 0.82 + 11, -r * 0.95, 16, 0, Math.PI * 2); ctx.arc(L * 0.82 + 11, r * 0.95, 16, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = '#7dff9a'; ctx.shadowBlur = 25; ctx.fillStyle = '#111';
      [-L + 20, L - 20].forEach(function (wx) { ctx.beginPath(); ctx.arc(wx, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 6; ctx.stroke(); });
      ctx.restore();
    },
    drawExtra: function (ctx, b, bt, x, y, r, time) {
      var d = b.data, tl = d.tele;
      // 예고: 구르기 화살표 / 킥보드 돌격 차선
      if (tl && tl.kind === 'arrow') {
        ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(time * 30) * 0.25; ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 10; ctx.setLineDash([24, 14]);
        ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tl.x + tl.dx * tl.len, tl.y + tl.dy * tl.len); ctx.stroke(); ctx.restore();
      }
      if (tl && tl.kind === 'lane') {
        var dx = tl.x1 - tl.x0, dy = tl.y1 - tl.y0, L = Math.hypot(dx, dy);
        ctx.save(); ctx.translate(tl.x0, tl.y0); ctx.rotate(Math.atan2(dy, dx));
        ctx.globalAlpha = 0.18 + Math.sin(time * 24) * 0.1; ctx.fillStyle = '#7dff9a'; ctx.fillRect(0, -tl.w / 2, L, tl.w);
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 5; ctx.setLineDash([30, 18]); ctx.lineDashOffset = -time * 400;
        ctx.strokeRect(0, -tl.w / 2, L, tl.w); ctx.restore();
      }
      if (b.hidden) return;
      // 히어로 왕관
      ctx.save(); ctx.translate(x, y - r - 26); ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 4; ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.moveTo(-48, 16); ctx.lineTo(-48, -14); ctx.lineTo(-24, 4); ctx.lineTo(0, -22); ctx.lineTo(24, 4); ctx.lineTo(48, -14); ctx.lineTo(48, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = '#ff2b3b'; ctx.beginPath(); ctx.arc(0, 2, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // 샤워 타월: 위에서부터 몸을 덮음
      if (d.towel > 0) {
        var th = r * 2.2 * d.towel;
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, Math.PI * 2); ctx.clip();
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20;
        ctx.fillStyle = '#fff4f8'; ctx.beginPath(); ctx.moveTo(x - r * 1.2, y - r * 1.15);
        ctx.lineTo(x + r * 1.2, y - r * 1.15); ctx.lineTo(x + r * 1.2, y - r * 1.15 + th);
        for (var wv = 6; wv >= 0; wv--) ctx.quadraticCurveTo(x - r * 1.2 + (wv + 0.5) * r * 2.4 / 7, y - r * 1.15 + th + (wv % 2 ? 16 : -6), x - r * 1.2 + wv * r * 2.4 / 7, y - r * 1.15 + th);
        ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff9ecf';
        for (var sy = 0; sy < th - 10; sy += 34) ctx.fillRect(x - r * 1.2, y - r * 1.15 + sy + 12, r * 2.4, 10);
        ctx.restore();
        ctx.font = '60px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🧼', x + r * 0.9, y - r * 0.9);
      }
      // 킥보드는 drawUnder (공 밑), 소주는 손에
      if (d.kick) {
        ctx.save(); ctx.translate(x + r * 0.7, y - r * 0.3); ctx.rotate(-0.6);
        ctx.fillStyle = '#3fae5b'; Battle.roundRect(ctx, -12, -34, 24, 60, 6); ctx.fill(); ctx.fillStyle = '#e8fff0'; ctx.fillRect(-12, -6, 24, 16);
        ctx.fillStyle = '#2b7a40'; ctx.fillRect(-6, -48, 12, 16); ctx.restore();
      }
      // 바카라 카드
      if (d.bac) {
        var bt0 = d.bac.t, res = d.bac.res;
        [-1, 1].forEach(function (k) {
          var face = res ? res : Math.floor(bt0 * 10 + (k > 0 ? 1 : 0)) % 2 === 0 ? 'P' : 'B', cx = x + k * 70, cy = y - r - 110;
          var fc = face === 'P' ? '#3b8bff' : face === 'B' ? '#ff2b3b' : '#39ff88';   // 무승부는 초록
          var flip = res ? 1 : Math.abs(Math.cos(bt0 * 18 + k));
          ctx.save(); ctx.translate(cx, cy); ctx.scale(flip, 1);
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = fc; ctx.lineWidth = 6; ctx.shadowColor = fc; ctx.shadowBlur = 24;
          Battle.roundRect(ctx, -46, -64, 92, 128, 10); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
          ctx.fillStyle = fc; ctx.font = '700 64px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(face === 'T' ? '무' : face, 0, 4); ctx.restore();
        });
      }
      if (d.singing) {
        // 노광석의 힘: 무대 조명 + 이퀄라이저 막대 + 마이크
        ctx.save();
        var sp = ctx.createLinearGradient(x, y - r * 4, x, y + r);
        sp.addColorStop(0, 'rgba(255,122,217,0)'); sp.addColorStop(1, 'rgba(255,122,217,0.35)');
        ctx.fillStyle = sp; ctx.beginPath(); ctx.moveTo(x - r * 0.4, y - r * 4); ctx.lineTo(x + r * 0.4, y - r * 4); ctx.lineTo(x + r * 1.6, y + r * 0.9); ctx.lineTo(x - r * 1.6, y + r * 0.9); ctx.closePath(); ctx.fill();
        var cols = ['#ff7ad9', '#c684ff', '#7dd3ff', '#ffe066'];
        for (var q = 0; q < 28; q++) {
          var a = q / 28 * Math.PI * 2, h = r * (0.18 + 0.32 * Math.abs(Math.sin(time * 9 + q * 1.7) * Math.sin(time * 4.3 + q)));
          ctx.save(); ctx.translate(x + Math.cos(a) * (r + 22), y + Math.sin(a) * (r + 22)); ctx.rotate(a);
          ctx.fillStyle = cols[q % 4]; ctx.shadowColor = cols[q % 4]; ctx.shadowBlur = 14; ctx.fillRect(0, -7, h, 14); ctx.restore();
        }
        ctx.restore();
        ctx.font = '84px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🎤', x + r * 0.85, y + r * 0.15 + Math.sin(time * 8) * 6);
      }
    },
  },
  gyusuni: {
    id: 'gyusuni', name: '규순이', sub: '보스',
    noMark: true,   // 패시브 이중인격자: 심리학자 진형권 표식 안 받음
    female: function () { return true; },   // 여성으로 인식
    images: {   // 페이즈 사진 + 스킬 쓰는 동안 그 스킬 사진
      base:    { src: 'assets/gyu_p1.jpg', fx: 0.5, fy: 0.43, s: 0.6 },
      p2:      { src: 'assets/gyu_p2.jpg', fx: 0.5, fy: 0.42, s: 0.7 },
      p3:      { src: 'assets/gyu_p3.jpg', fx: 0.45, fy: 0.42, s: 0.75 },
      wings:   { src: 'assets/gyu_wings.jpg', fx: 0.5, fy: 0.42, s: 0.6 },
      toka:    { src: 'assets/gyu_toka.jpg', fx: 0.45, fy: 0.4, s: 0.9 },
      catch:   { src: 'assets/gyu_catch.jpg', fx: 0.45, fy: 0.3, s: 0.75 },
      arrest:  { src: 'assets/gyu_arrest.jpg', fx: 0.4, fy: 0.25, s: 0.8 },
      lucha:   { src: 'assets/ibi_lucha.jpg', fx: 0.62, fy: 0.4, s: 0.8 },
      burp:    { src: 'assets/gyu_burp.jpg', fx: 0.42, fy: 0.55, s: 0.75 },
      seizure: { src: 'assets/gyu_seizure.jpg', fx: 0.45, fy: 0.35, s: 0.7 },
      diva:    { src: 'assets/gyu_diva.jpg', fx: 0.5, fy: 0.42, s: 0.7 },
    },
    portrait: function (b) {
      var d = b.data, k = d.cur === 'dance' ? d.danced : d.lucha ? 'lucha' : d.cur;
      return this.images[k] && k !== 'base' ? k : b.phase >= 3 ? 'p3' : b.phase >= 2 ? 'p2' : 'base';
    },
    blurb: '보스',
    title: '안녕 난 규순이야',
    intro: '한규성 안에 사는 또 다른 자아, 규순이. 이비의 각성기를 더 크게 쓰고, 페이즈가 바뀔 때마다 발작을 일으킨다. 같은 말을 누누이 반복하는 버릇이 있고, 마지막엔 남의 스킬까지 쌔벼 간다.',
    info: {
      passives: [
        { name: 'I said 누누이', desc: function (c) { return Math.round(c.nunu * 100) + '% 확률로 "I said 누누이"와 함께 방금 쓴 스킬을 한 번 더 씀 (쌔비기 마스터 제외)'; } },
        { name: '이중인격자', desc: function () { return '자아가 온전치 않아서 심리학자 진형권의 표식을 받지 않음'; } },
        { name: '발작', desc: function (c) { return '페이즈가 바뀔 때마다 맵 가운데로 가서 부들부들 떨며 머리를 ' + c.seizure.smashes + '번 내리침. 내리칠 때마다 넓은 파동 (각 ' + c.seizure.damage + ', 맵 구석까지는 안 닿음)'; } },
        { name: '여성', desc: function () { return '여성으로 인식 (조우연의 뱀 2배, 포식자의 포식은 회복만, 김선율은 피해 절반)'; } },
      ],
      skills: [
        { key: 'wings', phase: 1, name: '날아가야돼', desc: function (c) { return '새가 너무 좋아(새 ' + c.birds.count + '마리)와 함께 양 옆 날개를 위아래로 빠르게 흔듦. 날개에 맞으면 ' + c.wings.damage + ' 피해 + 크게 넉백'; } },
        { key: 'dance', phase: 1, name: '춤', desc: function (c) { return '셋 중 하나. 토카토카(이비보다 넓은 충격파) / 캐치캐치(제자리 점프 ' + c.catchc.jumps + '번, 착지마다 좌우 맵 끝까지 파동 ' + c.catchc.damage + ') / 체포하겠어(휘슬 ' + c.arrest.whistles + '번, 불 때마다 도전자 전원 ' + c.arrest.stun + '초 정지)'; } },
        { key: 'lucha', phase: 2, name: '루차루차', desc: function (c) { return '이비의 루차루차와 같지만 훨씬 넓은 범위 (반경 ' + c.lucha.radius + ', ' + c.lucha.damage + ' 피해)'; } },
        { key: 'burp', phase: 2, name: 'BURP VENOM', desc: function (c) { return '진행 방향으로 "구우우으으어어어어어어억!!!" 트림. 맵 끝까지 부채꼴, 맞으면 ' + c.burp.damage + ' 피해 + ' + c.burp.time + '초 동안 냄새 지속 피해'; } },
        { key: 'rock', phase: 3, name: '개큰돌 던지기', desc: function (c) { return '아주 큰 돌을 굴림. 맞으면 ' + c.rock.damage + ' 피해 + 넉백 + ' + c.rock.stun + '초 기절. ' + c.rock.maxHits + '명을 맞히면 그 자리에서 부서짐'; } },
        { key: 'steal', phase: 3, name: '쌔비기 마스터', desc: function () { return '한 판에 한 번, 살아 있는 도전자 스킬 하나(1 · 2스킬 상관없이)를 훔침. 훔친 스킬은 그 게임 동안 봉인되고, 이 자리는 훔친 스킬로 바뀜'; } },
      ],
      hard: { key: 'diva', name: '디바 자세', desc: function (c) { return '체력 ' + Math.round(c.diva.at * 100) + '% 이하에서 "이것도 x발 너프해봐 개x끼들아!!!" 하며 맵 가운데에 의자를 던짐. ' + c.diva.fuse + '초 뒤 폭발(' + c.diva.blastDamage + ') + 파편 ' + c.diva.shards + '개(각 ' + c.diva.shardDamage + ')'; } },
    },
    lobbyNote: { easy: '페이즈마다 스킬 두 개 · 페이즈가 바뀔 땐 구석으로 피하세요', hard: '더 넓고 더 오래 · 이전 페이즈 스킬도 섞어 씀 · 디바 자세 등장' },
    skills: [], noAutoPhase2: true,
    color: function (b) { return b.phase >= 3 ? b.cfg.phase3Color : b.phase >= 2 ? b.cfg.phase2Color : b.cfg.color; },
    init: function (bt, b) {
      b.data = { cd: b.cfg.firstCast, queue: [], last: null, cast: '', castT: 0 };
      bt.add(new GyuAura(bt, b));
    },
    update: function (bt, b, dt) {
      var c = b.cfg, d = b.data, st = b.status;
      st.stun = Math.min(st.stun, c.ccCap); st.freeze = Math.min(st.freeze, c.ccCap);   // 보스는 군중 제어에 강함
      if (d.castT > 0) d.castT -= dt;
      if (b.phase === 1 && b.hp <= b.maxHp * c.phases[0]) bossPhase(bt, b, 2);
      else if (b.phase === 2 && b.hp <= b.maxHp * c.phases[1]) bossPhase(bt, b, 3);
      if (c.diva.at > 0 && !d.diva && b.hp <= b.maxHp * c.diva.at) { d.diva = true; d.queue.push('diva'); }
      bossNext(bt, b, dt, GYU_SKILLS);
    },
    phaseQueue: function () { return ['seizure']; },
    // 쌔비기 마스터는 한 번 쓰면 훔친 스킬로 바뀜 (못 훔쳤으면 빠짐)
    poolFix: function (b, out) { var d = b.data; return out.map(function (k) { return k !== 'steal' ? k : d.stolen ? 'stolen' : d.stoleUsed ? null : k; }).filter(Boolean); },
    // 패시브 I said 누누이: 끝난 스킬을 확률로 한 번 더 (다시 쓴 건 또 반복 안 함)
    onSkillEnd: function (bt, b, k) {
      var d = b.data;
      if (d.nunu) { d.nunu = false; return; }
      if (GYU_NO_REPEAT.indexOf(k) >= 0 || Math.random() >= b.cfg.nunu) return;
      d.nunu = true; d.queue.unshift(k);
      FX.banner('I said 누누이', { color: '#c77dff', sub: '규순이 · 패시브', size: 100, life: 1.1, y: CONFIG.arena.y + 260 });
      FX.text(b.x, b.y - b.r - 70, 'I said 누누이', '#ffffff', 56, 1.1); FX.sfx('awaken');
      bt.emit('nunu', { skill: k });
    },
    hudNames: function (b) { return { seizure: '발작', stolen: b.data.stolen ? '🫳 ' + b.data.stolen.name : '훔친 스킬' }; },
    drawExtra: function (ctx, b, bt, x, y, r, time) {
      var d = b.data, tl = d.tele, i;
      if (tl && tl.kind === 'cone') {   // BURP VENOM 예고: 맵 끝까지 부채꼴
        ctx.save(); ctx.globalAlpha = 0.18 + Math.sin(time * 26) * 0.08; ctx.fillStyle = '#9cff57';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 3000, tl.ang - tl.half, tl.ang + tl.half); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.strokeStyle = '#9cff57'; ctx.lineWidth = 6; ctx.setLineDash([26, 16]); ctx.stroke(); ctx.restore();
      }
      if (tl && tl.kind === 'ring') {   // 발작 예고: 파동이 닿는 범위 (구석은 안전)
        ctx.save(); ctx.globalAlpha = 0.12 + Math.sin(time * 18) * 0.05; ctx.fillStyle = '#ff4fd8';
        ctx.beginPath(); ctx.arc(tl.x, tl.y, tl.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 8; ctx.setLineDash([30, 20]); ctx.lineDashOffset = -time * 200; ctx.stroke(); ctx.restore();
      }
      if (tl && tl.kind === 'arrow') {   // 개큰돌 예고
        ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(time * 30) * 0.25; ctx.strokeStyle = '#d8c8b0'; ctx.lineWidth = b.cfg.rock.radius * 1.6; ctx.lineCap = 'round';
        ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tl.x + tl.dx * tl.len, tl.y + tl.dy * tl.len); ctx.stroke(); ctx.restore();
      }
      if (b.hidden) return;
      if (d.wing != null) {   // 날개: 양 옆으로 펼쳐 위아래로 빠르게
        var c = b.cfg.wings, fl = Math.sin(d.wing * 42) * 0.55;
        [-1, 1].forEach(function (s) {
          ctx.save(); ctx.translate(x + s * r * 0.75, y); ctx.scale(s, 1); ctx.rotate(-fl);
          ctx.shadowColor = '#e6c8ff'; ctx.shadowBlur = 24;
          for (i = 0; i < 5; i++) {
            var L = c.length * (1 - i * 0.12) + r * 0.3;
            ctx.fillStyle = i % 2 ? '#f3e6ff' : '#ffffff'; ctx.strokeStyle = 'rgba(120,60,160,0.8)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(L / 2, -c.width * 0.3 + i * c.width * 0.15, L / 2, c.width * 0.13, -0.15 + i * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
          ctx.restore();
        });
      }
      // 리본 (바통 왕관 대신)
      ctx.save(); ctx.translate(x, y - r - 18); ctx.rotate(Math.sin(time * 3) * 0.08);
      ctx.fillStyle = '#ff4fd8'; ctx.strokeStyle = '#7a1060'; ctx.lineWidth = 4; ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 18;
      [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 70, -46, s * 76, 0); ctx.quadraticCurveTo(s * 70, 40, 0, 0); ctx.fill(); ctx.stroke(); });
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffd6f4'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      if (d.whistle) { ctx.font = '70px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('📢', x + r * 0.9, y - r * 0.2); }
      if (d.stolen) { ctx.font = '54px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🫳', x - r * 0.95, y + r * 0.6); }
    },
  },
};

// ---------- 보스전 UI ----------
// 위: 보스 이름판 + 큰 체력바(페이즈 눈금) / 그 아래: 도전자 카드들
Battle.prototype.drawBossHUD = function (ctx, time) {
  var self = this, b = this.boss, W = CONFIG.W, rr = Battle.roundRect, col = b.color(), d = b.data;
  // 보스 이름판
  ctx.save();
  var PH = 200, g = ctx.createLinearGradient(0, 12, 0, 12 + PH); g.addColorStop(0, '#2c0912'); g.addColorStop(1, '#0d0510');
  ctx.fillStyle = g; rr(ctx, 16, 12, W - 32, PH, 22); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#d8a428'; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = col; rr(ctx, 26, 22, W - 52, PH - 20, 16); ctx.stroke();
  [[16, 12], [W - 16, 12], [16, 12 + PH], [W - 16, 12 + PH]].forEach(function (p) {   // 모서리 장식
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#ffd400'; ctx.fillRect(-9, -9, 18, 18); ctx.restore();
  });
  // 초상화
  var px = 104, py = 110, pr = 72;
  ctx.shadowColor = col; ctx.shadowBlur = 30; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, pr + 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  Assets.drawBall(ctx, b.def, b.def.portrait(b), px, py, pr, 0, col);
  ctx.lineWidth = 6; ctx.strokeStyle = '#ffd400'; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.stroke();
  // 이름 · 난이도 · 페이즈
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 46px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.lineWidth = 6; ctx.strokeStyle = '#000';
  ctx.strokeText(b.name, 190, 64); ctx.fillStyle = '#ffd400'; ctx.fillText(b.name, 190, 64);
  var nx = 190 + ctx.measureText(b.name).width + 16, hard = this.difficulty === 'hard';
  ctx.font = '700 22px "Malgun Gothic",sans-serif';
  var tag = hard ? 'HARD' : 'EASY', tw = ctx.measureText(tag).width + 24;
  ctx.fillStyle = hard ? '#ff2b3b' : '#39c46a'; rr(ctx, nx, 34, tw, 34, 17); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillText(tag, nx + 12, 59);
  ctx.textAlign = 'right'; ctx.font = '700 26px "Do Hyeon","Malgun Gothic",sans-serif';
  ['Ⅰ', 'Ⅱ', 'Ⅲ'].forEach(function (s, i) {
    var on = b.phase >= i + 1, cx = W - 60 - (2 - i) * 46;
    ctx.fillStyle = on ? (i === 2 ? b.cfg.phase3Color : i === 1 ? b.cfg.phase2Color : b.cfg.color) : 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx, 50, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? '#111' : '#777'; ctx.textAlign = 'center'; ctx.fillText(s, cx, 59);
  });
  // 체력바
  var bx = 190, by = 80, bw = W - 220, bh = 42, frac = Math.max(0, b.hp / b.maxHp), shown = Math.max(0, b.hpShown / b.maxHp);
  ctx.fillStyle = '#1a0a10'; rr(ctx, bx, by, bw, bh, 10); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; rr(ctx, bx, by, bw * shown, bh, 10); ctx.fill();
  var hg = ctx.createLinearGradient(bx, 0, bx + bw, 0); hg.addColorStop(0, '#ff2b3b'); hg.addColorStop(0.5, col); hg.addColorStop(1, '#ffd400');
  ctx.fillStyle = hg; rr(ctx, bx, by, bw * frac, bh, 10); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, bx, by + 4, bw * frac, bh * 0.3, 6); ctx.fill();   // 윤기
  b.cfg.phases.forEach(function (p) {   // 페이즈 눈금
    var tx = bx + bw * p;
    ctx.fillStyle = '#ffd400'; ctx.fillRect(tx - 2, by - 6, 4, bh + 12);
    ctx.beginPath(); ctx.moveTo(tx - 8, by - 10); ctx.lineTo(tx + 8, by - 10); ctx.lineTo(tx, by - 2); ctx.fill();
  });
  ctx.lineWidth = 3; ctx.strokeStyle = '#d8a428'; rr(ctx, bx, by, bw, bh, 10); ctx.stroke();
  ctx.font = '700 24px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000';
  var ht = Math.ceil(Math.max(0, b.hp)) + ' / ' + Math.round(b.maxHp) + '   (' + Math.round(frac * 100) + '%)';
  ctx.strokeText(ht, bx + bw / 2, by + 30); ctx.fillStyle = '#ffffff'; ctx.fillText(ht, bx + bw / 2, by + 30);
  // 이번 페이즈 스킬 칩: 지금 쓰는 스킬은 빛남 (패시브·하드 스킬이 발동 중이면 따로 한 칸)
  var names = {}, info = b.def.info;
  info.skills.forEach(function (s) { names[s.key] = s.name; });
  Object.assign(names, b.def.hudNames(b)); names[info.hard.key] = info.hard.name;
  var keys = bossPool(b).slice();
  if (d.cur && keys.indexOf(d.cur) < 0) keys.unshift(d.cur);
  if (b.phase >= 3 && b.cfg.baccarat) { names.bacc = d.bac ? '🃏 바지 강림!' : '🃏 바지 강림 ' + Math.max(0, d.bacT == null ? b.cfg.baccarat.first : d.bacT).toFixed(1) + 's'; keys.unshift('bacc'); }   // 맨 앞에 (칩이 많아도 안 잘리게)
  ctx.font = '700 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'left';
  var cx2 = 190, cy2 = 140;
  keys.forEach(function (k) {
    var on = d.cur === k || (k === 'bacc' && !!d.bac), label = (on ? '▶ ' : '') + names[k], w2 = ctx.measureText(label).width + 26;
    if (cx2 + w2 > W - 190) return;
    ctx.save();
    if (on) { ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.fillStyle = col; } else ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, cx2, cy2, w2, 34, 17); ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = on ? '#ffffff' : 'rgba(255,212,0,0.6)'; ctx.stroke();
    ctx.fillStyle = on ? '#1a0a10' : '#ffe066'; ctx.fillText(label, cx2 + 13, cy2 + 24);
    ctx.restore();
    cx2 += w2 + 8;
  });
  ctx.textAlign = 'right'; ctx.font = '700 20px "Malgun Gothic",sans-serif';
  var st2 = b.hidden ? '… 자리를 비움' : d.cur ? '사용 중' : '다음 스킬 ' + Math.max(0, d.cd).toFixed(1) + '초';
  ctx.fillStyle = b.hidden ? '#78ccf4' : '#bbbbbb'; ctx.fillText(st2, W - 40, cy2 + 24);
  var extra = [];
  if (b.status.atk > 0 && b.status.atkMul > 1) extra.push('🔥 핫식스 버프 ' + b.status.atk.toFixed(1) + 's');
  var left = Math.max(0, this.maxTime - this.time), mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  extra.push('⏱ ' + mm + ':' + (ss < 10 ? '0' : '') + ss);
  ctx.fillStyle = '#dddddd'; ctx.fillText(extra.join('   '), W - 40, 196);
  ctx.textAlign = 'left'; ctx.fillStyle = '#999999'; ctx.font = '700 18px "Malgun Gothic",sans-serif';
  ctx.fillText('패시브: ' + info.passives.map(function (p) { return p.name; }).join(' · ') + (hard ? ' · 하드: ' + info.hard.name : ''), 190, 196, W / 2 - 60);
  ctx.restore();

  // 도전자 카드: 초상화 · 이름 · 체력(숫자) · 스킬 두 개 쿨타임
  var ps = this.balls.filter(function (o) { return !o.isBoss; }), n = ps.length;
  var cols = n <= 4 ? n : n <= 8 ? 4 : Math.ceil(n / 3), rows = Math.ceil(n / cols), gap = 8, top = 222, area = CONFIG.screen.y - 34 - top;
  var cw = (W - 32 - (cols - 1) * gap) / cols, ch = Math.min(Math.max(124, Math.min(190, cw * 0.55)), (area - (rows - 1) * gap) / rows);   // 인원이 적으면 크게
  ps.forEach(function (o, i) {
    var x = 16 + (i % cols) * (cw + gap), y = top + Math.floor(i / cols) * (ch + gap), oc = o.color(), k = ch / 110;
    ctx.save(); ctx.globalAlpha = o.alive ? 1 : 0.35;
    ctx.fillStyle = 'rgba(14,10,30,0.88)'; rr(ctx, x, y, cw, ch, 14 * k + 4); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = o.alive ? oc : '#555'; ctx.stroke();
    var r = Math.min(ch * 0.3, cw * 0.16), cx = x + 8 + r, cy = y + ch * 0.42;
    Assets.drawBall(ctx, o.def, o.def.portrait(o), cx, cy, r, 0, oc);
    ctx.lineWidth = 3; ctx.strokeStyle = o.phase >= 2 ? o.cfg.phase2Color : oc; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    var tx = cx + r + 8, tw2 = x + cw - 8 - tx;
    // 이름 + 상태
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '700 ' + Math.round(21 * k) + 'px "Do Hyeon","Malgun Gothic",sans-serif';
    ctx.fillStyle = '#ffffff'; ctx.fillText(o.name + (o.alive ? '' : (o.leftCall ? ' 📞' : ' ✝')), tx, y + 24 * k, tw2 * 0.75);
    var ic = (o.phase >= 2 ? '⚡' : '') + (o.status.stun > 0 ? '💫' : '') + (o.status.atk > 0 && o.status.atkMul < 1 ? '😞' : '') + (o.status.slow > 0 ? '🐌' : '');
    if (ic) { ctx.font = Math.round(17 * k) + 'px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'right'; ctx.fillText(ic, x + cw - 6, y + 23 * k); ctx.textAlign = 'left'; }
    // 체력 바 + 숫자
    var hb = Math.max(10, 20 * k), hy = y + 34 * k, f = Math.max(0, o.hp / o.maxHp);
    ctx.fillStyle = '#1b1530'; rr(ctx, tx, hy, tw2, hb, hb / 2); ctx.fill();
    ctx.fillStyle = f < 0.3 ? '#ff4d6d' : '#7dff9a'; rr(ctx, tx, hy, tw2 * f, hb, hb / 2); ctx.fill();
    ctx.font = '700 ' + Math.round(Math.max(11, 15 * k)) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    var ht = Math.ceil(Math.max(0, o.hp)) + ' / ' + Math.round(o.maxHp);
    ctx.strokeText(ht, tx + tw2 / 2, hy + hb * 0.78); ctx.fillStyle = '#ffffff'; ctx.fillText(ht, tx + tw2 / 2, hy + hb * 0.78);
    // 스킬 쿨타임 (카드가 너무 작으면 생략)
    if (ch >= 70) {
      var gy = Math.max(hy + hb + 8 * k, cy + r + 5), gh = Math.max(9, 15 * k), gx0 = x + 8, gw = (cw - 16 - 6) / 2;
      o.skills.slice(0, 2).forEach(function (sk, q) {
        var locked = sk.sealed || (q > 0 && o.phase < 2 && !(o.def.earlySkill2 && o.def.earlySkill2(self, o)));
        var info = o.def.gauge ? o.def.gauge(o, q, sk, self) : null;
        var fill = info && info.fill != null ? info.fill : 1 - Math.max(0, sk.cd) / sk.max;
        var label = sk.sealed ? '🫳 봉인: ' + sk.def.name : locked ? '🔒 ' + sk.def.name : info && info.label ? info.label : sk.def.name + (sk.def.passive ? '' : ' ' + Math.max(0, sk.cd).toFixed(1) + 's');
        var gx = gx0 + q * (gw + 6);
        ctx.fillStyle = '#1b1530'; rr(ctx, gx, gy, gw, gh, gh / 2); ctx.fill();
        if (!locked) { ctx.fillStyle = fill >= 1 ? '#ffffff' : (info && info.color) || oc; rr(ctx, gx, gy, gw * Math.max(0, Math.min(1, fill)), gh, gh / 2); ctx.fill(); }
        ctx.font = '700 ' + Math.round(Math.max(10, 13 * k)) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
        ctx.fillStyle = locked ? 'rgba(255,255,255,0.45)' : '#ffffff';
        ctx.strokeText(label, gx + 6, gy + gh * 0.8, gw - 10); ctx.fillText(label, gx + 6, gy + gh * 0.8, gw - 10);
      });
    }
    ctx.restore();
  });
  // 도전자 팀 시너지
  if (this.synergies.length) {
    var txt = this.synergies.filter(function (s) { return s.team === 1; }).map(function (s) { return '✦ ' + s.name; }).join('   ') + (this.synergyBonus ? '   (이지 보너스 x' + this.synergyBonus + ')' : '');
    if (txt) { ctx.font = '700 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe14d'; ctx.strokeText(txt, W / 2, CONFIG.arena.y - 6); ctx.fillText(txt, W / 2, CONFIG.arena.y - 6); }
  }
  this.balls.forEach(function (o) { if (o.def.drawOverlay) o.def.drawOverlay(ctx, o, self, time); });
};
// 보스전 경기장 테두리: 금색 + 보스 페이즈 색이 맥동
Battle.prototype.drawBossBorder = function (ctx) {
  var A = CONFIG.arena, b = this.boss, col = b.color(), t = this.time, p = 0.5 + Math.sin(t * (b.phase >= 3 ? 7 : 3)) * 0.5;
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = 30 + p * 30; ctx.lineWidth = 10;
  var g = ctx.createLinearGradient(A.x, A.y, A.x + A.w, A.y + A.h);
  g.addColorStop(0, '#ffd400'); g.addColorStop(0.5, col); g.addColorStop(1, '#ffd400');
  ctx.strokeStyle = g; ctx.strokeRect(A.x, A.y, A.w, A.h);
  ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,212,0,0.5)'; ctx.strokeRect(A.x + 14, A.y + 14, A.w - 28, A.h - 28);
  if (b.phase >= 3) {   // 최종 페이즈: 붉은 기운
    var v = ctx.createRadialGradient(A.x + A.w / 2, A.y + A.h / 2, A.h * 0.3, A.x + A.w / 2, A.y + A.h / 2, A.h * 0.75);
    v.addColorStop(0, 'rgba(255,40,60,0)'); v.addColorStop(1, 'rgba(255,40,60,' + (0.12 + p * 0.08) + ')');
    ctx.fillStyle = v; ctx.fillRect(A.x, A.y, A.w, A.h);
  }
  ctx.restore();
};

// 테스트/디버그용
Object.assign(Ents, { GyuAura: GyuAura, HWave: HWave, BigRock: BigRock, ChairBomb: ChairBomb, Shard: Shard, SheetFx: SheetFx, Hot6Box: Hot6Box, BossBullet: BossBullet, CoinShot: CoinShot, JokeShot: JokeShot, SongWave: SongWave, BossAura: BossAura });
