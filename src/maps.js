// 맵: 바닥 그림 · 맵 벽 · 주기 이벤트 · 맵 아이템. Battle이 this.map(MapRun)으로 부름 (보스전은 맵 없음)
// 수치는 CONFIG.maps
var MAP_IDS = ['workroom', 'mind', 'hall'];
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
      '아이템: 주현지 누나 — 먹으면 리허설 독에 안 걸림, 20초 뒤 다른 곳에 다시 생김 (김선율의 모습은 낯가려서 못 받음)',
      '아이템: 편의점 라면 — 바로 10 회복 + 국물로 1씩 총 20 회복 (5% 확률로 쏟거나, 마시다 맞으면 쏟음)',
    ],
  },
  hall: {
    id: 'hall', no: '03', name: '마을회관', color: '#ffd27a',
    lines: [
      '시간이 지날수록 옷 · 음료수 병 · 라면 용기 같은 쓰레기가 쌓임, 밟으면 잠시 이동속도 감소 (싸방 멤버는 면역)',
      '왼쪽 위 컴퓨터: 한규성 · 유재후 · 진형권 · 차승민 · 이윤빈은 오버워치, 유재운 · 김선율 · 조하람 · 조우연은 로블록스 (담배타임처럼 행동불능 + 받는 피해 2배, 유재후는 2배 오래)',
      '컴퓨터: 개발자 문남휘는 코딩해서 자기 스탯 +10% · 최휘는 주식 (끝나면 한 번 더 등락, 70% 하락, 하락하면 10% 컴퓨터 박살) · 서리는 30% 박살',
      '이장님 문남휘: 컴퓨터에 닿으면 꺼버림 (다른 사람이 닿으면 켜지지만 그 사람은 그때 게임 못 함) · 웰우스 개방 회복량 +30% · 대청소 중엔 쓰레기가 점점 사라짐',
      '아이템: 육개장 컵라면 — 편의점 라면과 같음, 국물을 쏟으면 문남휘가 개빡쳐서 공격력 증가',
    ],
  },
};
var SUB_MAPS = {
  sannae: { name: '산내', color: '#ff9a3c' },
  jbs:    { name: '정발산', color: '#e8e8ff' },
  mind:   { name: '마인드', color: '#9cff57' },
  hall:   { name: '마을회관', color: '#ffd27a' },
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
    this.clk = {}; this.smokes = []; this.trash = []; this.pc = { user: null, broken: 0 }; this.split = false; this.splitK = 0; this.splitT = 0; this.vent = 0; this.flash = 0;
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
  spawnPoint(region, loose) {   // loose: 공 근처여도 됨 (쓰레기)
    var A = this.target(), bt = this.bt, m = 70, y0 = A.y + m, y1 = A.y + A.h - m, p, self = this;
    if (region === 'f1') y1 = A.y + A.h * 2 / 3 - 60;
    if (region === 'f2') y0 = A.y + A.h * 2 / 3 + 60;
    var c = CONFIG.maps.sannae, k = A.w / 1000;
    function bad(p) {
      if (self.sub === 'sannae') {
        if (p.x > A.x + A.w * (1 - c.notchW) - 60 && p.y < A.y + A.w * c.notchH + 60) return true;
        if (Math.hypot(p.x - A.x - A.w, p.y - A.y - A.h) < c.window * k + 90) return true;
      }
      if (self.sub === 'hall') { var T = self.table(); if (p.x > T.x - 70 && p.x < T.x + T.w + 70 && p.y > T.y - 70 && p.y < T.y + T.h + 100) return true; }
      return !loose && bt.balls.some(function (o) { return o.alive && Math.hypot(o.x - p.x, o.y - p.y) < o.r + 90; });
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
      if (b.data.ramen) ramenTick(bt, b, dt);
      if (!b.hidden) bt.walls(b);   // 줄어든 경기장 · 벽 밖으로 밀려난 공 정리
    });
    if (this.sub === 'sannae') this.updSannae(dt);
    else if (this.sub === 'jbs') this.updJbs(dt);
    else if (this.sub === 'mind') this.updMind(dt);
    else if (this.sub === 'hall') this.updHall(dt);
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

  // ---------- 마을회관 ----------
  table() { var A = this.bt.arena; return { x: A.x + A.w * 0.12, y: A.y + A.h * 0.1, w: A.w * 0.3, h: A.w * 0.13 }; }   // 왼쪽 위(구석 아님) 테이블 + 컴퓨터
  updHall(dt) {
    var c = CONFIG.maps.hall, bt = this.bt, self = this, T = this.table(), pc = this.pc;
    // 쓰레기: 시간이 지날수록 쌓임 (싸방 멤버는 면역)
    if (this.every('trash', c.trashEvery, dt) && this.trash.length < c.trashMax) {
      var p = this.spawnPoint('all', true);
      this.trash.push({ x: p.x, y: p.y, kind: TRASH_KINDS[Math.floor(Math.random() * TRASH_KINDS.length)], rot: _rnd(0, 6.28), t: 0 });
    }
    this.trash.forEach(function (tr) { tr.t += dt; });
    // 이장님 웰우스 대청소(페이즈 2) 중이면 쓰레기가 하나씩 사라짐
    var cleaning = this.players().some(function (b) { return b.def.id === 'chief' && b.phase >= 2 && !b.hidden; });
    if (cleaning && this.trash.length && this.every('clean', c.cleanEvery, dt)) {
      var tr = this.trash.splice(Math.floor(Math.random() * this.trash.length), 1)[0];
      FX.burst(tr.x, tr.y, '#d8c38a', 12, 300, 10, 0.5, 'smoke'); FX.text(tr.x, tr.y - 30, '✨', '#ffffff', 34, 0.6);
      bt.emit('trashClean');
    }
    var ssabang = CONFIG.synergy.ssabang.members;
    this.players().forEach(function (b) {
      if (b.hidden || b.air || ssabang.indexOf(b.def.name) >= 0) return;
      if (!self.trash.some(function (tr) { return Math.hypot(b.x - tr.x, b.y - tr.y) < b.r + c.trashR; })) return;
      b.status.slow = Math.max(b.status.slow, c.trashSlowTime); b.status.slowMul = c.trashSlow;
      if (!(b.data.trashMsg > bt.time)) { b.data.trashMsg = bt.time + 2; FX.text(b.x, b.y - b.r - 40, '쓰레기 밟음…', '#e8d8b8', 34, 0.7); bt.emit('trashSlow', { who: b.def.id }); }
    });
    if (this.every('yuk', c.yuk.every, dt) && this.items('yuk').length < c.yuk.max) this.addItem('yuk', 'all');
    // 컴퓨터
    if (pc.broken > 0) { pc.broken -= dt; if (pc.broken <= 0) FX.text(T.x + T.w / 2, T.y - 20, '컴퓨터 수리 완료', '#9cff57', 38, 1.0); }
    this.players().forEach(function (b) {
      var u = b.data.pc;
      if (u) {
        if (b.hidden) { b.data.pc = null; b.status.hold = 0; pc.user = null; return; }
        u.t -= dt; b.vx *= 0.85; b.vy *= 0.85;
        if (u.t <= 0) self.pcDone(b, u.mode);
        return;
      }
      if (pc.broken > 0 || b.hidden || b.air || b.disabled || (b.data.pcCd || 0) > bt.time || !_touchRect(b, T, 10)) return;
      if (b.def.id === 'chief') {   // 이장님: 컴퓨터를 끔 (하던 사람도 쫓겨남)
        if (pc.off) return;
        b.data.pcCd = bt.time + c.chiefCd; pc.off = true;
        if (pc.user) { pc.user.data.pc = null; pc.user.status.hold = 0; FX.text(pc.user.x, pc.user.y - pc.user.r - 60, '아 왜 꺼요!!', '#ff6b6b', 42, 1.0); pc.user = null; }
        FX.text(T.x + T.w / 2, T.y - 20, '이장님이 컴퓨터를 껐다', '#d8c38a', 40, 1.2); FX.sfx('vanish');
        bt.emit('pcOff', { who: b.def.id });
        return;
      }
      if (pc.user) return;
      if (pc.off) {   // 꺼져 있으면 켜기만 하고 이번엔 게임 안 함
        pc.off = false; b.data.pcCd = bt.time + c.pcCd;
        FX.text(T.x + T.w / 2, T.y - 20, b.name + ' 컴퓨터 켬', '#9fd8ff', 38, 1.0); FX.sfx('ding');
        bt.emit('pcOn', { who: b.def.id });
        return;
      }
      var mode = pcMode(b);
      if (!mode) return;
      b.data.pcCd = bt.time + c.pcCd;
      if (mode === 'smash') {   // 서리: 30% 확률로 박살
        if (Math.random() < c.seoriSmash) self.smashPc('서리가 컴퓨터를 박살냈다!');
        else FX.text(b.x, b.y - b.r - 40, '킁킁?', '#ffffff', 36, 0.7);
        return;
      }
      var dur = c.pcTime * (b.def.name === '유재후' ? c.yooMul : 1);
      b.data.pc = { t: dur, mode: mode }; b.status.hold = dur; pc.user = b;
      if (b.action && !b.action.uninterruptible) { if (b.action.end) b.action.end(); b.action = null; }
      FX.text(b.x, b.y - b.r - 60, PC_MODES[mode].start, PC_MODES[mode].color, 44, 1.2); FX.sfx('type');
      bt.emit('pc', { who: b.def.id, mode: mode });
    });
    if (pc.user && !pc.user.alive) pc.user = null;
  }
  pcDone(b, mode) {
    var c = CONFIG.maps.hall, bt = this.bt, A = bt.arena;
    b.data.pc = null; this.pc.user = null; b.data.pcCd = bt.time + c.pcCd;
    if (mode === 'code') {   // 개발자: 자기 스탯 +10%
      var k = c.codeBuff, add = b.maxHp * (k - 1);
      b.dmgMult *= k; b.speed *= k; b.maxHp += add; b.hp += add;
      FX.text(b.x, b.y - b.r - 60, '코딩 완료! 스탯 +' + Math.round((k - 1) * 100) + '%', '#9cff57', 44, 1.2); FX.sfx('patch');
    } else if (mode === 'stock') {   // 최휘: 끝나면 주식 한 번 더 (70% 하락, 하락하면 10% 컴퓨터 박살)
      var up = Math.random() >= c.stockDown;
      if (typeof hauStock === 'function' && b.data.chart) hauStock(bt, b, up);
      if (!up && Math.random() < c.stockSmash) this.smashPc('떡락에 빡쳐서 컴퓨터 박살!');
    } else FX.text(b.x, b.y - b.r - 50, mode === 'ow' ? 'GG… 한 판만 더' : '로블록스 종료', '#dddddd', 38, 0.9);
    var a = Math.atan2(A.y + A.h / 2 - b.y, A.x + A.w / 2 - b.x); b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
    bt.emit('pcDone', { who: b.def.id, mode: mode });
  }
  smashPc(msg) {
    var c = CONFIG.maps.hall, T = this.table(), bt = this.bt, u = this.pc.user;
    if (u) { u.data.pc = null; u.status.hold = 0; this.pc.user = null; }
    this.pc.broken = c.brokenTime;
    FX.text(T.x + T.w / 2, T.y - 20, msg, '#ff6b6b', 44, 1.4); FX.sfx('shatter'); FX.shake(14);
    FX.burst(T.x + T.w * 0.55, T.y + T.h * 0.4, '#9fd8ff', 24, 700, 8, 0.6, 'spark');
    bt.emit('pcSmash');
  }

  // ---------- Battle 훅 ----------
  taken(t, src, o) {
    var M = CONFIG.maps, m = 1;
    if (src && src !== t && this.splitK > 0.5 && this.split && this.floorOf(src) !== this.floorOf(t)) return 0;   // 분리된 층끼리는 공격 안 닿음
    if (t.data.ramen) ramenSpill(this.bt, t);   // 국물 마시다 맞으면 쏟음
    if (t.data.smoking > 0 || t.data.pc) m *= M.sannae.smokeTaken;   // 담배 · 컴퓨터 하는 중 받는 피해 2배
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
    if (this.sub === 'hall') hit = _pushRect(b, this.table());
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
    if (this.sub === 'hall') { this.trash.forEach(function (tr) { drawTrash(ctx, tr); }); drawTable(ctx, this.table(), this.pc, time); }
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
      if (b.data.pc) ctx.fillText(PC_MODES[b.data.pc.mode].icon, x + r * 0.75, y - r * 0.55);
      if (b.data.joo) { ctx.font = '36px "Segoe UI Emoji",sans-serif'; ctx.fillText('🎀', x + r * 0.72, y + r * 0.72); }
    });
    // 맵 이름 · 다음 이벤트 시간
    var parts = [(this.id === 'workroom' ? '작업실 · ' : '') + this.subName];
    if (this.id === 'workroom') parts.push('변경 ' + Math.ceil(this.swapIn));
    if (this.sub === 'jbs') { parts.push('환기 ' + this.left('vent', c.jbs.vent)); parts.push((this.split ? '개방 ' : '분리 ') + this.left('split', c.jbs.split)); }
    if (this.sub === 'mind') parts.push('리허설 ' + this.left('rehearsal', c.mind.rehearsal));
    if (this.sub === 'hall') { parts.push('쓰레기 ' + this.trash.length); if (this.pc.broken > 0) parts.push('컴퓨터 고장'); else if (this.pc.off) parts.push('컴퓨터 꺼짐'); }
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
  // 마을회관: 노란 장판 + 가장자리 방석 + 형광등 빛
  hall: function (ctx, A, t) {
    var k = A.w / 1000, s = 160 * k;
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    ctx.fillStyle = '#c99550'; ctx.fillRect(A.x, A.y, A.w, A.h);
    var g = ctx.createLinearGradient(A.x, A.y, A.x + A.w, A.y + A.h);
    g.addColorStop(0, 'rgba(255,240,200,0.22)'); g.addColorStop(0.5, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(120,70,20,0.18)');
    ctx.fillStyle = g; ctx.fillRect(A.x, A.y, A.w, A.h);
    ctx.strokeStyle = 'rgba(120,72,24,0.35)'; ctx.lineWidth = 2;   // 장판 이음새
    ctx.beginPath();
    for (var x = A.x + s; x < A.x + A.w; x += s) { ctx.moveTo(x, A.y); ctx.lineTo(x, A.y + A.h); }
    for (var y = A.y + s * 1.5; y < A.y + A.h; y += s * 1.5) { ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(140,90,40,0.18)';   // 장판 무늬
    for (var py = 0; py < A.h; py += 40 * k) for (var px = ((py / (40 * k)) % 2) * 20 * k; px < A.w; px += 40 * k) ctx.fillRect(A.x + px, A.y + py, 4 * k, 4 * k);
    var cs = 70 * k;   // 아래쪽 벽을 따라 놓인 방석
    for (var i = 0; i < 6; i++) {
      var bx = A.x + A.w * 0.5 + (i - 2.5) * cs * 1.35 - cs / 2, by = A.y + A.h - cs - 18 * k;
      ctx.fillStyle = i % 2 ? '#b8322e' : '#2f5fb8'; Battle.roundRect(ctx, bx, by, cs, cs, 12 * k); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,170,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([6 * k, 5 * k]); Battle.roundRect(ctx, bx + 8 * k, by + 8 * k, cs - 16 * k, cs - 16 * k, 8 * k); ctx.stroke(); ctx.setLineDash([]);
    }
    [0.3, 0.7].forEach(function (q) {   // 형광등 빛
      var lg = ctx.createRadialGradient(A.x + A.w * 0.5, A.y + A.h * q, 0, A.x + A.w * 0.5, A.y + A.h * q, A.w * 0.55);
      lg.addColorStop(0, 'rgba(255,255,240,' + (0.14 + Math.sin(t * 50) * 0.005) + ')'); lg.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = lg; ctx.fillRect(A.x, A.y, A.w, A.h);
    });
    _logo(ctx, A, '마을회관', '#6a3c12', 0.12);
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
var ITEM_COLOR = { blanket: '#7fa8ff', pizza: '#ffb000', chair: '#c08a5a', king: '#ffd400', soju: '#4fd18b', joo: '#ff8fc8', ramen: '#ff5a3c', yuk: '#d2321e' };
var ITEM_R = { blanket: 34, pizza: 32, chair: 34, king: 40, soju: 30, joo: 46, ramen: 32, yuk: 32 };
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
  yuk: function (ctx, t) { cupRamen(ctx, t, '육개장', '#8a1a10', '#ffe0a0'); },
  ramen: function (ctx, t) { cupRamen(ctx, t, '라면', '#e8321e', '#ffffff'); },
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
  ramen: function (bt, b) { eatRamen(bt, b, 'ramen', '편의점 라면! 🍜'); },
  yuk: function (bt, b) { eatRamen(bt, b, 'yuk', '육개장 컵라면! 🍜'); },
  joo: function (bt, b) {
    b.data.joo = true;
    FX.text(b.x, b.y - b.r - 60, '주현지 누나의 가호! 🎀', '#ff8fc8', 46, 1.2); FX.sfx('happy');
    FX.ring(b.x, b.y, b.r, b.r * 3, 0.6, '#ff8fc8', 12);
    bt.after(CONFIG.maps.mind.jooRespawn, function () { if (bt.map) bt.map.spawnJoo(); });
  },
};
// 라면 국물 쏟음: 남은 지속 회복 없음
function _ramenCfg(kind) { return kind === 'yuk' ? CONFIG.maps.hall.yuk : CONFIG.maps.mind.ramen; }
function eatRamen(bt, b, kind, msg) {
  var c = _ramenCfg(kind);
  bt.heal(b, c.heal);
  FX.text(b.x, b.y - b.r - 90, msg, '#ffcf6b', 44, 1.0); FX.sfx('powerup');
  b.data.ramen = { left: c.soup, t: 0, kind: kind };
  if (Math.random() < c.spill) ramenSpill(bt, b);   // 5%: 받자마자 쏟음
}
// 국물 마시는 동안 tick마다 1씩 회복
function ramenTick(bt, b, dt) {
  var rm = b.data.ramen, c = _ramenCfg(rm.kind);
  if ((rm.t += dt) < c.tick) return;
  rm.t -= c.tick; rm.left -= 1;
  bt.heal(b, 1, true);
  if (Math.random() < 0.5) FX.particle({ x: b.x + _rnd(-10, 10), y: b.y - b.r * 0.6, vx: _rnd(-10, 10), vy: -90, life: 0.6, size: _rnd(8, 13), color: 'rgba(255,255,255,0.6)', shape: 'smoke' });
  if (rm.left <= 0) { b.data.ramen = null; FX.text(b.x, b.y - b.r - 50, '국물까지 완뚝!', '#ffcf6b', 40, 0.9); }
}
function cupRamen(ctx, t, label, band, text) {
  ctx.shadowColor = band; ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-26, -14); ctx.lineTo(26, -14); ctx.lineTo(19, 26); ctx.lineTo(-19, 26); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(-24, -4); ctx.lineTo(24, -4); ctx.lineTo(22, 10); ctx.lineTo(-22, 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = text; ctx.font = '700 ' + (label.length > 2 ? 10 : 11) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 3);
  ctx.fillStyle = label.length > 2 ? '#b8401e' : '#c98a3a'; ctx.beginPath(); ctx.ellipse(0, -14, 26, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2; ctx.beginPath(); for (var i = -18; i <= 18; i += 6) { ctx.moveTo(i, -16); ctx.quadraticCurveTo(i + 3, -11, i + 6, -16); } ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3;
  for (var s = -1; s <= 1; s++) { var o = Math.sin(t * 3 + s) * 4; ctx.beginPath(); ctx.moveTo(s * 10, -24); ctx.quadraticCurveTo(s * 10 + 6 + o, -32, s * 10 + o, -42); ctx.stroke(); }
}
function ramenSpill(bt, b) {
  if (b.data.ramen && b.data.ramen.kind === 'yuk') {   // 육개장 국물 쏟으면 문남휘 개빡침
    var h = CONFIG.maps.hall;
    bt.balls.forEach(function (m) {
      if (!m.alive || m.def.name !== '문남휘') return;
      m.status.atk = h.angerTime; m.status.atkMul = h.angerMul;
      FX.text(m.x, m.y - m.r - 90, '개빡침!! 💢', '#ff3b3b', 54, 1.2); FX.burst(m.x, m.y, '#ff3b3b', 18, 600, 9, 0.5);
      bt.emit('anger', { who: m.def.id });
    });
  }
  b.data.ramen = null;
  FX.text(b.x, b.y - b.r - 50, '앗 국물 쏟았다!', '#ff9a6b', 44, 1.0); FX.sfx('drool');
  for (var i = 0; i < 14; i++) FX.particle({ x: b.x, y: b.y, vx: _rnd(-260, 260), vy: _rnd(-300, -80), g: 900, life: 0.6, size: _rnd(6, 11), color: Math.random() < 0.5 ? '#c96a2a' : '#e8a050', shape: 'square' });
  bt.emit('ramenSpill', { who: b.def.id });
}
// ---------- 마을회관 ----------
var TRASH_KINDS = ['clothes', 'bottle', 'cup', 'bag', 'can'];
var PC_MODES = {
  ow:    { start: '오버워치 한 판만… 🎮', color: '#ff9c1a', icon: '🎮' },
  rb:    { start: '로블록스 접속! 🧱', color: '#ff4a4a', icon: '🧱' },
  code:  { start: '코딩 중… 💻', color: '#9cff57', icon: '💻' },
  stock: { start: '주식 차트 확인 📈', color: '#ff3b3b', icon: '📈' },
};
// 컴퓨터에 닿았을 때 할 일 (없으면 그냥 지나감)
function pcMode(b) {
  var n = b.def.name, c = CONFIG.maps.hall;
  if (b.def.id === 'dev') return 'code';
  if (b.def.id === 'hau') return 'stock';
  if (n === '서리') return 'smash';
  if (c.ow.indexOf(n) >= 0) return 'ow';
  if (c.roblox.indexOf(n) >= 0) return 'rb';
  return null;
}
function _touchRect(b, R, pad) {
  var cx = _mapClamp(b.x, R.x, R.x + R.w), cy = _mapClamp(b.y, R.y, R.y + R.h);
  return Math.hypot(b.x - cx, b.y - cy) < b.r + pad;
}
function drawTrash(ctx, tr) {
  var s = Math.min(1, tr.t / 0.3);
  ctx.save(); ctx.translate(tr.x, tr.y); ctx.rotate(tr.rot); ctx.scale(s * 1.45, s * 1.45);   // 다른 아이템만 한 크기
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(3, 6, 24, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(20,10,0,0.6)';
  if (tr.kind === 'clothes') {   // 벗어 던진 티셔츠
    ctx.fillStyle = '#5a7fd0'; ctx.beginPath();
    ctx.moveTo(-10, -16); ctx.lineTo(-24, -8); ctx.lineTo(-18, 2); ctx.lineTo(-12, -2); ctx.lineTo(-12, 16); ctx.lineTo(12, 18); ctx.lineTo(13, -2); ctx.lineTo(20, 4); ctx.lineTo(25, -7); ctx.lineTo(10, -17); ctx.quadraticCurveTo(0, -10, -10, -16);
    ctx.fill(); ctx.stroke();
  } else if (tr.kind === 'bottle') {   // 누운 음료수 페트병
    ctx.fillStyle = 'rgba(160,230,255,0.8)'; Battle.roundRect(ctx, -20, -8, 32, 16, 6); ctx.fill(); ctx.stroke();
    ctx.fillRect(12, -4, 8, 8); ctx.fillStyle = '#ff4a4a'; ctx.fillRect(19, -5, 5, 10); ctx.fillStyle = '#ffd400'; ctx.fillRect(-12, -8, 12, 16);
  } else if (tr.kind === 'cup') {   // 다 먹은 라면 용기
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-16, -12); ctx.lineTo(16, -12); ctx.lineTo(11, 14); ctx.lineTo(-11, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8321e'; ctx.fillRect(-14, -4, 28, 7); ctx.fillStyle = '#a8662a'; ctx.beginPath(); ctx.ellipse(0, -12, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
  } else if (tr.kind === 'bag') {   // 검은 비닐봉지
    ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.moveTo(-18, -4); ctx.quadraticCurveTo(-20, 18, 0, 17); ctx.quadraticCurveTo(20, 18, 18, -4); ctx.lineTo(10, -16); ctx.lineTo(4, -6); ctx.lineTo(-4, -6); ctx.lineTo(-10, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-2, 10); ctx.stroke();
  } else {   // 찌그러진 캔
    ctx.fillStyle = '#c0c4cc'; Battle.roundRect(ctx, -15, -9, 30, 18, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2f9bff'; ctx.fillRect(-8, -9, 12, 18); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(3, 0); ctx.lineTo(-2, 9); ctx.stroke();
  }
  ctx.restore();
}
// 나무 테이블 + 모니터 · 키보드 · 마우스 + 의자. user가 쓰는 중이면 화면에 그 게임
function drawTable(ctx, T, pc, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(T.x + 8, T.y + 10, T.w, T.h);
  ctx.fillStyle = '#8a5a34'; Battle.roundRect(ctx, T.x, T.y, T.w, T.h, 8); ctx.fill();
  ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,170,0.12)'; ctx.lineWidth = 2;
  for (var i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(T.x + 6, T.y + T.h * i / 4); ctx.lineTo(T.x + T.w - 6, T.y + T.h * i / 4); ctx.stroke(); }
  var mx = T.x + T.w * 0.3, my = T.y + T.h * 0.12, mw = T.w * 0.42, mh = T.h * 0.5;
  ctx.fillStyle = '#16161c'; Battle.roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 6); ctx.fill();
  var u = pc.user, mode = u && u.data.pc ? u.data.pc.mode : null;
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
  if (pc.off && !(pc.broken > 0)) {
    ctx.fillStyle = '#050507'; ctx.fillRect(mx, my, mw, mh); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(mx + mw * 0.1, my + mh * 0.1, mw * 0.25, mh * 0.12);
  } else if (pc.broken > 0) {
    ctx.fillStyle = '#050507'; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(220,240,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
    var cx = mx + mw * 0.45, cy = my + mh * 0.5;
    [[-0.5, -0.4], [0.5, -0.45], [0.4, 0.5], [-0.45, 0.45], [0.05, -0.5]].forEach(function (d) { ctx.moveTo(cx, cy); ctx.lineTo(cx + d[0] * mw, cy + d[1] * mh); });
    ctx.stroke();
  } else if (mode === 'ow') {
    var g = ctx.createLinearGradient(mx, my, mx + mw, my + mh); g.addColorStop(0, '#ff9c1a'); g.addColorStop(1, '#3a6aff');
    ctx.fillStyle = g; ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx + mw / 2, my + mh / 2, 8, 0, Math.PI * 2); ctx.moveTo(mx + mw / 2 - 14, my + mh / 2); ctx.lineTo(mx + mw / 2 + 14, my + mh / 2); ctx.stroke();
  } else if (mode === 'rb') {
    ctx.fillStyle = '#7ec8ff'; ctx.fillRect(mx, my, mw, mh); ctx.fillStyle = '#4caf50'; ctx.fillRect(mx, my + mh * 0.65, mw, mh * 0.35);
    for (var j = 0; j < 4; j++) { ctx.fillStyle = ['#ff4a4a', '#ffd400', '#2f9bff', '#ffffff'][j]; ctx.fillRect(mx + mw * (0.12 + j * 0.2), my + mh * (0.45 - (j % 2) * 0.12), mw * 0.12, mh * 0.2); }
  } else if (mode === 'code') {
    ctx.fillStyle = '#0d1a10'; ctx.fillRect(mx, my, mw, mh); ctx.fillStyle = '#9cff57';
    for (var l = 0; l < 6; l++) ctx.fillRect(mx + 6 + (l % 3) * 8, my + 6 + l * mh / 7, mw * (0.3 + ((l * 37 + Math.floor(time * 4)) % 5) * 0.1), 3);
  } else if (mode === 'stock') {
    ctx.fillStyle = '#10131c'; ctx.fillRect(mx, my, mw, mh); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath();
    for (var q = 0; q <= 8; q++) { var px = mx + mw * q / 8, py = my + mh * (0.5 + Math.sin(q * 1.7 + time * 2) * 0.3); if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.stroke();
  } else {
    var g2 = ctx.createLinearGradient(mx, my, mx, my + mh); g2.addColorStop(0, '#2a5aa8'); g2.addColorStop(1, '#14305e');
    ctx.fillStyle = g2; ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '700 ' + Math.round(mh * 0.3) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PC', mx + mw / 2 + Math.sin(time) * mw * 0.2, my + mh / 2 + Math.cos(time * 1.3) * mh * 0.2);
  }
  ctx.restore();
  ctx.fillStyle = '#d8d8e0'; Battle.roundRect(ctx, mx + mw * 0.05, T.y + T.h * 0.72, mw * 0.9, T.h * 0.16, 3); ctx.fill();   // 키보드
  ctx.fillStyle = '#d8d8e0'; ctx.beginPath(); ctx.ellipse(mx + mw + 26, T.y + T.h * 0.8, 8, 11, 0, 0, Math.PI * 2); ctx.fill();   // 마우스
  ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.arc(mx + mw / 2, T.y + T.h + 34, 24, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#555560'; ctx.lineWidth = 4; ctx.stroke();   // 의자
  if (pc.broken > 0) {
    ctx.font = '34px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (Math.sin(time * 12) > 0) ctx.fillText('💥', mx + mw * 0.8, my);
    FX.outlined(ctx, '고장 ' + Math.ceil(pc.broken), T.x + T.w / 2, T.y - 22, 26, '#ff8a8a');
  }
  ctx.restore();
}
class MapItem {
  constructor(bt, kind, p) { this.bt = bt; this.kind = kind; this.x = p.x; this.y = p.y; this.t = 0; this.z = -1; this.r = ITEM_R[kind]; }
  update(dt) {
    var self = this, bt = this.bt;
    this.t += dt;
    if (this.t < 0.4) return;
    var e = bt.balls.find(function (b) {
      return b.alive && !b.hidden && !b.air && !b.isBoss && !(self.kind === 'chair' && b.data.chair) && !(self.kind === 'joo' && b.def.id === 'sy') && Math.hypot(b.x - self.x, b.y - self.y) < b.r + self.r;
    });
    if (!e) {
      if (this.kind === 'joo') bt.balls.forEach(function (b) {   // 김선율의 모습: 낯가려서 가호를 못 받음
        if (b.def.id !== 'sy' || !b.alive || b.hidden || b.data.shyMsg > bt.time || Math.hypot(b.x - self.x, b.y - self.y) > b.r + self.r) return;
        b.data.shyMsg = bt.time + 2; FX.text(b.x, b.y - b.r - 50, '낯가림… 🙈', '#ffd6ec', 40, 0.9);
      });
      return;
    }
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
  } else if (MAP_FLOORS[id]) {
    MAP_FLOORS[id](ctx, A, time);
    if (id === 'hall') drawTable(ctx, { x: x + w * 0.12, y: y + h * 0.1, w: w * 0.4, h: w * 0.2 }, { user: null, broken: 0 }, time);
  }
  else { ctx.fillStyle = '#0c0a1d'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
}
