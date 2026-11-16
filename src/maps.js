// 맵: 바닥 그림 · 맵 벽 · 주기 이벤트 · 맵 아이템. Battle이 this.map(MapRun)으로 부름 (보스전은 맵 없음)
// 수치는 CONFIG.maps
var MAP_IDS = ['workroom', 'mind'];
var MAPS = {
  workroom: {
    id: 'workroom', no: '01', name: '작업실', color: '#ffb347',
    lines: [
      '시작할 때 산내 / 정발산 중 하나, 그 뒤 30초마다 다시 뽑음 (같은 곳이 또 나올 수 있음)',
      '산내: 정사각형 · 금연구역 창문(흡연자는 담배 피우느라 행동불능, 받는 피해 2배)',
      '산내: 조하람 펑크(긴급소집 30% 취소) · 월세머신(10초마다 모두에게서 체력 5 흡수)',
      '산내 아이템: 담요(함정, 수면) · 피자 오브 레전드(체력 +20)',
      '정발산: 하얀 담배 연기 독 지대(10초마다 환기) · 비흡연자는 독 피해 2배',
      '정발산: 아래쪽 1/3 다락방(2층)이 가로 벽으로 10초마다 분리/통합',
      '정발산 아이템: 의자(1층, 투척 20 · 김선율 30) · 핫식스 더 킹(다락방, 회복 / 10% 소주, 개방되면 사라짐)',
    ],
  },
  mind: {
    id: 'mind', no: '02', name: '마인드', color: '#9cff57',
    lines: [
      '5초마다 언데드 마인드 부원 등장 (한 번에 1명) · 주변을 도는 촬영팀 2명에 닿으면 3 피해',
      '리허설: 15초마다 1~3명(1대1이면 1명)이 사라졌다가 5초 뒤 독 · 둔화 상태로 복귀',
      '한규성(이비)은 리허설에서 돌아오면 규순이로 등장',
      '아이템: 주현지 누나 — 먹으면 리허설 독에 안 걸림, 10초 뒤 다른 곳에 다시 생김',
      '아이템: 편의점 라면 — 바로 10 회복 + 국물로 1씩 총 20 회복 (5% 확률로 쏟거나, 마시다 맞으면 쏟음)',
    ],
  },
};
var SUB_MAPS = {
  sannae: { name: '산내', color: '#ff9a3c' },
  jbs:    { name: '정발산', color: '#e8e8ff' },
  mind:   { name: '마인드', color: '#9cff57' },
};
// 맵에 나오는 사람 공 (사진은 assets/joohyunji.* 를 넣으면 자동으로 씀, 없으면 글자 원)
var MAP_BALLS = {
  joohyunji: { id: 'joohyunji', name: '주현지', images: { base: { src: 'assets/joohyunji.jpg', fx: 0.5, fy: 0.42, s: 0.8 } } },
  mindMember: { id: 'mindMember', name: '마인드', images: { base: { src: 'assets/mind_member.jpg', fx: 0.5, fy: 0.5, s: 1 } } },
};

function _smoker(b) { return CONFIG.maps.nonSmokers.indexOf(b.def.name) < 0; }
function _mapClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
// 원이 사각형 벽에 박히면 밖으로 밀어내고 튕김
function _pushRect(b, R) {
  var cx = _mapClamp(b.x, R.x, R.x + R.w), cy = _mapClamp(b.y, R.y, R.y + R.h), dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= b.r) return false;
  if (d > 0.001) {
    var nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
    b.x = cx + nx * b.r; b.y = cy + ny * b.r;
    if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
  } else if (b.x - R.x < R.y + R.h - b.y) { b.x = R.x - b.r; b.vx = -Math.abs(b.vx); }
  else { b.y = R.y + R.h + b.r; b.vy = Math.abs(b.vy); }
  return true;
}

class MapRun {
  constructor(bt, id) {
    this.bt = bt; this.id = id; this.def = MAPS[id];
    this.sub = id === 'workroom' ? (Math.random() < 0.5 ? 'sannae' : 'jbs') : id;   // 작업실은 시작부터 산내/정발산 중 하나
    this.split = this.sub === 'jbs';
    this.clk = {}; this.smokes = []; this.split = false; this.splitK = 0; this.splitT = 0; this.vent = 0; this.flash = 0;
    this.swapIn = CONFIG.maps.workroom.swap;
    var T = this.target(); bt.arena.y = T.y; bt.arena.h = T.h;   // 산내로 시작하면 처음부터 정사각형 (배치 전에)
  }
  get subName() { return SUB_MAPS[this.sub].name; }
  init() { if (this.id === 'mind') this.spawnJoo(); }
  every(key, sec, dt) {
    this.clk[key] = (this.clk[key] || 0) + dt;
    if (this.clk[key] < sec) return false;
    this.clk[key] -= sec; return true;
  }
  left(key, sec) { return Math.max(0, Math.ceil(sec - (this.clk[key] || 0))); }
  players() { return this.bt.balls.filter(function (b) { return b.alive && !b.isBoss; }); }
  // 지금 맵이 목표로 하는 경기장 (산내는 위아래가 줄어 정사각형)
  target() {
    var B = this.bt.baseArena;
    if (this.sub !== 'sannae' || B.h <= B.w) return B;
    return { x: B.x, y: B.y + (B.h - B.w) / 2, w: B.w, h: B.w };
  }
  notch() {
    var A = this.bt.arena, c = CONFIG.maps.sannae;
    return { x: A.x + A.w * (1 - c.notchW), y: A.y, w: A.w * c.notchW, h: A.w * c.notchH };
  }
  divY() { var A = this.bt.arena; return A.y + A.h * 2 / 3; }   // 아래쪽 1/3이 2층(다락방)
  floorOf(b) { return b.y > this.divY() ? 2 : 1; }
  // 아이템 자리: region 'all' | 'f1'(1층) | 'f2'(2층)
  spawnPoint(region) {
    var A = this.target(), bt = this.bt, m = 70, y0 = A.y + m, y1 = A.y + A.h - m, p, self = this;
    if (region === 'f1') y1 = A.y + A.h * 2 / 3 - 60;
    if (region === 'f2') y0 = A.y + A.h * 2 / 3 + 60;
    var c = CONFIG.maps.sannae, k = A.w / 1000;
    function bad(p) {
      if (self.sub === 'sannae') {
        if (p.x > A.x + A.w * (1 - c.notchW) - 60 && p.y < A.y + A.w * c.notchH + 60) return true;
        if (Math.hypot(p.x - A.x - A.w, p.y - A.y - A.h) < c.window * k + 90) return true;
      }
      return bt.balls.some(function (o) { return o.alive && Math.hypot(o.x - p.x, o.y - p.y) < o.r + 90; });
    }
    for (var i = 0; i < 15; i++) { p = { x: _rnd(A.x + m, A.x + A.w - m), y: _rnd(y0, y1) }; if (!bad(p)) break; }
    return p;
  }
  items(kind) { return this.bt.ents.filter(function (e) { return e instanceof MapItem && !e.dead && (!kind || e.kind === kind); }); }
  addItem(kind, region) { var p = this.spawnPoint(region); this.bt.add(new MapItem(this.bt, kind, p)); FX.ring(p.x, p.y, 10, 80, 0.4, ITEM_COLOR[kind], 8); FX.sfx('pickup'); return p; }

  setSub(s) {
    var bt = this.bt, info = SUB_MAPS[s];
    this.sub = s; this.clk = {}; this.smokes = []; this.split = s === 'jbs'; this.splitT = 0; this.vent = 0; this.flash = 1;
    bt.ents.forEach(function (e) { if (e instanceof MapItem && e.kind !== 'joo') e.dead = true; });
    bt.balls.forEach(function (b) { if (b.data.smoking > 0) { b.data.smoking = 0; b.status.hold = 0; } b.data.chair = null; });
    FX.banner(info.name, { color: info.color, sub: '작업실 · 맵 변경', size: 130, life: 1.5 });
    FX.flash(info.color, 0.3, 0.35); FX.shake(14); FX.sfx('phase');
    bt.emit('mapSwap', { sub: s });
  }

  update(dt) {
    var M = CONFIG.maps, bt = this.bt, self = this, A = bt.arena;
    if (this.flash > 0) this.flash -= dt * 2;
    if (this.id === 'workroom') {
      this.swapIn -= dt;
      if (this.swapIn <= 0) { this.swapIn += M.workroom.swap; this.setSub(Math.random() < 0.5 ? 'sannae' : 'jbs'); }
    }
    // 경기장 크기 맞춰 가기 (산내 ↔ 원래)
    var T = this.target();
    ['y', 'h'].forEach(function (k) { var d = T[k] - A[k]; A[k] = Math.abs(d) < 0.5 ? T[k] : A[k] + d * Math.min(1, dt * 5); });
    this.players().forEach(function (b) {
      if (b.data.soju > 0) b.data.soju -= dt;
      if (!b.hidden) bt.walls(b);   // 줄어든 경기장 · 벽 밖으로 밀려난 공 정리
    });
    if (this.sub === 'sannae') this.updSannae(dt);
    else if (this.sub === 'jbs') this.updJbs(dt);
    else if (this.sub === 'mind') this.updMind(dt);
    var tk = this.splitK + ((this.split ? 1 : 0) - this.splitK) * Math.min(1, dt * 6);
    this.splitK = Math.abs(tk - (this.split ? 1 : 0)) < 0.01 ? (this.split ? 1 : 0) : tk;
  }

  // ---------- 산내 ----------
  updSannae(dt) {
    var c = CONFIG.maps.sannae, bt = this.bt, A = bt.arena, k = A.w / 1000, self = this;
    var cx = A.x + A.w, cy = A.y + A.h;
    this.players().forEach(function (b) {
      var d = b.data;
      if (d.smoking > 0) {
        d.smoking -= dt; b.vx *= 0.85; b.vy *= 0.85;
        if (Math.random() < dt * 9) FX.particle({ x: b.x + b.r * 0.55, y: b.y - b.r * 0.2, vx: _rnd(-20, 30), vy: _rnd(-110, -60), life: 1.1, size: _rnd(14, 26), color: '#c9c9c9', shape: 'smoke' });
        if (d.smoking <= 0) {   // 다 피우고 창문에서 떨어짐
          d.smokeCd = bt.time + c.smokeCd;
          var a = Math.atan2(A.y + A.h / 2 - b.y, A.x + A.w / 2 - b.x); b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
          FX.text(b.x, b.y - b.r - 50, '후~ 다 피웠다', '#dddddd', 38, 0.8);
        }
        return;
      }
      if (b.hidden || b.air || !_smoker(b) || (d.smokeCd || 0) > bt.time || b.status.sleep > 0) return;
      if (Math.hypot(b.x - cx, b.y - cy) < c.window * k + b.r * 0.4) {
        d.smoking = c.smokeTime; b.status.hold = c.smokeTime;
        if (b.action && !b.action.uninterruptible) { if (b.action.end) b.action.end(); b.action = null; }
        FX.text(b.x, b.y - b.r - 60, '금연구역인데… 🚬', '#ffd6a0', 46, 1.2); FX.sfx('ding');
        bt.emit('smoke', { who: b.def.id });
      }
    });
    if (this.every('rent', c.rentEvery, dt)) this.players().forEach(function (h) {
      if (h.def.name !== '조하람' || h.hidden) return;
      var sum = 0;
      self.players().forEach(function (o) {
        if (o === h || !o.targetable) return;
        var got = bt.damage(o, c.rent, null, { dot: true, noMult: true, color: '#ffd400', kind: 'rent' });
        sum += got;
        if (got > 0) for (var i = 0; i < 4; i++) FX.particle({ x: o.x, y: o.y, vx: (h.x - o.x) * _rnd(1.2, 1.8), vy: (h.y - o.y) * _rnd(1.2, 1.8), life: 0.55, size: _rnd(10, 15), color: '#ffd400', shape: 'square' });
      });
      bt.heal(h, Math.min(sum, c.rentCap));
      FX.text(h.x, h.y - h.r - 90, '월세 걷는 날 💸', '#ffd400', 48, 1.1); FX.sfx('coin');
      bt.emit('rent', { amt: sum });
    });
    if (this.every('blanket', c.blanket.every, dt) && this.items('blanket').length < c.blanket.max) this.addItem('blanket', 'all');
    if (this.every('pizza', c.pizza.every, dt) && this.items('pizza').length < c.pizza.max) this.addItem('pizza', 'all');
  }

  // ---------- 정발산 ----------
  updJbs(dt) {
    var c = CONFIG.maps.jbs, bt = this.bt, A = bt.arena, self = this;
    // 2층 분리 / 통합
    if (this.every('split', c.split, dt)) {
      this.split = !this.split;
      FX.text(A.x + A.w / 2, this.divY() - 50, this.split ? '다락방 분리!' : '다락방 개방!', this.split ? '#ff8c42' : '#7dd3ff', 56, 1.2);
      if (!this.split) this.items().forEach(function (e) {   // 2층이 사라지면 2층 아이템도 사라짐
        if (e.kind !== 'king' && e.kind !== 'soju') return;
        e.dead = true; FX.burst(e.x, e.y, '#d9b98a', 14, 400, 8, 0.5, 'smoke');
      });
      FX.sfx(this.split ? 'slam' : 'vanish'); FX.shake(this.split ? 12 : 4);
      bt.emit('split', { closed: this.split });
    }
    // 담배 연기 지대: 계속 생기고 10초마다 환기로 싹 빠짐
    if (this.every('vent', c.vent, dt)) {
      this.smokes.forEach(function (s) { s.fade = 0.7; });
      this.vent = 1.2;
      FX.text(A.x + A.w / 2, A.y + 90, '환기 중~ 🌬️', '#bfe9ff', 60, 1.3); FX.sfx('vanish');
      bt.emit('vent');
    }
    if (this.vent > 0) {
      this.vent -= dt;
      for (var i = 0; i < 3; i++) FX.particle({ x: A.x + _rnd(0, 60), y: _rnd(A.y + 20, A.y + A.h - 20), vx: _rnd(1400, 2000), vy: _rnd(-40, 40), life: 0.6, size: _rnd(4, 7), color: 'rgba(220,240,255,0.7)', shape: 'square' });
    }
    if (this.vent <= 0 && this.every('smoke', c.smokeEvery, dt) && this.smokes.length < c.smokeMax) {
      var p = this.spawnPoint('all');
      this.smokes.push({ x: p.x, y: p.y, r: 0, max: c.smokeRadius * _rnd(0.75, 1.2), t: 0, spin: _rnd(0, 6) });
    }
    this.smokes = this.smokes.filter(function (s) {
      s.t += dt; s.r = s.max * Math.min(1, s.t / 2);
      if (s.fade != null) { s.fade -= dt; s.x += 900 * dt; return s.fade > 0; }
      return true;
    });
    this.players().forEach(function (b) {
      if (!b.targetable || b.air) return;
      if (self.smokes.some(function (s) { return s.fade == null && Math.hypot(b.x - s.x, b.y - s.y) < s.r * 0.85; })) {
        b.status.poison = Math.max(b.status.poison, c.poisonTime); b.status.poisonDps = c.poisonDps;
      }
      // 의자를 들었으면 잠깐 뒤 가까운 적에게 투척
      var ch = b.data.chair;
      if (ch && (ch.t += dt) > 0.6 && !b.disabled && !b.hidden) {
        var t = bt.nearest(b);
        if (t && Math.hypot(t.x - b.x, t.y - b.y) < 950 && (!self.split || self.floorOf(t) === self.floorOf(b))) {
          var p2 = bt.aim(b, t.x, t.y), a = Math.atan2(p2.y - b.y, p2.x - b.x);
          bt.add(new ChairShot(bt, b, a, b.def.name === '김선율' ? c.chair.samsik : c.chair.damage));
          b.data.chair = null;
          bt.skillText(b, '의자 투척!', '#ffb066'); FX.sfx('throw');
          bt.emit('chairThrow', { who: b.def.id });
        }
      }
    });
    if (this.every('chair', c.chair.every, dt) && this.items('chair').length < c.chair.max) this.addItem('chair', 'f1');
    if (this.every('king', c.king.every, dt) && this.split && this.items('king').length + this.items('soju').length < c.king.max)
      this.addItem(Math.random() < c.king.soju ? 'soju' : 'king', 'f2');
  }

  // ---------- 마인드 ----------
  updMind(dt) {
    var c = CONFIG.maps.mind, bt = this.bt, self = this;
    if (this.every('undead', c.spawn, dt) && bt.ents.filter(function (e) { return e instanceof Undead && !e.dead; }).length < c.maxUndead) {
      var p = this.spawnPoint('all');
      bt.add(new Undead(bt, p));
      FX.burst(p.x, p.y, '#6b8f5a', 24, 500, 12, 0.7, 'smoke'); FX.sfx('awaken');
      bt.emit('undead');
    }
    // 편의점 라면: 국물 마시는 동안 조금씩 회복
    if (this.every('ramen', c.ramen.every, dt) && this.items('ramen').length < c.ramen.max) this.addItem('ramen', 'all');
    this.players().forEach(function (b) {
      var rm = b.data.ramen;
      if (!rm) return;
      if ((rm.t += dt) < c.ramen.tick) return;
      rm.t -= c.ramen.tick; rm.left -= 1;
      bt.heal(b, 1, true);
      if (Math.random() < 0.5) FX.particle({ x: b.x + _rnd(-10, 10), y: b.y - b.r * 0.6, vx: _rnd(-10, 10), vy: -90, life: 0.6, size: _rnd(8, 13), color: 'rgba(255,255,255,0.6)', shape: 'smoke' });
      if (rm.left <= 0) { b.data.ramen = null; FX.text(b.x, b.y - b.r - 50, '국물까지 완뚝!', '#ffcf6b', 40, 0.9); }
    });
    if (this.every('rehearsal', c.rehearsal, dt)) {
      var pool = this.players().filter(function (b) { return b.targetable && !(b.data.rehearsal > 0); });
      var n = pool.length, k = n <= 2 ? 1 : 1 + Math.floor(Math.random() * 3);
      k = Math.min(k, n - 1);
      if (k >= 1) {
        for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
        var gone = pool.slice(0, k);
        gone.forEach(function (b) {
          if (b.action) { if (b.action.end) b.action.end(); b.action = null; }
          FX.ring(b.x, b.y, b.r, b.r * 2.5, 0.5, '#ffffff', 12); FX.burst(b.x, b.y, '#ffffff', 20, 500, 8, 0.5, 'spark');
          b.data.rehearsal = c.away; b.hidden = true; b.vx = b.vy = 0;
        });
        FX.banner('리허설 소집! 🎬', { color: '#9cff57', sub: gone.map(function (b) { return b.name; }).join(' · '), size: 110, life: 1.4 });
        FX.sfx('vanish');
        bt.emit('rehearsal', { who: gone.map(function (b) { return b.def.id; }) });
      }
    }
    this.players().forEach(function (b) {
      if (!(b.data.rehearsal > 0)) return;
      b.hidden = true; b.data.rehearsal -= dt;
      if (b.data.rehearsal > 0) return;
      var p = self.spawnPoint('all'), a = _rnd(0, Math.PI * 2);
      b.x = p.x; b.y = p.y; b.hidden = false; b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
      if (!b.data.joo) { b.status.poison = Math.max(b.status.poison, c.poisonTime); b.status.poisonDps = c.poisonDps; }
      b.status.slow = c.slowTime; b.status.slowMul = c.slow;
      FX.ring(p.x, p.y, b.r, b.r * 2.5, 0.5, '#9cff57', 12);
      FX.text(p.x, p.y - b.r - 50, b.data.joo ? '리허설 끝! (누나 덕에 멀쩡)' : '리허설 끝… 지쳤다', '#c8ffb0', 40, 1.1);
      bt.emit('rehearsalBack', { who: b.def.id, poisoned: !b.data.joo });
      if (b.def.id === 'ibi' && !b.action && typeof ibiAwaken === 'function') b.action = ibiAwaken(bt, b);   // 이비는 규순이로 등장
    });
  }
  spawnJoo() { if (this.bt.over) return; this.addItem('joo', 'all'); }

  // ---------- Battle 훅 ----------
  taken(t, src, o) {
    var M = CONFIG.maps, m = 1;
    if (src && src !== t && this.splitK > 0.5 && this.split && this.floorOf(src) !== this.floorOf(t)) return 0;   // 분리된 층끼리는 공격 안 닿음
    if (t.data.ramen) ramenSpill(this.bt, t);   // 국물 마시다 맞으면 쏟음
    if (t.data.smoking > 0) m *= M.sannae.smokeTaken;
    if (t.data.soju > 0) m *= M.jbs.king.sojuTaken;
    if (o.kind === 'poison' && this.sub === 'jbs' && !_smoker(t)) m *= M.jbs.nonSmokerPoison;
    return m;
  }
  cancelSkill(b, key) {
    if (this.sub !== 'sannae' || key !== 'call' || b.def.name !== '조하람' || Math.random() >= CONFIG.maps.sannae.punk) return false;
    FX.text(b.x, b.y - b.r - 60, '펑크! 긴급소집 취소', '#ff6b6b', 50, 1.2); FX.sfx('glitch');
    this.bt.emit('punk', { who: b.def.id });
    return true;
  }
  walls(b) {
    var hit = false;
    if (this.sub === 'sannae') hit = _pushRect(b, this.notch());
    if (this.sub === 'jbs' && this.split) {
      var dy = this.divY(), h = 14;
      if (b.y < dy) { if (b.y + b.r > dy - h) { b.y = dy - h - b.r; b.vy = -Math.abs(b.vy); hit = true; } }
      else if (b.y - b.r < dy + h) { b.y = dy + h + b.r; b.vy = Math.abs(b.vy); hit = true; }
    }
    return hit;
  }

  // ---------- 그리기 ----------
  drawFloor(ctx) {
    var B = this.bt.baseArena, A = this.bt.arena;
    if (A.h < B.h - 1) { mapWall(ctx, B); }   // 줄어든 바깥은 벽
    MAP_FLOORS[this.sub](ctx, A, this.bt.time, this);
  }
  drawOver(ctx, time) {
    var A = this.bt.arena, k = A.w / 1000, c = CONFIG.maps.sannae;
    if (this.sub === 'sannae') {
      var n = this.notch();
      mapWall(ctx, n);
      ctx.save(); ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 6; ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x, n.y + n.h); ctx.lineTo(n.x + n.w, n.y + n.h); ctx.stroke(); ctx.restore();
      drawWindow(ctx, A.x + A.w, A.y + A.h, c.window * k, time);
    }
    if (this.sub === 'jbs') drawDivider(ctx, A, this.divY(), this.splitK, time);
    if (this.flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, this.flash) * 0.35; ctx.fillStyle = SUB_MAPS[this.sub].color; ctx.fillRect(A.x, A.y, A.w, A.h); ctx.restore(); }
  }
  drawTop(ctx, time) {
    var bt = this.bt, A = bt.arena, self = this, c = CONFIG.maps;
    // 담배 연기 지대
    this.smokes.forEach(function (s) {
      var al = s.fade != null ? Math.max(0, s.fade / 0.7) : 1;
      ctx.save(); ctx.globalAlpha = al;
      for (var i = 0; i < 4; i++) {
        var a = s.spin + time * 0.4 * (i % 2 ? 1 : -1) + i * 1.6, ox = Math.cos(a) * s.r * 0.25, oy = Math.sin(a) * s.r * 0.18, rr = s.r * (0.65 + i * 0.1);
        var g = ctx.createRadialGradient(s.x + ox, s.y + oy, 0, s.x + ox, s.y + oy, rr);
        g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(0.6, 'rgba(235,238,242,0.24)'); g.addColorStop(1, 'rgba(220,225,230,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x + ox, s.y + oy, rr, 0, Math.PI * 2); ctx.fill();
      }
      if (s.r > 40) { ctx.font = Math.round(s.r * 0.3) + 'px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = al * 0.8; ctx.fillText('🚬', s.x, s.y); }
      ctx.restore();
    });
    // 공 위 표시: 흡연 · 의자 · 소주 · 주현지 가호
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    this.players().forEach(function (b) {
      if (b.hidden) return;
      var x = b.x + b.jx, y = b.y - b.lift * 140 + b.jy, r = b.r;
      ctx.font = '46px "Segoe UI Emoji",sans-serif';
      if (b.data.smoking > 0) ctx.fillText('🚬', x + r * 0.75, y + r * 0.1);
      if (b.data.chair) { ctx.save(); ctx.translate(x - r * 0.8, y - r - 18); ctx.rotate(-0.3); drawChair(ctx, 0.75); ctx.restore(); }
      if (b.data.soju > 0) ctx.fillText('🍶', x - r * 0.85, y + r * 0.2);
      if (b.data.ramen) ctx.fillText('🍜', x - r * 0.85, y - r * 0.2);
      if (b.data.joo) { ctx.font = '36px "Segoe UI Emoji",sans-serif'; ctx.fillText('🎀', x + r * 0.72, y + r * 0.72); }
    });
    // 맵 이름 · 다음 이벤트 시간
    var parts = [(this.id === 'workroom' ? '작업실 · ' : '') + this.subName];
    if (this.id === 'workroom') parts.push('변경 ' + Math.ceil(this.swapIn));
    if (this.sub === 'jbs') { parts.push('환기 ' + this.left('vent', c.jbs.vent)); parts.push((this.split ? '개방 ' : '분리 ') + this.left('split', c.jbs.split)); }
    if (this.sub === 'mind') parts.push('리허설 ' + this.left('rehearsal', c.mind.rehearsal));
    var txt = '🗺 ' + parts.join('  ·  ');
    ctx.font = '700 26px "Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(txt).width + 32;
    ctx.fillStyle = 'rgba(8,6,18,0.7)'; Battle.roundRect(ctx, A.x + 14, A.y + 14, w, 44, 22); ctx.fill();
    ctx.strokeStyle = SUB_MAPS[this.sub].color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, A.x + 30, A.y + 37);
  }
}

// ---------- 바닥 그림 (A: 경기장, 크기에 비례해서 그림 → 맵 고르기 미리보기에도 씀) ----------
function mapWall(ctx, R) {
  ctx.save();
  ctx.fillStyle = '#0d0a0c'; ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.strokeStyle = 'rgba(120,90,110,0.18)'; ctx.lineWidth = 3;
  var bh = 34, bw = 80;
  for (var y = R.y, row = 0; y < R.y + R.h; y += bh, row++) {
    ctx.beginPath(); ctx.moveTo(R.x, y); ctx.lineTo(R.x + R.w, y); ctx.stroke();
    for (var x = R.x + (row % 2 ? bw / 2 : 0); x < R.x + R.w; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 10;   // 벽 사선 그림자
  ctx.beginPath(); for (var s = -R.h; s < R.w; s += 46) { ctx.moveTo(R.x + s, R.y + R.h); ctx.lineTo(R.x + s + R.h, R.y); } ctx.stroke();
  ctx.restore();
}
function _logo(ctx, A, text, color, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.font = '700 ' + Math.round(A.w * 0.16) + 'px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, A.x + A.w / 2, A.y + A.h / 2); ctx.restore();
}
var MAP_FLOORS = {
  // 산내: 따뜻한 나무 마루 + 스탠드 조명
  sannae: function (ctx, A, t) {
    var k = A.w / 1000, ph = 52 * k;
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    ctx.fillStyle = '#2a1d14'; ctx.fillRect(A.x, A.y, A.w, A.h);
    for (var y = 0, j = 0; y < A.h; y += ph, j++) {
      ctx.fillStyle = j % 2 ? '#2e2016' : '#271b12'; ctx.fillRect(A.x, A.y + y, A.w, ph);
      ctx.fillStyle = '#1a120c'; ctx.fillRect(A.x, A.y + y, A.w, 3 * k);
      for (var x = ((j * 173) % 420) * k; x < A.w; x += 420 * k) ctx.fillRect(A.x + x, A.y + y, 3 * k, ph);
      ctx.fillStyle = 'rgba(255,220,170,0.05)';   // 나뭇결
      for (var gx = ((j * 61) % 90) * k; gx < A.w; gx += 90 * k) ctx.fillRect(A.x + gx, A.y + y + ph * (0.3 + (j % 3) * 0.15), 50 * k, 2 * k);
    }
    var g = ctx.createRadialGradient(A.x + A.w * 0.35, A.y + A.h * 0.4, 0, A.x + A.w * 0.35, A.y + A.h * 0.4, A.w * 0.8);
    g.addColorStop(0, 'rgba(255,190,100,0.16)'); g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g; ctx.fillRect(A.x, A.y, A.w, A.h);
    _logo(ctx, A, '산내', '#ff9a3c', 0.07);
    ctx.restore();
  },
  // 정발산: 콘크리트 1층 + 아래쪽 1/3 다락방 2층 (세로 마룻널 · 서까래 그림자 · 상자 · 백열등 · 먼지)
  jbs: function (ctx, A, t, run) {
    var k = A.w / 1000, dy = A.y + A.h * 2 / 3, ah = A.y + A.h - dy, on = run ? 0.55 + 0.45 * run.splitK : 1;
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    ctx.fillStyle = '#6f7682'; ctx.fillRect(A.x, A.y, A.w, dy - A.y);   // 밝은 콘크리트
    var lg = ctx.createLinearGradient(A.x, A.y, A.x + A.w, dy); lg.addColorStop(0, 'rgba(255,255,255,0.14)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(A.x, A.y, A.w, dy - A.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = A.x; x < A.x + A.w; x += 100 * k) { ctx.moveTo(x, A.y); ctx.lineTo(x, dy); }
    for (var y = A.y; y < dy; y += 100 * k) { ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,44,52,0.12)';
    [[0.2, 0.2, 60], [0.7, 0.45, 90], [0.4, 0.55, 50]].forEach(function (q) { ctx.beginPath(); ctx.ellipse(A.x + A.w * q[0], A.y + A.h * q[1], q[2] * k, q[2] * 0.6 * k, 0.4, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.font = '700 ' + Math.round(110 * k) + 'px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('1F', A.x + A.w / 2, A.y + (dy - A.y) * 0.62);
    _logo(ctx, { x: A.x, y: A.y + (dy - A.y) * 0.3, w: A.w, h: 10 }, '정발산', '#e8e8ff', 0.06);
    // 다락방 (열려 있을 땐 조금 어둡게)
    ctx.save(); ctx.globalAlpha = on;
    ctx.fillStyle = '#9a7048'; ctx.fillRect(A.x, dy, A.w, ah);
    var pw = 46 * k;
    for (var px = 0, j = 0; px < A.w; px += pw, j++) {
      ctx.fillStyle = j % 2 ? '#a77b50' : '#956a42'; ctx.fillRect(A.x + px, dy, pw, ah);
      ctx.fillStyle = '#5e3f24'; ctx.fillRect(A.x + px, dy, 2 * k, ah);
      ctx.fillRect(A.x + px, dy + ((j * 97) % 200) * k, pw, 2 * k);
    }
    ctx.fillStyle = 'rgba(60,36,18,0.35)';   // 서까래 그림자 (기울어진 지붕)
    for (var bx = 0; bx < A.w + ah; bx += 210 * k) { ctx.beginPath(); ctx.moveTo(A.x + bx, dy); ctx.lineTo(A.x + bx + 34 * k, dy); ctx.lineTo(A.x + bx + 34 * k - ah * 0.5, A.y + A.h); ctx.lineTo(A.x + bx - ah * 0.5, A.y + A.h); ctx.fill(); }
    function box(x, y, w, h) {
      ctx.fillStyle = '#7a5a36'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#3a2814'; ctx.lineWidth = 3 * k; ctx.strokeRect(x, y, w, h);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
    }
    box(A.x + 18 * k, A.y + A.h - 92 * k, 74 * k, 74 * k); box(A.x + 62 * k, A.y + A.h - 140 * k, 52 * k, 52 * k);
    box(A.x + A.w - 100 * k, A.y + A.h - 86 * k, 82 * k, 68 * k);
    var lx = A.x + A.w * 0.5, ly = dy + ah * 0.5, g = ctx.createRadialGradient(lx, ly, 0, lx, ly, A.w * 0.45);
    g.addColorStop(0, 'rgba(255,200,120,' + (0.2 + Math.sin(t * 3) * 0.02) + ')'); g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g; ctx.fillRect(A.x, dy, A.w, ah);
    ctx.fillStyle = '#ffd890'; ctx.beginPath(); ctx.arc(lx, ly, 9 * k, 0, Math.PI * 2); ctx.fill();   // 전구
    ctx.fillStyle = 'rgba(255,230,190,0.35)';
    for (var i = 0; i < 14; i++) { var mx = A.x + ((i * 173 + t * 12 * (i % 3 + 1)) % A.w), my = dy + ((((i * 89 + Math.sin(t + i) * 20) % ah) + ah) % ah); ctx.fillRect(mx, my, 3 * k, 3 * k); }
    ctx.fillStyle = 'rgba(255,220,170,0.1)'; ctx.font = '700 ' + Math.round(90 * k) + 'px "Do Hyeon","Malgun Gothic",sans-serif';
    ctx.fillText('2F 다락방', A.x + A.w / 2, dy + ah * 0.5);
    ctx.restore();
    ctx.restore();
  },
  // 마인드: 어두운 무대 + 스포트라이트 + 촬영 화면 테두리
  mind: function (ctx, A, t) {
    var k = A.w / 1000, pw = 90 * k;
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    ctx.fillStyle = '#0b0b10'; ctx.fillRect(A.x, A.y, A.w, A.h);
    for (var x = 0, j = 0; x < A.w; x += pw, j++) { ctx.fillStyle = j % 2 ? '#101017' : '#0d0d13'; ctx.fillRect(A.x + x, A.y, pw, A.h); }
    [[0.3, 0.35], [0.7, 0.6], [0.5, 0.15 + 0.05 * Math.sin(t * 0.7)]].forEach(function (q, i) {
      var sx = A.x + A.w * (q[0] + Math.sin(t * 0.5 + i * 2) * 0.05), sy = A.y + A.h * q[1], sr = A.w * 0.32;
      var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, 'rgba(230,255,210,0.10)'); g.addColorStop(1, 'rgba(230,255,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = 'rgba(255,212,0,0.25)'; ctx.lineWidth = 8 * k;
    [[0.25, 0.7], [0.78, 0.25], [0.5, 0.5], [0.2, 0.2]].forEach(function (q) {
      var mx = A.x + A.w * q[0], my = A.y + A.h * q[1], d = 22 * k;
      ctx.beginPath(); ctx.moveTo(mx - d, my - d); ctx.lineTo(mx + d, my + d); ctx.moveTo(mx + d, my - d); ctx.lineTo(mx - d, my + d); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6 * k;
    var m = 34 * k, L = 70 * k;
    [[A.x + m, A.y + m + 50 * k, 1, 1], [A.x + A.w - m, A.y + m + 50 * k, -1, 1], [A.x + m, A.y + A.h - m, 1, -1], [A.x + A.w - m, A.y + A.h - m, -1, -1]].forEach(function (c) {
      ctx.beginPath(); ctx.moveTo(c[0], c[1] + L * c[3]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + L * c[2], c[1]); ctx.stroke();
    });
    if (Math.sin(t * 4) > -0.3) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(A.x + A.w - 130 * k, A.y + A.h - 70 * k, 11 * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '700 ' + Math.round(28 * k) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('REC', A.x + A.w - 110 * k, A.y + A.h - 70 * k);
    _logo(ctx, A, 'MIND', '#9cff57', 0.06);
    ctx.restore();
  },
};
// 산내 금연구역 창문: 오른쪽 아래 구석을 대각선으로 가로지르는 창 + 닿으면 흡연하는 영역
function drawWindow(ctx, cx, cy, R, time) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, Math.PI, Math.PI * 1.5); ctx.closePath();
  ctx.fillStyle = 'rgba(120,200,255,' + (0.1 + Math.sin(time * 2) * 0.03) + ')'; ctx.fill();
  ctx.setLineDash([14, 10]); ctx.strokeStyle = 'rgba(160,220,255,0.55)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, Math.PI * 1.5); ctx.stroke(); ctx.setLineDash([]);
  var L = R * 0.62;
  ctx.translate(cx - L * 0.32, cy - L * 0.32); ctx.rotate(-Math.PI / 4);
  var w = L * 1.15, h = L * 0.42;
  var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, '#2c4a78'); g.addColorStop(1, '#0e1a33');
  ctx.fillStyle = '#8a6a48'; ctx.fillRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16);
  ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8;
  [[-0.3, -0.2], [0.1, 0.15], [0.35, -0.25]].forEach(function (s) { ctx.beginPath(); ctx.arc(s[0] * w, s[1] * h, 2.5, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1; ctx.fillStyle = '#8a6a48'; ctx.fillRect(-4, -h / 2, 8, h);
  ctx.rotate(Math.PI / 4);
  ctx.font = Math.round(R * 0.26) + 'px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🚭', -L * 0.55, -L * 0.55);
  ctx.restore();
}
// 정발산 다락방 칸막이: 닫히면 가로 벽(양옆에서 닫혀 들어옴), 열리면 점선
function drawDivider(ctx, A, dy, k, time) {
  ctx.save();
  if (k < 0.99) {
    ctx.setLineDash([18, 14]); ctx.lineDashOffset = -time * 30; ctx.strokeStyle = 'rgba(255,220,170,0.35)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(A.x, dy); ctx.lineTo(A.x + A.w, dy); ctx.stroke(); ctx.setLineDash([]);
  }
  if (k > 0.01) {
    var half = A.w / 2 * k;
    [[A.x, A.x + half], [A.x + A.w - half, A.x + A.w]].forEach(function (s) {
      ctx.fillStyle = '#4a3624'; ctx.fillRect(s[0], dy - 14, s[1] - s[0], 28);
      ctx.save(); ctx.beginPath(); ctx.rect(s[0], dy - 14, s[1] - s[0], 28); ctx.clip();
      ctx.fillStyle = '#ffb000';
      for (var x = s[0] - 40; x < s[1]; x += 40) { ctx.beginPath(); ctx.moveTo(x, dy + 14); ctx.lineTo(x + 20, dy - 14); ctx.lineTo(x + 32, dy - 14); ctx.lineTo(x + 12, dy + 14); ctx.fill(); }
      ctx.restore();
    });
    ctx.shadowColor = '#ff8c42'; ctx.shadowBlur = 18; ctx.strokeStyle = 'rgba(255,140,66,' + k + ')'; ctx.lineWidth = 3;
    ctx.strokeRect(A.x, dy - 14, half, 28); ctx.strokeRect(A.x + A.w - half, dy - 14, half, 28);
  }
  ctx.restore();
}
function drawChair(ctx, s) {
  ctx.save(); ctx.scale(s, s);
  ctx.fillStyle = '#6b4a2e'; ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 3;
  ctx.fillRect(-22, -34, 44, 10); ctx.strokeRect(-22, -34, 44, 10);   // 등받이
  ctx.fillRect(-18, -24, 6, 22); ctx.fillRect(12, -24, 6, 22);
  ctx.fillStyle = '#8a5f3a'; ctx.fillRect(-26, -4, 52, 10); ctx.strokeRect(-26, -4, 52, 10);   // 앉는 판
  ctx.fillStyle = '#6b4a2e'; ctx.fillRect(-22, 6, 6, 26); ctx.fillRect(16, 6, 6, 26);
  ctx.restore();
}

// ---------- 맵 아이템 ----------
var ITEM_COLOR = { blanket: '#7fa8ff', pizza: '#ffb000', chair: '#c08a5a', king: '#ffd400', soju: '#4fd18b', joo: '#ff8fc8', ramen: '#ff5a3c' };
var ITEM_R = { blanket: 34, pizza: 32, chair: 34, king: 40, soju: 30, joo: 46, ramen: 32 };
var ITEM_DRAW = {
  blanket: function (ctx) {   // 개켜 놓은 체크무늬 담요
    ctx.rotate(-0.12);
    ctx.fillStyle = '#4a6cc8'; Battle.roundRect(ctx, -36, -24, 72, 48, 10); ctx.fill();
    ctx.save(); ctx.beginPath(); Battle.roundRect(ctx, -36, -24, 72, 48, 10); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (var x = -36; x < 36; x += 18) ctx.fillRect(x, -24, 8, 48);
    for (var y = -24; y < 24; y += 16) ctx.fillRect(-36, y, 72, 7);
    ctx.restore();
    ctx.strokeStyle = '#1e2d66'; ctx.lineWidth = 4; Battle.roundRect(ctx, -36, -24, 72, 48, 10); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '20px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💤', 24, -26);
  },
  pizza: function (ctx, t) {   // 전설의 피자 조각
    ctx.rotate(Math.sin(t * 2) * 0.1);
    ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 26;
    ctx.fillStyle = '#e8a33a'; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(-30, -24); ctx.quadraticCurveTo(0, -36, 30, -24); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffd96b'; ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(-24, -18); ctx.quadraticCurveTo(0, -27, 24, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d23a2a'; [[-8, -10], [9, -12], [0, 6]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(-30, -24); ctx.quadraticCurveTo(0, -36, 30, -24); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 11px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('LEGEND', 0, -36 - Math.sin(t * 3) * 2);
  },
  chair: function (ctx) { ctx.shadowColor = '#c08a5a'; ctx.shadowBlur = 18; drawChair(ctx, 1); },
  king: function (ctx, t) {   // 핫식스 더 킹: 노광석 핫식스보다 크고 왕관
    ctx.scale(1.45, 1.45); ctx.rotate(-0.12);
    ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 26;
    ctx.fillStyle = '#5a1f9a'; Battle.roundRect(ctx, -16, -28, 32, 56, 7); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffd400'; ctx.fillRect(-14, -31, 28, 5); ctx.fillRect(-14, 26, 28, 4);
    ctx.fillStyle = '#ff2b6a'; ctx.fillRect(-16, -12, 32, 14);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 10px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('KING', 0, -5);
    ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.moveTo(-12, -34); ctx.lineTo(-12, -46); ctx.lineTo(-6, -40); ctx.lineTo(0, -48); ctx.lineTo(6, -40); ctx.lineTo(12, -46); ctx.lineTo(12, -34); ctx.closePath(); ctx.fill();
  },
  soju: function (ctx) {   // 초록 소주병
    ctx.rotate(0.15); ctx.shadowColor = '#4fd18b'; ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(60,190,120,0.9)'; Battle.roundRect(ctx, -13, -14, 26, 44, 6); ctx.fill();
    ctx.fillRect(-6, -32, 12, 20); ctx.shadowBlur = 0;
    ctx.fillStyle = '#2f8a58'; ctx.fillRect(-7, -36, 14, 6);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-13, 0, 26, 14);
    ctx.fillStyle = '#2f8a58'; ctx.font = '700 10px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('소주', 0, 7);
  },
  ramen: function (ctx, t) {   // 편의점 컵라면 + 김
    ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-26, -14); ctx.lineTo(26, -14); ctx.lineTo(19, 26); ctx.lineTo(-19, 26); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#e8321e'; ctx.beginPath(); ctx.moveTo(-24, -4); ctx.lineTo(24, -4); ctx.lineTo(22, 8); ctx.lineTo(-22, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 11px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('라면', 0, 2);
    ctx.fillStyle = '#c98a3a'; ctx.beginPath(); ctx.ellipse(0, -14, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2; ctx.beginPath(); for (var i = -18; i <= 18; i += 6) { ctx.moveTo(i, -16); ctx.quadraticCurveTo(i + 3, -11, i + 6, -16); } ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3;
    for (var s = -1; s <= 1; s++) { var o = Math.sin(t * 3 + s) * 4; ctx.beginPath(); ctx.moveTo(s * 10, -24); ctx.quadraticCurveTo(s * 10 + 6 + o, -32, s * 10 + o, -42); ctx.stroke(); }
  },
  joo: function (ctx, t, r) {   // 주현지 누나: 캐릭터와 같은 공
    var g = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.7);
    g.addColorStop(0, 'rgba(255,143,200,0.55)'); g.addColorStop(1, 'rgba(255,143,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2); ctx.fill();
    Assets.drawBall(ctx, MAP_BALLS.joohyunji, 'base', 0, 0, r, 0, '#ff8fc8');
    ctx.lineWidth = 7; ctx.strokeStyle = '#ff8fc8'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    FX.outlined(ctx, '주현지 누나', 0, r + 22, 22, '#ffd6ec');
  },
};
var ITEM_EAT = {
  blanket: function (bt, b) {
    b.status.sleep = CONFIG.maps.sannae.blanket.sleepMax;
    if (b.action && !b.action.uninterruptible) { if (b.action.end) b.action.end(); b.action = null; }
    FX.text(b.x, b.y - b.r - 60, '포근… 잠들었다 💤', '#bfe3ff', 46, 1.2); FX.sfx('vanish');
  },
  pizza: function (bt, b) {
    bt.heal(b, CONFIG.maps.sannae.pizza.heal);
    FX.text(b.x, b.y - b.r - 90, '피자 오브 레전드! 🍕', '#ffd400', 44, 1.0); FX.burst(b.x, b.y, '#ffb000', 18, 500, 9, 0.5);
  },
  chair: function (bt, b) { b.data.chair = { t: 0 }; FX.text(b.x, b.y - b.r - 60, '의자 들었다!', '#ffcf9a', 44, 0.9); FX.sfx('arm'); },
  king: function (bt, b) {
    bt.heal(b, CONFIG.maps.jbs.king.heal);
    FX.text(b.x, b.y - b.r - 90, '핫식스 더 킹! 👑', '#ffd400', 44, 1.0); FX.sfx('powerup'); FX.burst(b.x, b.y, '#b07cff', 20, 600, 9, 0.5);
  },
  soju: function (bt, b) {
    var c = CONFIG.maps.jbs.king;
    if (b.def.name === '유재후') {
      b.status.sleep = c.sleep;
      if (b.action && !b.action.uninterruptible) { if (b.action.end) b.action.end(); b.action = null; }
      FX.text(b.x, b.y - b.r - 60, '소주 한 잔에 뻗음… 💤', '#9be8b8', 46, 1.3);
    } else {
      b.data.soju = c.sojuTime;
      FX.text(b.x, b.y - b.r - 60, '크~ 소주! 받는 피해↓ 🍶', '#9be8b8', 44, 1.1);
    }
    FX.sfx('drool');
  },
  ramen: function (bt, b) {
    var c = CONFIG.maps.mind.ramen;
    bt.heal(b, c.heal);
    FX.text(b.x, b.y - b.r - 90, '편의점 라면! 🍜', '#ffcf6b', 44, 1.0); FX.sfx('powerup');
    b.data.ramen = { left: c.soup, t: 0 };
    if (Math.random() < c.spill) ramenSpill(bt, b);   // 5%: 받자마자 쏟음
  },
  joo: function (bt, b) {
    b.data.joo = true;
    FX.text(b.x, b.y - b.r - 60, '주현지 누나의 가호! 🎀', '#ff8fc8', 46, 1.2); FX.sfx('happy');
    FX.ring(b.x, b.y, b.r, b.r * 3, 0.6, '#ff8fc8', 12);
    bt.after(CONFIG.maps.mind.jooRespawn, function () { if (bt.map) bt.map.spawnJoo(); });
  },
};
// 라면 국물 쏟음: 남은 지속 회복 없음
function ramenSpill(bt, b) {
  b.data.ramen = null;
  FX.text(b.x, b.y - b.r - 50, '앗 국물 쏟았다!', '#ff9a6b', 44, 1.0); FX.sfx('drool');
  for (var i = 0; i < 14; i++) FX.particle({ x: b.x, y: b.y, vx: _rnd(-260, 260), vy: _rnd(-300, -80), g: 900, life: 0.6, size: _rnd(6, 11), color: Math.random() < 0.5 ? '#c96a2a' : '#e8a050', shape: 'square' });
  bt.emit('ramenSpill', { who: b.def.id });
}
class MapItem {
  constructor(bt, kind, p) { this.bt = bt; this.kind = kind; this.x = p.x; this.y = p.y; this.t = 0; this.z = -1; this.r = ITEM_R[kind]; }
  update(dt) {
    var self = this, bt = this.bt;
    this.t += dt;
    if (this.t < 0.4) return;
    var e = bt.balls.find(function (b) {
      return b.alive && !b.hidden && !b.air && !b.isBoss && !(self.kind === 'chair' && b.data.chair) && Math.hypot(b.x - self.x, b.y - self.y) < b.r + self.r;
    });
    if (!e) return;
    this.dead = true;
    ITEM_EAT[this.kind](bt, e, this);
    bt.emit('mapItem', { kind: this.kind, who: e.def.id });
  }
  draw(ctx) {
    var s = Math.min(1, this.t / 0.3), bob = Math.sin(this.t * 4) * 4;
    ctx.save(); ctx.translate(this.x, this.y + bob); ctx.scale(s, s);
    ITEM_DRAW[this.kind](ctx, this.t, this.r);
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 90 }; }
}
// 던진 의자: 첫 번째로 맞은 적에게 피해, 벽(닫힌 칸막이 포함)에 부딪히면 부서짐
class ChairShot {
  constructor(bt, s, a, dmg) { this.bt = bt; this.s = s; this.x = s.x; this.y = s.y; this.vx = Math.cos(a) * CONFIG.maps.jbs.chair.speed; this.vy = Math.sin(a) * CONFIG.maps.jbs.chair.speed; this.dmg = dmg; this.t = 0; this.rot = 0; this.z = 1; this.floor = bt.map ? bt.map.floorOf(s) : 1; }
  update(dt) {
    var bt = this.bt, self = this, A = CONFIG.arena, m = bt.map;
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += 14 * dt;
    var out = this.x < A.x || this.x > A.x + A.w || this.y < A.y || this.y > A.y + A.h || this.t > 1.5;
    if (m && m.split && m.floorOf(this) !== this.floor) out = true;
    var o = bt.enemies(this.s).find(function (e) { return e.targetable && !e.air && Math.hypot(e.x - self.x, e.y - self.y) < e.r + 28; });
    if (o) {
      bt.damage(o, this.dmg, this.s, { color: '#ffb066', kind: 'chair' });
      o.vx += this.vx * 0.35; o.vy += this.vy * 0.35;
      FX.shake(10); FX.sfx('thump');
      bt.emit('chairHit', { who: o.def.id, dmg: this.dmg });
    }
    if (o || out) {
      this.dead = true;
      FX.burst(this.x, this.y, '#8a5f3a', 16, 600, 10, 0.6, 'square'); FX.burst(this.x, this.y, '#c08a5a', 8, 400, 6, 0.4, 'square');
    }
  }
  draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); drawChair(ctx, 0.9); ctx.restore(); }
}
// 언데드 마인드 부원: 느리게 가까운 사람을 쫓고, 촬영팀 2명이 주변을 돎 (촬영팀에 닿으면 피해)
class Undead {
  constructor(bt, p) { this.bt = bt; this.x = p.x; this.y = p.y; this.t = 0; this.r = 56; this.ang = _rnd(0, 6.28); this.z = 0; this.cd = {}; this.wob = _rnd(0, 6); }
  cams() {
    var c = CONFIG.maps.mind, self = this;
    return [0, 1].map(function (i) { var a = self.ang + i * Math.PI; return { x: self.x + Math.cos(a) * c.orbit, y: self.y + Math.sin(a) * c.orbit, i: i }; });
  }
  update(dt) {
    var c = CONFIG.maps.mind, bt = this.bt, self = this, A = CONFIG.arena;
    this.t += dt;
    if (this.t > c.undeadLife) { this.dead = true; FX.burst(this.x, this.y, '#6b8f5a', 30, 600, 12, 0.7, 'smoke'); return; }
    var best = null, bd = Infinity;
    bt.balls.forEach(function (b) { if (b.targetable) { var d = Math.hypot(b.x - self.x, b.y - self.y); if (d < bd) { bd = d; best = b; } } });
    if (best && this.t > 0.6) {
      var a = Math.atan2(best.y - this.y, best.x - this.x) + Math.sin(this.t * 2 + this.wob) * 0.5;
      this.x += Math.cos(a) * c.undeadSpeed * dt; this.y += Math.sin(a) * c.undeadSpeed * dt;
    }
    this.x = _mapClamp(this.x, A.x + this.r, A.x + A.w - this.r); this.y = _mapClamp(this.y, A.y + this.r, A.y + A.h - this.r);
    this.ang += c.orbitSpeed * dt;
    if (this.t < 0.6) return;
    this.cams().forEach(function (q) {
      bt.balls.forEach(function (b) {
        if (!b.targetable || b.air || Math.hypot(b.x - q.x, b.y - q.y) > b.r + 26) return;
        var key = q.i + '>' + b.id;
        if (self.cd[key] > bt.time) return;
        self.cd[key] = bt.time + 0.8;
        bt.damage(b, c.touch, null, { color: '#b6ff8a', kind: 'undead' });
        var a = Math.atan2(b.y - q.y, b.x - q.x); b.vx += Math.cos(a) * 350; b.vy += Math.sin(a) * 350;
        FX.burst(q.x, q.y, '#ffffff', 8, 400, 6, 0.3, 'spark');
        bt.emit('undeadHit', { who: b.def.id });
      });
    });
  }
  draw(ctx, bt) {
    var c = CONFIG.maps.mind, rise = Math.min(1, this.t / 0.6), fade = Math.min(1, (c.undeadLife - this.t) / 0.6), x = this.x, y = this.y + (1 - rise) * 30, r = this.r * rise;
    ctx.save(); ctx.globalAlpha = Math.max(0, fade);
    ctx.setLineDash([10, 12]); ctx.strokeStyle = 'rgba(156,255,87,0.18)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(this.x, this.y, c.orbit, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // 몸: 마인드 로고 공에 초록 언데드 빛 + 출입증
    ctx.shadowColor = '#9cff57'; ctx.shadowBlur = 28; ctx.fillStyle = '#3d5a32';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    Assets.drawBall(ctx, MAP_BALLS.mindMember, 'base', x, y, r, Math.sin(this.t * 3 + this.wob) * 0.15, '#5d7a52');
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#9fd88a'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
    ctx.strokeStyle = '#9cff57'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; Battle.roundRect(ctx, x - 30, y + r * 0.62, 60, 22, 5); ctx.fill();
    ctx.fillStyle = '#2b6a1a'; ctx.font = '700 15px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('마인드', x, y + r * 0.62 + 11);
    // 촬영팀
    if (rise >= 1) this.cams().forEach(function (q) {
      ctx.fillStyle = '#16161c'; ctx.strokeStyle = '#9cff57'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(q.x, q.y, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '28px "Segoe UI Emoji",sans-serif'; ctx.fillText('🎥', q.x, q.y + 1);
      if (Math.sin(bt.time * 6) > 0) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(q.x + 18, q.y - 18, 5, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 130 }; }
}

// 맵 고르기 화면 미리보기: 바닥 그림을 작은 칸에
function drawMapPreview(ctx, id, x, y, w, h, time) {
  var A = { x: x, y: y, w: w, h: h };
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (id === 'workroom') {   // 작업실: 반은 산내, 반은 정발산
    MAP_FLOORS.jbs(ctx, A, time);
    ctx.save(); ctx.beginPath(); ctx.moveTo(x + w * 0.55, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w * 0.25, y + h); ctx.clip();
    MAP_FLOORS.sannae(ctx, A, time); ctx.restore();
  } else if (MAP_FLOORS[id]) MAP_FLOORS[id](ctx, A, time);
  else { ctx.fillStyle = '#0c0a1d'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
