// 캐릭터 & 스킬 정의. 새 캐릭터는 CHARACTERS에 객체 하나 + CONFIG.chars에 수치 하나 추가하면 된다.
//
// 캐릭터 객체 형식:
//   id, name, sub, images{키: {src, fx, fy, s}}  (fx,fy = 얼굴 중심 비율, s = 잘라낼 정사각형 크기 / 짧은 변)
//   portrait(ball) -> 현재 쓸 이미지 키
//   skills: [1스킬, 2스킬]  각 스킬 {key, name, desc, cd(cfg), start(battle, ball) -> action|null, passive?, holds?}
//   action: {update(dt) -> 끝났으면 true, moves: 이동 유지 여부, end()}
//   선택 훅: init, update, onContact, onPhase2, color, glow, drawExtra, drawOverlay, hudTag, gauge,
//            dealMult, absorb, onHurt, onLethal(true면 안 죽음), speedMul, noAutoPhase2
//   이름(name)이 같으면 이격: 선택창에서 한 카드로 묶이고, 시너지도 이름 기준으로 같은 사람 취급

// ---------- 이미지 ----------
var Assets = {
  cache: {},
  exts: ['.png', '.jpg', '.jpeg', '.webp'],
  load: function () {
    if (typeof Image === 'undefined') return;
    var self = this, all = [CHARACTERS].concat(typeof BOSSES !== 'undefined' ? [BOSSES] : [], typeof MAP_BALLS !== 'undefined' ? [MAP_BALLS] : []);   // 보스 · 맵 사람 사진도
    all.forEach(function (reg) {
      Object.keys(reg).forEach(function (id) {
        var def = reg[id];
        Object.keys(def.images || {}).forEach(function (key) { self.loadOne(id + ':' + key, def.images[key]); });
      });
    });
  },
  // 지정 파일이 없으면 같은 이름의 다른 확장자를 차례로 시도, 전부 없으면 null → 색+글자 원으로 대체
  loadOne: function (cacheKey, spec) {
    if (spec.draw) {   // 파일 대신 코드로 그리는 이미지 (리플리 실루엣)
      var cv = document.createElement('canvas'); cv.width = cv.height = 320;
      spec.draw(cv.getContext('2d'), 320); this.cache[cacheKey] = cv; return;
    }
    var self = this, base = spec.src.replace(/\.[a-z0-9]+$/i, '');
    var list = [spec.src].concat(this.exts.map(function (e) { return base + e; }).filter(function (p) { return p !== spec.src; }));
    var i = 0;
    function next() {
      if (i >= list.length) { self.cache[cacheKey] = null; return; }
      var img = new Image();
      img.onload = function () { self.cache[cacheKey] = self.crop(img, spec); };
      img.onerror = function () { i++; next(); };
      img.src = list[i];
    }
    next();
  },
  crop: function (img, spec) {
    var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h) * (spec.s || 1);
    var sx = Math.max(0, Math.min(w - s, w * (spec.fx == null ? 0.5 : spec.fx) - s / 2));
    var sy = Math.max(0, Math.min(h - s, h * (spec.fy == null ? 0.5 : spec.fy) - s / 2));
    var c = document.createElement('canvas'); c.width = c.height = 320;
    c.getContext('2d').drawImage(img, sx, sy, s, s, 0, 0, 320, 320);
    return c;
  },
  get: function (def, key) {
    var id = def.imgId || def.id;   // 리플리가 변신 중이면 변신한 캐릭터의 사진
    if (key && key.indexOf('multi:') === 0) return this.multi(id, key) || this.cache[id + ':base'] || null;
    return this.cache[id + ':' + key] || this.cache[id + ':base'] || null;
  },
  // 'multi:red,blue,...' → 이미지들을 부채꼴 조각으로 이어 붙인 한 장 (만들어 두고 재사용)
  multi: function (id, key) {
    var ck = id + ':' + key;
    if (this.cache[ck]) return this.cache[ck];
    var self = this, imgs = key.slice(6).split(',').map(function (k) { return self.cache[id + ':' + k]; });
    if (imgs.some(function (im) { return !im; })) return null;   // 아직 로딩 중
    var c = document.createElement('canvas'); c.width = c.height = 320;
    var x = c.getContext('2d'), n = imgs.length, step = Math.PI * 2 / n;
    imgs.forEach(function (im, i) {
      var a0 = -Math.PI / 2 + i * step;
      x.save(); x.beginPath(); x.moveTo(160, 160); x.arc(160, 160, 240, a0, a0 + step); x.closePath(); x.clip();
      x.drawImage(im, 0, 0); x.restore();
    });
    x.strokeStyle = '#ffffff'; x.lineWidth = 7;
    for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + i * step; x.beginPath(); x.moveTo(160, 160); x.lineTo(160 + Math.cos(a) * 240, 160 + Math.sin(a) * 240); x.stroke(); }
    this.cache[ck] = c;
    return c;
  },
  drawBall: function (ctx, def, key, x, y, r, rot, color) {
    var img = this.get(def, key);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    if (img) {
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
    } else {
      var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, '#1a1030');
      ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a1030'; ctx.lineWidth = r * 0.08;
      ctx.font = '700 ' + Math.round(r * 1.05) + 'px "Do Hyeon","Malgun Gothic",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(def.name[0], 0, r * 0.06); ctx.fillText(def.name[0], 0, r * 0.06);
    }
    ctx.restore();
  },
};

// ---------- 공용 헬퍼 ----------
function _rnd(a, b) { return a + Math.random() * (b - a); }
// 디마디영디 시너지가 이 공의 팀에 켜져 있는지
function _dmdyd(bt, b) { return !!(bt && bt.hasSynergy && bt.hasSynergy('dmdyd', b.team)); }
// 지금 이 캐릭터의 모습인지 (리플리가 변신했을 때 포함)
function _is(b, id) { return (b.def.imgId || b.def.id) === id; }
function _dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function _pickWeighted(weights) {
  var keys = Object.keys(weights), total = 0, i;
  for (i = 0; i < keys.length; i++) total += weights[keys[i]];
  var r = Math.random() * total;
  for (i = 0; i < keys.length; i++) { r -= weights[keys[i]]; if (r < 0) return keys[i]; }
  return keys[keys.length - 1];
}
function _restoreSpeed(b, dirx, diry) {
  var d = Math.hypot(dirx, diry);
  if (d < 1e-3) { var a = Math.random() * Math.PI * 2; dirx = Math.cos(a); diry = Math.sin(a); d = 1; }
  b.vx = dirx / d * b.speed; b.vy = diry / d * b.speed;
}
function _ghost(b) {
  var def = b.def, key = def.portrait(b), r = b.r * (1 + b.lift * 0.8), rot = b.rot, col = b.color();
  FX.particle({ x: b.x, y: b.y - b.lift * 140, vx: 0, vy: 0, life: 0.25, size: 0, color: col, shape: 'ghost',
    draw: function (ctx, x, y) { Assets.drawBall(ctx, def, key, x, y, r, rot, col); } });
}

// 퍼져나가는 원형 파동 (같은 파동에 같은 적은 한 번만)
class Wave {
  constructor(bt, owner, x, y, maxR, speed, damage, color, tag, opts) {
    this.bt = bt; this.owner = owner; this.x = x; this.y = y; this.maxR = maxR; this.speed = speed;
    this.damage = damage; this.color = color; this.tag = tag; this.r = 0; this.hit = new Set(); this.z = -1;
    this.opts = opts || {};
  }
  update(dt) {
    var self = this;
    this.r += this.speed * dt;
    this.bt.enemies(this.owner).forEach(function (o) {
      if (!o.targetable || o.air || self.hit.has(o)) return;
      var d = Math.hypot(o.x - self.x, o.y - self.y);
      if (d <= Math.min(self.r, self.maxR) + o.r * 0.5) {
        self.hit.add(o);
        self.bt.damage(o, self.damage, self.owner, { color: self.color });
        var k = (self.opts.knock != null ? self.opts.knock : 300) / Math.max(1, d);
        o.vx += (o.x - self.x) * k; o.vy += (o.y - self.y) * k;
        self.bt.emit(self.tag, { who: o.def.id });
        if (self.opts.onHit) self.opts.onHit(o);
      }
    });
    if (this.r >= this.maxR) this.dead = true;
  }
  draw(ctx) {
    var t = Math.min(1, this.r / this.maxR);
    ctx.save();
    ctx.globalAlpha = 1 - t * 0.85;
    ctx.strokeStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 25;
    ctx.lineWidth = 26 * (1 - t) + 4;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.15 * (1 - t); ctx.fillStyle = this.color; ctx.fill();
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: this.r + 60 }; }
}

// 이비의 돌
class Stone {
  constructor(bt, owner, tx, ty, c, from) {
    this.bt = bt; this.owner = owner; this.c = c; this.x = from ? from.x : owner.x; this.y = from ? from.y : owner.y;
    var dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    this.vx = dx / d * c.speed; this.vy = dy / d * c.speed; this.r = 22; this.rot = 0;
    this.pts = []; for (var i = 0; i < 7; i++) this.pts.push(_rnd(0.7, 1.15));
  }
  update(dt) {
    var A = CONFIG.arena, self = this;
    this.x += this.vx * dt; this.y += this.vy * dt; this.rot += dt * 16;
    if (Math.random() < 0.6) FX.particle({ x: this.x, y: this.y, vx: _rnd(-30, 30), vy: _rnd(-30, 30), life: 0.25, size: 7, color: '#8a8aa0' });
    var hit = this.bt.enemies(this.owner).find(function (o) { return o.targetable && !o.air && _dist(o, self) < o.r + self.r; });
    if (hit) {
      this.bt.damage(hit, this.c.damage, this.owner, { color: '#d0d0e0' });
      FX.burst(this.x, this.y, '#b0b0c0', 14, 500, 9, 0.45, 'shard');
      FX.ring(this.x, this.y, 10, 90, 0.3, '#ffffff', 8);
      FX.shake(this.c.shake);
      this.bt.emit('stoneHit', { who: hit.def.id });
      this.dead = true; return;
    }
    if (this.x < A.x || this.x > A.x + A.w || this.y < A.y || this.y > A.y + A.h) {
      FX.burst(Math.max(A.x, Math.min(A.x + A.w, this.x)), Math.max(A.y, Math.min(A.y + A.h, this.y)), '#8a8aa0', 8, 300, 7, 0.3, 'shard');
      this.dead = true;
    }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.beginPath();
    for (var i = 0; i < this.pts.length; i++) {
      var a = i / this.pts.length * Math.PI * 2, rr = this.r * this.pts[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fillStyle = '#9a9aac'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#4a4a5a'; ctx.stroke();
    ctx.fillStyle = '#d8d8e6'; ctx.beginPath(); ctx.arc(-this.r * 0.3, -this.r * 0.3, this.r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// 이비의 새
class Bird {
  constructor(bt, owner, target, point, c, i) {
    this.bt = bt; this.owner = owner; this.target = target; this.point = point; this.c = c;
    this.x = owner.x; this.y = owner.y; this.t = 0; this.flap = _rnd(0, 6);
    this.ang = (i / c.count) * Math.PI * 2 + _rnd(-0.3, 0.3);
  }
  update(dt) {
    var A = CONFIG.arena, self = this, c = this.c;
    this.t += dt;
    if (this.t >= c.life) {
      FX.burst(this.x, this.y, '#ffffff', 10, 300, 10, 0.5, 'feather'); this.dead = true; return;
    }
    var tx, ty;
    if (this.point) {
      // 실명 상태로 소환된 새는 엉뚱한 곳을 헤맨다
      if (Math.hypot(this.point.x - this.x, this.point.y - this.y) < 40) this.point = this.bt.randomPoint();
      tx = this.point.x; ty = this.point.y;
    } else {
      if (!this.target || !this.target.targetable) this.target = this.bt.nearest(this.owner);
      if (this.target) { tx = this.target.x; ty = this.target.y; } else { tx = this.x + Math.cos(this.ang); ty = this.y + Math.sin(this.ang); }
    }
    var want = Math.atan2(ty - this.y, tx - this.x), diff = Math.atan2(Math.sin(want - this.ang), Math.cos(want - this.ang));
    var turn = c.turn * dt * Math.min(1, this.t * 2 + 0.2);
    this.ang += Math.max(-turn, Math.min(turn, diff));
    this.x += Math.cos(this.ang) * c.speed * dt; this.y += Math.sin(this.ang) * c.speed * dt;
    if (this.x < A.x + 20 || this.x > A.x + A.w - 20) { this.ang = Math.PI - this.ang; this.x = Math.max(A.x + 20, Math.min(A.x + A.w - 20, this.x)); }
    if (this.y < A.y + 20 || this.y > A.y + A.h - 20) { this.ang = -this.ang; this.y = Math.max(A.y + 20, Math.min(A.y + A.h - 20, this.y)); }
    var hit = this.bt.enemies(this.owner).find(function (o) { return o.targetable && !o.air && _dist(o, self) < o.r + 22; });
    if (hit) {
      this.bt.damage(hit, c.damage, this.owner, { color: '#e6c8ff' });
      FX.burst(this.x, this.y, '#ffffff', 16, 450, 12, 0.6, 'feather');
      FX.shake(c.shake); FX.sfx('bird');
      this.bt.emit('birdHit', { who: hit.def.id });
      this.dead = true;
    }
  }
  draw(ctx) {
    var w = Math.sin(this.t * 28 + this.flap);
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.ang);
    ctx.shadowColor = '#d9a6ff'; ctx.shadowBlur = 18;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-14, -20 * w - 6, -28, -30 * w); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-14, 20 * w + 6, -28, 30 * w); ctx.stroke();
    ctx.fillStyle = '#f4e8ff'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.moveTo(20, -5); ctx.lineTo(34, 0); ctx.lineTo(20, 5); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(10, -4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 110 }; }
}

// 삼식이 염색 테이블
var DYES = {
  red:    { label: '빨강', el: '불',   color: '#ff3b30', icon: '🔥' },
  yellow: { label: '노랑', el: '전기', color: '#ffe11a', icon: '⚡' },
  blue:   { label: '파랑', el: '얼음', color: '#3ec8ff', icon: '❄️' },
  shaved: { label: '삭발', el: '땅',   color: '#e0a96d', icon: '⛰️' },
  black:  { label: '검정', el: '어둠', color: '#26203a', icon: '🌑', glow: '#b07cff' },
  white:  { label: '하양', el: '빛',   color: '#ffffff', icon: '✨' },
};
function rollDye() { return _pickWeighted(CONFIG.dyeChances); }

// ---------- 이비 규순이 각성 하위 스킬 ----------
var GYUSUN_SKILLS = {
  birds: function (bt, b, combo) {   // combo(풀코스): 새를 날리고 잠깐 뒤 바로 다음 패턴으로
    var c = b.cfg.birds, birds = [], wait = 0;
    FX.banner('새가 너무 좋아', { color: '#e6c8ff', size: 100, life: 1.2 });
    FX.sfx('bird');
    var foes = bt.enemies(b).filter(function (o) { return o.targetable; })
      .sort(function (p, q) { return _dist(p, b) - _dist(q, b); });
    for (var i = 0; i < c.count; i++) {
      var t = foes.length ? foes[i % foes.length] : null;   // 서로 다른 적 우선
      var miss = bt.blindRoll(b);
      birds.push(bt.add(new Bird(bt, b, t, miss ? bt.randomPoint() : null, c, i)));
      FX.burst(b.x, b.y, '#ffffff', 8, 400, 10, 0.5, 'feather');
    }
    return { moves: true, update: function (dt) { wait += dt; return combo ? wait >= 0.4 : birds.every(function (x) { return x.dead; }); } };
  },

  lucha: function (bt, b) {
    var c = b.cfg.lucha, t0 = bt.nearest(b);
    FX.banner('루차루차', { color: '#ff4fd8', size: 110, life: 1.2 });
    FX.sfx('roll');
    var aim = t0 ? bt.aim(b, t0.x, t0.y) : bt.randomPoint();
    var track = t0 && !aim.miss ? t0 : null, tx = aim.x, ty = aim.y;
    var sx = b.x, sy = b.y, t = 0, stage = 'rise';
    b.air = true; b.data.lucha = true; b.vx = b.vy = 0;
    return {
      moves: false, uninterruptible: true,
      update: function (dt) {
        t += dt;
        if (track && track.alive && stage !== 'fall' && stage !== 'recover') { tx = track.x; ty = track.y; }
        var p = bt.clampPoint({ x: tx, y: ty }, b.r); tx = p.x; ty = p.y;
        if (stage === 'rise') {
          var k = Math.min(1, t / c.riseTime);
          b.lift = 1 - (1 - k) * (1 - k);
          b.x = sx + (tx - sx) * k * 0.7; b.y = sy + (ty - sy) * k * 0.7;
          if (Math.random() < 0.5) _ghost(b);
          if (k >= 1) { stage = 'hang'; t = 0; }
        } else if (stage === 'hang') {
          b.x += (tx - b.x) * Math.min(1, dt * 12); b.y += (ty - b.y) * Math.min(1, dt * 12);
          if (t >= c.hangTime) { stage = 'fall'; t = 0; FX.sfx('throw'); }
        } else if (stage === 'fall') {
          var f = Math.min(1, t / c.fallTime);
          b.lift = 1 - f * f;
          b.x += (tx - b.x) * Math.min(1, dt * 25); b.y += (ty - b.y) * Math.min(1, dt * 25);
          _ghost(b);
          if (f >= 1) {
            stage = 'recover'; t = 0; b.lift = 0; b.air = false; b.x = tx; b.y = ty;
            FX.ring(tx, ty, 30, c.radius, 0.45, '#ff4fd8', 26);
            FX.ring(tx, ty, 10, c.radius * 1.2, 0.6, '#ffffff', 12);
            FX.burst(tx, ty, '#c9a27a', 40, 900, 14, 0.7, 'smoke');
            FX.burst(tx, ty, '#ff4fd8', 30, 1200, 8, 0.5, 'spark');
            FX.shake(c.shake); FX.sfx('slam'); FX.flash('#ff4fd8', 0.2, 0.2);
            bt.emit('luchaLand');
            bt.enemies(b).forEach(function (o) {
              if (!o.targetable || o.air) return;
              var d = _dist(o, b);
              if (d <= c.radius + o.r * 0.3) {
                bt.damage(o, c.damage, b, { color: '#ff9cf0' });
                var nx = (o.x - b.x) / (d || 1), ny = (o.y - b.y) / (d || 1);
                o.vx = nx * c.knockback; o.vy = ny * c.knockback;
                bt.emit('luchaHit', { who: o.def.id });
              }
            });
          }
        } else if (stage === 'recover') {
          return t >= 0.3;
        }
        return false;
      },
      end: function () { b.air = false; b.lift = 0; b.data.lucha = false; _restoreSpeed(b, Math.random() - 0.5, Math.random() - 0.5); },
    };
  },

  // 워터밤: 물병을 들고 사방에 물을 뿌림. 이장님은 물에 안 닿아도 멘헤라
  waterbomb: function (bt, b) {
    var c = b.cfg.waterbomb, t = 0, next = 0, n = 0, keep = { vx: b.vx, vy: b.vy }, ang = _rnd(0, Math.PI * 2);
    FX.banner('워터밤!', { color: '#4fc3ff', size: 115, life: 1.2 }); FX.sfx('drool');
    b.data.water = true; b.vx = b.vy = 0;
    bt.enemies(b).forEach(function (o) {
      if (o.def.id !== 'chief' || !o.targetable) return;
      o.status.slow = Math.max(o.status.slow, c.menhera.time); o.status.slowMul = c.menhera.slow;
      o.status.poison = Math.max(o.status.poison, c.menhera.time); o.status.poisonDps = c.menhera.dps;
      FX.text(o.x, o.y - o.r - 60, '멘헤라 왔다… 💔', '#ff7ad9', 46, 1.3);
      bt.emit('menhera', { who: o.def.id });
    });
    return {
      moves: false, spinning: true,
      update: function (dt) {
        t += dt; b.vx = b.vy = 0;
        b.rot += c.spin * dt; ang += c.spin * dt;   // 제자리에서 돌며 도는 방향으로 물줄기
        while (t >= next && n < c.shots) {
          n++; next += c.time / c.shots;
          var a = ang + _rnd(-0.25, 0.25), d = _rnd(c.minDist, c.maxDist);
          bt.add(new WaterShot(bt, b, bt.clampPoint({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d }, 40), c));
          FX.burst(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, '#9fe2ff', 5, 400, 6, 0.3, 'square');
        }
        return t >= c.time + 0.3;
      },
      end: function () { b.data.water = false; _restoreSpeed(b, keep.vx, keep.vy); },
    };
  },
  toka: function (bt, b) {
    var c = b.cfg.toka, i = 0, t = 0;
    FX.banner('토카토카', { color: '#00f0ff', size: 110, life: 1.2 });
    var vx = b.vx, vy = b.vy; b.vx = b.vy = 0;
    return {
      moves: false,
      update: function (dt) {
        t += dt;
        var p = Math.min(1, t / c.jumpTime);
        b.lift = Math.sin(Math.PI * p) * 0.55; b.air = b.lift > 0.15;
        if (p >= 1) {
          t = 0; i++; b.lift = 0; b.air = false;
          var ctr = bt.aimArea(b, b.x, b.y);
          bt.add(new Wave(bt, b, ctr.x, ctr.y, c.waveRadius, c.waveSpeed, c.damage, '#00f0ff', 'tokaHit'));
          FX.ring(ctr.x, ctr.y, 10, 80, 0.3, '#ffffff', 10);
          FX.burst(b.x, b.y + b.r * 0.6, '#9fd8ff', 14, 500, 10, 0.4, 'smoke');
          FX.shake(c.shake); FX.sfx('thump');
          bt.emit('tokaWave');
          if (i >= c.jumps) return true;
        }
        return false;
      },
      end: function () { b.lift = 0; b.air = false; _restoreSpeed(b, vx, vy); },
    };
  },
};

// ---------- 규순이 워터밤: 날아가는 물줄기 → 바닥 물웅덩이 ----------
// 물에 받는 피해 배율: 얼음(파랑) 삼식이 0, 불(빨강) 삼식이 2배
function _waterMult(o) {
  if (!_is(o, 'samsik')) return 1;
  var ds = _dyes(o.data);
  return ds.indexOf('blue') >= 0 ? 0 : ds.indexOf('red') >= 0 ? 2 : 1;
}
class WaterShot {
  constructor(bt, owner, p, c) { this.bt = bt; this.owner = owner; this.c = c; this.sx = owner.x; this.sy = owner.y; this.tx = p.x; this.ty = p.y; this.t = 0; this.z = 1; this.x = this.sx; this.y = this.sy; }
  update(dt) {
    var D = 0.45, k = Math.min(1, (this.t += dt) / D);
    this.x = this.sx + (this.tx - this.sx) * k; this.y = this.sy + (this.ty - this.sy) * k; this.h = Math.sin(k * Math.PI) * 90;
    if (Math.random() < 0.6) FX.particle({ x: this.x, y: this.y - this.h, vx: _rnd(-30, 30), vy: _rnd(-20, 40), life: 0.3, size: _rnd(5, 9), color: '#9fe2ff', shape: 'square' });
    if (k < 1) return;
    this.dead = true;
    this.bt.add(new Puddle(this.bt, this.owner, this.tx, this.ty, this.c));
    FX.burst(this.tx, this.ty, '#7fd8ff', 14, 500, 8, 0.45, 'square'); FX.ring(this.tx, this.ty, 10, this.c.puddleR, 0.3, '#bfefff', 6);
  }
  draw(ctx) {
    ctx.save(); ctx.fillStyle = '#7fd8ff'; ctx.shadowColor = '#4fc3ff'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.ellipse(this.x, this.y - this.h, 11, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
class Puddle {
  constructor(bt, owner, x, y, c) { this.bt = bt; this.owner = owner; this.x = x; this.y = y; this.c = c; this.t = 0; this.z = -1; this.cd = {}; this.seed = _rnd(0, 6); }
  get r() { return this.c.puddleR * Math.min(1, this.t / 0.2); }
  update(dt) {
    var bt = this.bt, self = this, c = this.c;
    if ((this.t += dt) > c.puddleLife) { this.dead = true; return; }
    bt.balls.forEach(function (o) {
      if (o.team === self.owner.team || !o.targetable || o.air || Math.hypot(o.x - self.x, o.y - self.y) > self.r + o.r * 0.4) return;
      if (self.cd[o.id] > bt.time) return;
      self.cd[o.id] = bt.time + 0.6;
      var m = _waterMult(o);
      if (m > 0) bt.damage(o, c.damage * m, self.owner, { color: '#7fd8ff', kind: 'water' });
      else FX.text(o.x, o.y - o.r - 40, '얼음이라 멀쩡', '#bff0ff', 34, 0.8);
      var a = _rnd(0, Math.PI * 2), sp = Math.max(Math.hypot(o.vx, o.vy), o.speed) * c.slip;   // 경로가 바뀌며 미끄러짐
      o.vx = Math.cos(a) * sp; o.vy = Math.sin(a) * sp;
      o.status.haste = Math.max(o.status.haste, c.slipTime); o.status.hasteMul = c.slip;
      if (!(o.data.slipMsg > bt.time)) { o.data.slipMsg = bt.time + 1; FX.text(o.x, o.y - o.r - 70, '미끄덩!', '#9fe2ff', 40, 0.7); }
      bt.emit('waterHit', { who: o.def.id, mult: m });
    });
  }
  draw(ctx) {
    var fade = Math.min(1, (this.c.puddleLife - this.t) / 0.4), r = this.r;
    ctx.save(); ctx.globalAlpha = Math.max(0, fade);
    var g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    g.addColorStop(0, 'rgba(90,190,255,0.75)'); g.addColorStop(1, 'rgba(40,130,255,0.45)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(this.x, this.y, r, r * 0.8, this.seed, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,90,200,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(this.x, this.y, r, r * 0.8, this.seed, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,248,255,0.8)';
    var rp = (this.t * 1.5) % 1; ctx.beginPath(); ctx.ellipse(this.x, this.y, r * rp, r * 0.8 * rp, this.seed, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
// ---------- 진형권(심리학자) 파블로프의 개 ----------
// 타겟은 하나로 고정. 표식이 찍혔거나 못 노리게 되면 표식 없는 가장 가까운 적 (다 찍혔으면 가장 가까운 적)
function psychTarget(bt, b) {
  var d = b.data, t = d.target;
  if (t && t.alive && t.targetable && !d.marks[t.id] && t.team !== b.team) return t;
  var foes = bt.enemies(b).filter(function (o) { return o.targetable; }).sort(function (p, q) { return _dist(p, b) - _dist(q, b); });
  d.target = foes.filter(function (o) { return !d.marks[o.id]; })[0] || foes[0] || null;
  return d.target;
}
// 돌진으로 같은 적을 marks번 맞히면 표식 → 다음 타겟
function psychHit(bt, b, o) {
  var d = b.data, c = b.cfg.pavlov;
  if (d.marks[o.id]) return;
  d.hits[o.id] = (d.hits[o.id] || 0) + 1;
  if (d.hits[o.id] < c.marks) return;
  d.marks[o.id] = true;
  FX.text(o.x, o.y - o.r - 80, '조건 형성! 🔔', '#ffe680', 50, 1.2); FX.sfx('ding');
  FX.ring(o.x, o.y, o.r, o.r * 2.5, 0.5, '#ffe680', 10);
  bt.emit('pavlovMark', { who: o.def.id });
  d.target = null; psychTarget(bt, b);
}

// ---------- 삼식이 헬퍼 ----------
function samsikDye(bt, b) {
  var c = b.cfg.dye, color = rollDye();
  b.data.pendingDye = color;
  b.data.roulette = c.rouletteTime;
  b.data.showResult = 0;
  FX.banner('염색!', { color: '#ffffff', size: 120, life: 1.0, y: CONFIG.arena.y + 140 });
  FX.sfx('dye');
  bt.emit('dye', { color: color });
}
function samsikQuake(bt, s) {
  var c = s.cfg.dye.shaved;
  for (var i = 0; i < c.waves; i++) {
    bt.after(i * c.interval, function () {
      if (!s.alive) return;
      bt.add(new Wave(bt, s, s.x, s.y, c.radius, c.radius / 0.25, c.damage, '#e0a96d', 'quakeHit', { knock: 200 }));
      FX.burst(s.x, s.y, '#c9a27a', 26, 800, 14, 0.6, 'smoke');
      FX.burst(s.x, s.y, '#8b6a45', 14, 700, 10, 0.6, 'shard', { g: 1200 });
      FX.shake(c.shake); FX.sfx('quake');
      bt.emit('quakeWave');
    });
  }
  // 머리 반짝
  FX.burst(s.x, s.y - s.r * 0.6, '#ffffff', 12, 300, 10, 0.5, 'spark');
}
function samsikReappear(bt, s) {
  var t = s.data.vanishTarget, c = s.cfg.dye.black;
  s.hidden = false; s.data.vanishTarget = null;
  if (t && t.alive) {
    var sp = Math.hypot(t.vx, t.vy), dx, dy;
    if (sp > 20) { dx = -t.vx / sp; dy = -t.vy / sp; }          // 진행 방향의 반대 = 뒤쪽
    else { dx = t.x - s.x; dy = t.y - s.y; var d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d; }
    var p = bt.clampPoint({ x: t.x + dx * (t.r + s.r + 8), y: t.y + dy * (t.r + s.r + 8) }, s.r);
    s.x = p.x; s.y = p.y;
    s.vx = -dx * s.speed; s.vy = -dy * s.speed;
    FX.burst(s.x, s.y, '#2a1a40', 30, 600, 26, 0.8, 'smoke');
    FX.burst(t.x, t.y, '#b07cff', 24, 900, 8, 0.5, 'spark');
    bt.damage(t, c.damage, s, { color: '#c9a2ff' });
    FX.shake(18); FX.sfx('slash');
    bt.emit('ambush', { who: t.def.id });
  } else {
    FX.burst(s.x, s.y, '#2a1a40', 20, 400, 22, 0.7, 'smoke');
  }
}

// CH의 뱀: 맵을 무작위로 돌아다니며 닿은 적에게 데미지 (같은 적 hitCooldown초마다)
function _isFemale(o) { return !!(o.def.female && o.def.female(o)); }
class Snake {
  // o: {x, y, ang, speed, target, life} — hxpwm 긴급소집이 날려 보낼 때 사용
  constructor(bt, owner, c, o) {
    o = o || {};
    this.bt = bt; this.owner = owner; this.c = c;
    this.x = o.x != null ? o.x : owner.x; this.y = o.y != null ? o.y : owner.y;
    this.ang = o.ang != null ? o.ang : _rnd(0, Math.PI * 2); this.t = 0; this.wig = _rnd(0, 6); this.z = -1;
    this.spd = o.speed || c.speed; this.target = o.target || null; this.life = o.life || 0;
    this.pts = []; for (var i = 0; i < c.segments; i++) this.pts.push({ x: this.x, y: this.y });
    this.born = bt.time;
  }
  update(dt) {
    var A = CONFIG.arena, c = this.c, self = this;
    if (!this.owner.alive || (this.life && this.t > this.life)) { this.poof(); return; }
    this.t += dt;
    if (this.target && this.target.targetable) {   // 날아오는 뱀: 목표를 향해 휘어짐
      var want = Math.atan2(this.target.y - this.y, this.target.x - this.x), diff = Math.atan2(Math.sin(want - this.ang), Math.cos(want - this.ang));
      this.ang += Math.max(-5 * dt, Math.min(5 * dt, diff));
    } else {
      this.ang += (Math.sin(this.t * 1.7 + this.wig) * 0.8 + _rnd(-1, 1)) * c.turn * dt;
    }
    var nx = this.x + Math.cos(this.ang) * this.spd * dt, ny = this.y + Math.sin(this.ang) * this.spd * dt;
    if (nx < A.x + 20 || nx > A.x + A.w - 20) { this.ang = Math.PI - this.ang; nx = Math.max(A.x + 20, Math.min(A.x + A.w - 20, nx)); }
    if (ny < A.y + 20 || ny > A.y + A.h - 20) { this.ang = -this.ang; ny = Math.max(A.y + 20, Math.min(A.y + A.h - 20, ny)); }
    this.x = nx; this.y = ny;
    // 몸통: 일정 간격으로 머리를 따라감
    var prev = { x: this.x, y: this.y };
    for (var i = 0; i < this.pts.length; i++) {
      var p = this.pts[i], dx = p.x - prev.x, dy = p.y - prev.y, d = Math.hypot(dx, dy), seg = 13;
      if (d > seg) { p.x = prev.x + dx / d * seg; p.y = prev.y + dy / d * seg; }
      prev = p;
    }
    // 적에게 닿으면 데미지를 주고 사라짐
    this.bt.enemies(this.owner).forEach(function (o) {
      if (self.dead || !o.targetable || o.air) return;
      if (Math.hypot(o.x - self.x, o.y - self.y) > o.r + 18) return;
      var fem = _isFemale(o), dmg = c.damage * (fem ? c.femaleMultiplier : 1) * (o.def.snakeTaken ? o.def.snakeTaken(o) : 1);
      self.bt.damage(o, dmg, self.owner, { color: '#7dffb0' });
      FX.burst(self.x, self.y, '#39ff88', 12, 500, 7, 0.4);
      if (fem) FX.text(o.x, o.y - o.r - 60, '여성 2배!', '#ff7ad9', 48, 0.9);
      self.bt.emit('snakeHit', { who: o.def.id, amt: dmg, female: fem });
      self.dead = true;
    });
  }
  poof() { FX.burst(this.x, this.y, '#39ff88', 14, 300, 8, 0.5, 'smoke'); this.dead = true; }
  draw(ctx) {
    var pts = this.pts;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 16;
    for (var i = pts.length - 1; i > 0; i--) {
      ctx.strokeStyle = i % 2 ? '#1fbf5f' : '#39ff88';
      ctx.lineWidth = 20 * (1 - i / pts.length * 0.7);
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
    }
    ctx.lineWidth = 20; ctx.strokeStyle = '#39ff88';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.translate(this.x, this.y); ctx.rotate(this.ang); ctx.shadowBlur = 0;
    ctx.fillStyle = '#2ee879'; ctx.beginPath(); ctx.ellipse(4, 0, 18, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(10, -6, 3, 0, Math.PI * 2); ctx.arc(10, 6, 3, 0, Math.PI * 2); ctx.fill();
    if (Math.sin(this.t * 12) > 0) {
      ctx.strokeStyle = '#ff2b6a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(32, 0); ctx.lineTo(37, -4); ctx.moveTo(32, 0); ctx.lineTo(37, 4); ctx.stroke();
    }
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 90 }; }
}

// CH 텐트치기: 회전하는 돌기의 선분 (공 표면 → 끝)
function _tentSeg(b) {
  var d = b.data, a = d.tentAng, r0 = b.r * 0.85, r1 = b.r + d.tentLen;
  return { x0: b.x + Math.cos(a) * r0, y0: b.y + Math.sin(a) * r0, x1: b.x + Math.cos(a) * r1, y1: b.y + Math.sin(a) * r1 };
}
function _segDist(px, py, s) {
  var vx = s.x1 - s.x0, vy = s.y1 - s.y0, l2 = vx * vx + vy * vy || 1;
  var t = Math.max(0, Math.min(1, ((px - s.x0) * vx + (py - s.y0) * vy) / l2));
  return Math.hypot(px - (s.x0 + vx * t), py - (s.y0 + vy * t));
}

// ---------- 삼식이 여러 색 ----------
function _dyes(d) { return d.dyes && d.dyes.length ? d.dyes : (d.dye ? [d.dye] : []); }
function _curDye(b) { var ds = _dyes(b.data); return ds.length ? ds[Math.floor((b.data.cyc || 0) * 3) % ds.length] : null; }
function samsikMultiDye(bt, b) {
  var set = Math.random() < CONFIG.chars.samsik.dye.multiBW ? ['black', 'white'] : ['red', 'blue', 'yellow', 'shaved'];
  var d = b.data;
  d.dyes = set.slice(); d.dye = set[0]; d.roulette = 0; d.showResult = 0;
  FX.ring(b.x, b.y, b.r, b.r * 3, 0.6, '#ffffff', 14);
  set.forEach(function (k) { FX.burst(b.x, b.y, DYES[k].glow || DYES[k].color, 14, 700, 9, 0.6); });
  bt.skillText(b, set.map(function (k) { return DYES[k].label; }).join('+') + '!', '#ffffff');
  if (set.indexOf('white') >= 0) FX.flash('#ffffff', 0.4, 0.3);
  FX.sfx('ding');
  bt.emit('multiDye', { dyes: set });
}

// ---------- 이비 각성 (seq가 있으면 그 순서대로 연속 사용) ----------
function ibiAwaken(bt, b, seq) {
  var c = b.cfg.awaken, t = 0, sub = null, w = {};
  Object.keys(c.weights).forEach(function (k) { if (k !== 'waterbomb' || (bt.map && bt.map.id === 'hall')) w[k] = c.weights[k]; });   // 워터밤은 마을회관에서만
  var queue = seq ? seq.slice() : [_pickWeighted(w)];
  bt.darkOn(b); b.data.gyusuni = true;
  FX.banner(seq ? '규순이 풀코스' : '규순이로 각성', { color: '#c77dff', size: 125, life: 1.3 });
  FX.sfx('awaken'); FX.shake(16);
  FX.ring(b.x, b.y, b.r, b.r * 4, 0.8, '#b04dff', 18);
  var keep = { vx: b.vx, vy: b.vy };
  return {
    moves: false, uninterruptible: false,
    update: function (dt) {
      if (!sub) {
        if (t < c.introTime) {
          t += dt; b.jx = _rnd(-4, 4); b.jy = _rnd(-4, 4);
          if (Math.random() < 0.7) FX.particle({ x: b.x + _rnd(-b.r, b.r), y: b.y + _rnd(-b.r, b.r), vx: 0, vy: _rnd(-300, -150), life: 0.5, size: 10, color: '#c77dff' });
          return false;
        }
        b.jx = b.jy = 0;
        if (keep) { b.vx = keep.vx; b.vy = keep.vy; keep = null; }
        var pick = queue.shift();
        bt.emit('awakenPick', { pick: pick, combo: !!seq });
        sub = GYUSUN_SKILLS[pick](bt, b, !!seq);
        this.moves = sub.moves; this.uninterruptible = !!sub.uninterruptible; this.spinning = !!sub.spinning;
        return false;
      }
      if (sub.update(dt)) {
        if (sub.end) sub.end();
        sub = null; this.spinning = false;
        return queue.length === 0;
      }
      return false;
    },
    end: function () {
      if (sub && sub.end) sub.end();
      b.jx = b.jy = 0; bt.darkOff(b); b.data.gyusuni = false;
      if (keep) _restoreSpeed(b, keep.vx, keep.vy);
    },
  };
}

// ---------- hxpwm ----------
// 충전기: 적이 먹으면 hxpwm이 초음파로 확정 피해, 본인이 먹으면 해피 (같은 팀원은 못 먹음)
class Charger {
  constructor(bt, owner, p) { this.bt = bt; this.owner = owner; this.x = p.x; this.y = p.y; this.t = 0; this.z = -1; this.r = 28; }
  update(dt) {
    var self = this, bt = this.bt, o = this.owner;
    this.t += dt;
    if (!o.alive || !_is(o, 'hxpwm')) { this.dead = true; FX.burst(this.x, this.y, '#ffffff', 10, 300, 6, 0.4); return; }
    if (this.t < 0.4) return;   // 생성 연출 중
    var eater = bt.balls.find(function (b) {
      return b.alive && !b.hidden && !b.air && (b === o || b.team !== o.team) && Math.hypot(b.x - self.x, b.y - self.y) < b.r + self.r;
    });
    if (!eater) return;
    this.dead = true;
    FX.burst(this.x, this.y, '#fff27a', 34, 900, 10, 0.6, 'spark');
    FX.ring(this.x, this.y, 10, 140, 0.4, '#fff27a', 12);
    if (eater === o) hxpwmHappy(bt, o);
    else {
      bt.skillText(o, '주뱃!!', '#7fe9ff');
      FX.ring(o.x, o.y, o.r, o.r * 3.2, 0.5, '#7fe9ff', 16);
      FX.ring(o.x, o.y, o.r, o.r * 2.2, 0.35, '#ffffff', 8);
      FX.shake(10);
      bt.add(new Ultrasound(bt, o, eater));
    }
  }
  draw(ctx) {
    var s = Math.min(1, this.t / 0.3), pul = 1 + Math.sin(this.t * 6) * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(this.t * 6) * 0.15; ctx.fillStyle = '#fff27a';
    ctx.beginPath(); ctx.arc(this.x, this.y, 46 * s * pul, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(this.x, this.y); ctx.scale(s * pul * 1.15, s * pul * 1.15);
    ctx.shadowColor = '#fff27a'; ctx.shadowBlur = 40;
    ctx.fillStyle = '#f4f4f8'; Battle.roundRect(ctx, -22, -26, 44, 52, 10); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = '#9a9ab0'; ctx.stroke();
    ctx.fillStyle = '#9a9ab0'; ctx.fillRect(-12, -38, 6, 13); ctx.fillRect(6, -38, 6, 13);
    ctx.fillStyle = '#ffd400'; ctx.beginPath();
    ctx.moveTo(4, -18); ctx.lineTo(-10, 4); ctx.lineTo(0, 4); ctx.lineTo(-4, 20); ctx.lineTo(10, -4); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 90 }; }
}
// 초음파: 먹은 적을 끝까지 따라가서 반드시 맞음 (실명과 무관)
class Ultrasound {
  constructor(bt, src, target) { this.bt = bt; this.src = src; this.target = target; this.x = src.x; this.y = src.y; this.t = 0; this.z = 1; FX.sfx('ultra'); }
  update(dt) {
    var tg = this.target, c = CONFIG.chars.hxpwm.charger;
    if (!tg.alive) { this.dead = true; return; }
    this.t += dt;
    var k = Math.min(1, dt * 14);
    this.x += (tg.x - this.x) * k; this.y += (tg.y - this.y) * k;
    if (this.t >= 0.25 && tg.targetable) {
      this.dead = true;
      this.bt.damage(tg, c.ultraDamage, this.src, { color: '#7fe9ff' });
      for (var i = 0; i < 4; i++) FX.ring(tg.x, tg.y, tg.r * 0.8, tg.r * (2 + i * 0.9), 0.35 + i * 0.12, i % 2 ? '#ffffff' : '#7fe9ff', 18 - i * 3);
      FX.burst(tg.x, tg.y, '#7fe9ff', 40, 1300, 8, 0.5, 'spark');
      FX.burst(tg.x, tg.y, '#ffffff', 16, 700, 10, 0.4);
      FX.flash('#7fe9ff', 0.28, 0.25); FX.shake(22); FX.sfx('ultraHit');
      FX.text(tg.x, tg.y - tg.r - 60, '삐이이익!', '#7fe9ff', 58, 0.9);
      this.bt.emit('ultrasound', { who: tg.def.id });
    }
  }
  draw(ctx) {
    var a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    ctx.save();
    // 조하람 → 초음파 빔
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#7fe9ff'; ctx.lineWidth = 14; ctx.shadowColor = '#7fe9ff'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.moveTo(this.src.x, this.src.y); ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#7fe9ff'; ctx.lineWidth = 10;
    for (var i = 0; i < 5; i++) {
      var r = 26 + i * 22 + (this.t * 260) % 22;
      ctx.globalAlpha = 1 - i * 0.18;
      ctx.beginPath(); ctx.arc(this.x - Math.cos(a) * i * 26, this.y - Math.sin(a) * i * 26, r, a - 0.8, a + 0.8); ctx.stroke();
    }
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 100 }; }
}
function hxpwmHappy(bt, b) {
  var c = b.cfg.charger;
  b.data.happy = c.happyTime;
  bt.skillText(b, '해피~♥', '#ff7ad9');
  FX.burst(b.x, b.y, '#ff7ad9', 44, 800, 12, 0.9);
  FX.burst(b.x, b.y, '#ffffff', 16, 500, 7, 0.6, 'spark');
  FX.ring(b.x, b.y, b.r, b.r * 3, 0.6, '#ff7ad9', 14);
  FX.flash('#ff7ad9', 0.15, 0.25);
  FX.sfx('happy');
  bt.emit('happy');
}
// 삼식이의 칼 (긴급소집)
class Knife {
  constructor(bt, owner, from, to, speed, damage) {
    this.bt = bt; this.owner = owner; this.x = from.x; this.y = from.y; this.damage = damage; this.rot = 0; this.z = 1;
    var dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1;
    this.vx = dx / d * speed; this.vy = dy / d * speed;
  }
  update(dt) {
    var A = CONFIG.arena, self = this;
    this.x += this.vx * dt; this.y += this.vy * dt; this.rot += dt * 20;
    var hit = this.bt.enemies(this.owner).find(function (o) { return o.targetable && !o.air && Math.hypot(o.x - self.x, o.y - self.y) < o.r + 20; });
    if (hit) {
      this.bt.damage(hit, this.damage, this.owner, { color: '#ff5577' });
      this.bt.applyBleed(hit, CONFIG.chars.samsik.slash, this.owner);
      FX.burst(hit.x, hit.y, '#d0002a', 16, 600, 8, 0.5, 'square', { g: 900 }); FX.sfx('slash');
      this.bt.emit('knifeHit', { who: hit.def.id });
      this.dead = true; return;
    }
    if (this.x < A.x - 40 || this.x > A.x + A.w + 40 || this.y < A.y - 40 || this.y > A.y + A.h + 40) this.dead = true;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.shadowColor = '#ff0033'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#e8e8f4'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(8, 8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a3a2a'; ctx.fillRect(-5, 8, 10, 14);
    ctx.restore();
  }
}
function _edgePoint() {
  var A = CONFIG.arena, side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: _rnd(A.x + 20, A.x + A.w - 20), y: A.y + 12 };
  if (side === 1) return { x: _rnd(A.x + 20, A.x + A.w - 20), y: A.y + A.h - 12 };
  if (side === 2) return { x: A.x + 12, y: _rnd(A.y + 20, A.y + A.h - 20) };
  return { x: A.x + A.w - 12, y: _rnd(A.y + 20, A.y + A.h - 20) };
}
// 긴급소집: 맵 가장자리에서 CH의 뱀 / 이비의 돌 / 삼식이의 칼이 적에게 날아옴
function hxpwmCallShot(bt, b, i) {
  var c = b.cfg.call, foes = bt.enemies(b).filter(function (o) { return o.targetable; });
  if (!foes.length) return;
  var t = foes[Math.floor(Math.random() * foes.length)], from = _edgePoint(), aim = bt.aim(b, t.x, t.y);
  var kind = ['stone', 'snake', 'knife'][i % 3];
  if (kind === 'stone') bt.add(new Stone(bt, b, aim.x, aim.y, CONFIG.chars.ibi.stone, from));
  else if (kind === 'snake') bt.add(new Snake(bt, b, CONFIG.chars.ch.snake, { x: from.x, y: from.y, ang: Math.atan2(aim.y - from.y, aim.x - from.x), speed: c.snakeSpeed, target: aim.miss ? null : t, life: 3 }));
  else bt.add(new Knife(bt, b, from, aim, c.knifeSpeed, c.knifeDamage));
  FX.ring(from.x, from.y, 10, 70, 0.35, '#ff3b3b', 8);
  bt.emit('callShot', { kind: kind });
}
// IZK 1기 시너지: 긴급소집 때 같은 팀 동료가 추가 효과 발동
function izkCall(bt, b) {
  FX.banner('IZK 1기 소집!', { color: '#ffe14d', size: 110, life: 1.6, y: CONFIG.arena.y + 220 });
  bt.emit('izkCall');
  bt.allies(b).forEach(function (a) {
    if (a.def.id === 'ch') {
      for (var i = 0; i < 3; i++) bt.add(new Snake(bt, a, a.cfg.snake));
      FX.burst(a.x, a.y, '#39ff88', 24, 600, 10, 0.6); bt.skillText(a, '뱀 x3', '#39ff88');
      bt.emit('izkSnakes');
    } else if (a.def.id === 'samsik') {
      samsikMultiDye(bt, a);
    } else if (a.def.id === 'ibi') {
      if (!a.action && !a.disabled && !a.hidden) a.action = ibiAwaken(bt, a, ['birds', 'lucha', 'toka']);
      else a.data.pendingCombo = true;
      bt.emit('izkIbi');
    }
  });
}

// ---------- 문남휘 ----------
function _scaleStats(b, k) { b.maxHp *= k; b.hp *= k; b.hpShown *= k; b.speed *= k; b.dmgMult *= k; }
// 밸런스 패치: 상대 모든 스탯 -rate, 본인 +rate (누적 배율은 min~max로 제한)
function devPatch(bt, s, t) {
  var c = s.cfg.patch;
  var cap = c.maxStacks;
  if ((s.data.patches || 0) >= cap) return;   // 최대 cap회까지 중첩
  var tr = t.isBoss ? c.bossRate : c.rate;   // 보스에겐 감소가 조금만
  _scaleStats(t, 1 - tr); t.data.patchF = (t.data.patchF || 1) * (1 - tr);
  _scaleStats(s, 1 + c.rate); s.data.patchF = (s.data.patchF || 1) * (1 + c.rate);
  s.data.patches = (s.data.patches || 0) + 1;
  if (s.data.patches === cap) bt.skillText(s, '패치 MAX', '#c6ff00');
  FX.text(t.x, t.y - t.r - 50, '-' + Math.round(tr * 100) + '%', '#ff5577', 48, 0.9);
  FX.text(s.x, s.y - s.r - 50, '+' + Math.round(c.rate * 100) + '%', '#c6ff00', 48, 0.9);
  for (var i = 0; i < 14; i++) FX.particle({ x: t.x + _rnd(-t.r, t.r), y: t.y + _rnd(-t.r, t.r), vx: _rnd(-200, 200), vy: _rnd(-60, 60), life: 0.35, size: _rnd(6, 16), color: i % 2 ? '#c6ff00' : '#ff2bd6', shape: 'square' });
  FX.sfx('patch');
  bt.emit('patch', { who: t.def.id, tf: t.data.patchF, sf: s.data.patchF });
}
// 치트: 조준선 → 굵은 레이저 (경로의 모든 적 관통, 적마다 1회)
class Laser {
  constructor(bt, owner, ang, c) { this.bt = bt; this.owner = owner; this.ang = ang; this.c = c; this.t = 0; this.fired = false; this.z = 1; this.hit = new Set(); }
  seg() { var o = this.owner; return { x0: o.x, y0: o.y, x1: o.x + Math.cos(this.ang) * 2600, y1: o.y + Math.sin(this.ang) * 2600 }; }
  update(dt) {
    var c = this.c, self = this, o = this.owner;
    if (!o.alive) { this.dead = true; return; }
    this.t += dt;
    if (!this.fired && this.t >= c.charge) {
      this.fired = true;
      FX.sfx('laser'); FX.shake(c.shake); FX.flash('#c6ff00', 0.22, 0.2);
      this.bt.emit('laserFire');
    }
    if (this.fired) {
      var sg = this.seg();
      this.bt.enemies(o).forEach(function (e) {
        if (self.hit.has(e) || !e.targetable || e.air || _segDist(e.x, e.y, sg) > c.width / 2 + e.r) return;
        self.hit.add(e);
        self.bt.damage(e, devCheatDamage(o), o, { color: '#e6ff7a' });
        FX.burst(e.x, e.y, '#c6ff00', 24, 1000, 8, 0.5, 'spark');
        self.bt.emit('laserHit', { who: e.def.id });
      });
      if (Math.random() < 0.8) {
        var d = _rnd(0, 1400);
        FX.particle({ x: o.x + Math.cos(this.ang) * d, y: o.y + Math.sin(this.ang) * d, vx: _rnd(-120, 120), vy: _rnd(-120, 120), life: 0.3, size: 8, color: '#c6ff00', shape: 'square' });
      }
    }
    if (this.t >= c.charge + c.fire) this.dead = true;
  }
  draw(ctx) {
    var A = CONFIG.arena, c = this.c, sg = this.seg();
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    ctx.lineCap = 'round';
    if (!this.fired) {
      var p = this.t / c.charge;
      ctx.setLineDash([24, 16]); ctx.lineDashOffset = -this.t * 300;
      ctx.strokeStyle = 'rgba(198,255,0,' + (0.3 + p * 0.6) + ')'; ctx.lineWidth = 4 + p * 8;
      ctx.beginPath(); ctx.moveTo(sg.x0, sg.y0); ctx.lineTo(sg.x1, sg.y1); ctx.stroke();
    } else {
      var f = 1 - (this.t - c.charge) / c.fire, w = c.width * (0.6 + f * 0.4);
      ctx.shadowColor = '#c6ff00'; ctx.shadowBlur = 50;
      ctx.strokeStyle = 'rgba(198,255,0,' + (0.55 * f + 0.2) + ')'; ctx.lineWidth = w * 1.5;
      ctx.beginPath(); ctx.moveTo(sg.x0, sg.y0); ctx.lineTo(sg.x1, sg.y1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * f + 0.1) + ')'; ctx.lineWidth = w * 0.5; ctx.stroke();
    }
    ctx.restore();
  }
  light() { var o = this.owner; return { x: o.x + Math.cos(this.ang) * 300, y: o.y + Math.sin(this.ang) * 300, r: 400 }; }
}
// 치트 피해: 밸런스 패치를 많이 할수록 강해짐 (저점 낮고 고점 높음, 공격력 배율은 따로 곱해짐)
function devCheatDamage(b) { var c = b.cfg.cheat; return c.damage * (1 + c.perPatch * (b.data.patches || 0)); }
function devLaser(bt, b) {
  var c = b.cfg.cheat, t0 = bt.nearest(b), p = t0 ? bt.aim(b, t0.x, t0.y) : bt.randomPoint();
  var track = t0 && !p.miss ? t0 : null, keep = { vx: b.vx, vy: b.vy }, t = 0;
  var beam = bt.add(new Laser(bt, b, Math.atan2(p.y - b.y, p.x - b.x), c));
  b.vx = b.vy = 0;
  bt.skillText(b, '치트 ON', '#c6ff00'); FX.sfx('laserCharge');
  FX.banner('치트', { color: '#c6ff00', size: 120, life: 1.0 });
  return {
    moves: false, uninterruptible: true,
    update: function (dt) {
      t += dt;
      if (track && track.alive && t < c.charge - 0.15) beam.ang = Math.atan2(track.y - b.y, track.x - b.x);
      b.jx = _rnd(-2, 2); b.jy = _rnd(-2, 2);
      return t >= c.charge + c.fire;
    },
    end: function () { beam.dead = true; b.jx = b.jy = 0; _restoreSpeed(b, keep.vx, keep.vy); },
  };
}

// ---------- 유재운 ----------
// 연습 후 발냄새: 본인을 따라다니는 영역, 가까울수록 초당 피해 증가
class StinkZone {
  constructor(bt, owner) { this.bt = bt; this.owner = owner; this.z = -1; this.tick = 0; this.t = 0; }
  update(dt) {
    var o = this.owner, self = this;
    if (!o.alive || !_is(o, 'rock')) { this.dead = true; return; }   // 리플리가 다른 모습이 되면 정리 (먼저 확인)
    var c = Object.assign({}, o.cfg.stink, { radius: o.cfg.stink.radius * (_dmdyd(this.bt, o) ? CONFIG.synergy.dmdyd.stinkMul : 1) });   // 디마디영디: 범위 확대
    this.t += dt; this.tick += dt;
    if (Math.random() < dt * 14) FX.particle({ x: o.x + _rnd(-1, 1) * c.radius * 0.7, y: o.y + _rnd(-1, 1) * c.radius * 0.7, vx: _rnd(-15, 15), vy: _rnd(-40, -10), life: 1.0, size: _rnd(16, 30), color: Math.random() < 0.5 ? '#9acd32' : '#c8b400', shape: 'smoke' });
    if (this.tick < 0.4999) return;
    this.tick -= 0.5;
    if (o.hidden) return;
    this.bt.enemies(o).forEach(function (e) {
      if (!e.targetable || e.air) return;
      var d = Math.hypot(e.x - o.x, e.y - o.y);
      if (d >= c.radius) return;
      var k = 1 - d / c.radius, dmg = (c.minDps + (c.maxDps - c.minDps) * k) * 0.5;
      self.bt.damage(e, dmg, o, { dot: true, color: '#c6e36b', kind: 'stink' });
      self.bt.emit('stinkHit', { who: e.def.id, amt: dmg, dist: d });
      if (k > 0.6 && Math.random() < 0.5) FX.text(e.x, e.y - e.r - 40, '윽', '#c6e36b', 38, 0.5);
    });
  }
  draw(ctx) {
    var o = this.owner, R = o.cfg.stink.radius * (_dmdyd(this.bt, o) ? CONFIG.synergy.dmdyd.stinkMul : 1);
    ctx.save();
    var g = ctx.createRadialGradient(o.x, o.y, o.r, o.x, o.y, R);
    g.addColorStop(0, 'rgba(170,205,50,0.38)'); g.addColorStop(1, 'rgba(170,205,50,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.setLineDash([14, 12]); ctx.lineDashOffset = this.t * 40; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(200,220,80,0.45)';
    ctx.beginPath(); ctx.arc(o.x, o.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(190,220,60,0.8)'; ctx.lineWidth = 5;
    for (var i = -1; i <= 1; i++) {   // 냄새 줄기
      var bx = o.x + i * o.r * 0.5, by = o.y - o.r - 10;
      ctx.beginPath();
      for (var k = 0; k <= 6; k++) { var yy = by - k * 9, xx = bx + Math.sin(this.t * 6 + k + i) * 7; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- 진형권 ----------
// 아령/프로틴: 아령은 본인과 적만, 프로틴은 누구나 먹을 수 있음
class Pickup {
  constructor(bt, owner, p, kind) { this.bt = bt; this.owner = owner; this.x = p.x; this.y = p.y; this.kind = kind; this.t = 0; this.z = -1; this.r = 30; }
  update(dt) {
    var o = this.owner, self = this, bt = this.bt;
    this.t += dt;
    if (!o.alive || !_is(o, 'gym')) { this.dead = true; FX.burst(this.x, this.y, '#cccccc', 10, 300, 6, 0.4); return; }
    if (this.t < 0.4) return;
    var eater = bt.balls.find(function (b) {
      return b.alive && !b.hidden && !b.air && !b.isBoss && (self.kind === 'protein' || b === o || b.team !== o.team || _dmdyd(bt, o)) && Math.hypot(b.x - self.x, b.y - self.y) < b.r + self.r;   // 보스는 못 먹음, 디마디영디면 같은 팀도
    });
    if (!eater) return;
    this.dead = true;
    if (this.kind === 'dumbbell') gymDumbbell(bt, o, eater); else gymProtein(bt, o, eater);
  }
  draw(ctx) {
    var s = Math.min(1, this.t / 0.3), bob = Math.sin(this.t * 4) * 4;
    ctx.save(); ctx.translate(this.x, this.y + bob); ctx.scale(s, s);
    if (this.kind === 'dumbbell') {
      ctx.rotate(-0.3); ctx.shadowColor = '#9ad0ff'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#9aa0b0'; ctx.fillRect(-26, -5, 52, 10);
      ctx.fillStyle = '#3a3f4c'; Battle.roundRect(ctx, -38, -20, 16, 40, 5); ctx.fill(); Battle.roundRect(ctx, 22, -20, 16, 40, 5); ctx.fill();
      ctx.fillStyle = '#5a6070'; Battle.roundRect(ctx, -44, -14, 8, 28, 3); ctx.fill(); Battle.roundRect(ctx, 36, -14, 8, 28, 3); ctx.fill();
    } else {
      ctx.shadowColor = '#ffb3d9'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#ffffff'; Battle.roundRect(ctx, -18, -24, 36, 48, 8); ctx.fill();
      ctx.fillStyle = '#ff5e9a'; ctx.fillRect(-20, -32, 40, 10);
      ctx.fillStyle = '#ff5e9a'; ctx.font = '700 24px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('P', 0, 4);
    }
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 80 }; }
}
function gymSpawn(bt, b, kind) {
  var c = b.cfg[kind];
  var mine = bt.ents.filter(function (e) { return e instanceof Pickup && e.owner === b && e.kind === kind && !e.dead; }).length;
  if (mine >= c.max) return;
  var p = bt.randomPoint(70);
  for (var i = 0; i < 12; i++) {
    if (bt.balls.every(function (o) { return !o.alive || Math.hypot(o.x - p.x, o.y - p.y) > o.r + 90; })) break;
    p = bt.randomPoint(70);
  }
  bt.add(new Pickup(bt, b, p, kind));
  FX.ring(p.x, p.y, 10, 90, 0.4, kind === 'dumbbell' ? '#9ad0ff' : '#ff5e9a', 8);
  FX.sfx('pickup');
  bt.emit(kind + 'Spawn');
}
function gymDumbbell(bt, o, e) {
  var c = o.cfg.dumbbell;
  if (e !== o && e.team === o.team) {   // 디마디영디 헬스 메이트: 같은 팀도 벌크업 (크기는 그대로)
    e.maxHp += c.hp; bt.heal(e, c.heal); e.dmgMult *= c.atk;
    bt.skillText(e, '헬스 메이트!', '#9ad0ff'); FX.burst(e.x, e.y, '#9ad0ff', 20, 600, 8, 0.5); FX.sfx('powerup');
    bt.emit('bulkMate', { who: e.def.id });
    return;
  }
  if (e === o) {
    o.data.bulk = (o.data.bulk || 0) + 1;
    o.maxHp += c.hp; bt.heal(o, c.heal);
    o.dmgMult *= c.atk; o.r = Math.min(c.maxRadius, o.r * c.size);
    bt.skillText(o, '벌크업!', '#9ad0ff');
    FX.ring(o.x, o.y, o.r, o.r * 2.5, 0.5, '#9ad0ff', 14); FX.burst(o.x, o.y, '#9ad0ff', 26, 700, 9, 0.6);
    FX.shake(10); FX.sfx('powerup');
    bt.emit('bulk', { n: o.data.bulk });
  } else {
    e.status.slow = c.slowTime; e.status.slowMul = c.slowMul;
    FX.text(e.x, e.y - e.r - 50, '무거워...', '#9ad0ff', 46, 0.9); FX.burst(e.x, e.y, '#9aa0b0', 16, 400, 8, 0.5, 'square');
    FX.sfx('pickup');
    bt.emit('dumbbellSlow', { who: e.def.id });
  }
}
function gymProtein(bt, o, e) {
  var c = o.cfg.protein;
  if (e === o || (e.team === o.team && _dmdyd(bt, o))) {   // 디마디영디: 같은 팀도 본인 효과
    var w = e;
    bt.heal(w, c.heal);
    w.status.haste = c.hasteTime; w.status.hasteMul = c.hasteMul;
    bt.skillText(o, '단백질 충전!', '#ff5e9a');
    FX.burst(o.x, o.y, '#ff5e9a', 24, 600, 9, 0.6); FX.sfx('powerup');
    bt.emit('proteinSelf');
  } else {
    bt.heal(e, c.otherHeal);
    bt.emit('proteinOther', { who: e.def.id });
  }
}

// ---------- ??? (리플리) ----------
// 코난 범인 같은 검은 실루엣
function drawSilhouette(ctx, S) {
  var g = ctx.createRadialGradient(S / 2, S * 0.4, S * 0.1, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, '#3b2d5c'); g.addColorStop(1, '#0b0814');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#050308';
  ctx.beginPath(); ctx.ellipse(S / 2, S * 1.04, S * 0.5, S * 0.38, 0, Math.PI, 0); ctx.fill();
  ctx.fillRect(S * 0.42, S * 0.55, S * 0.16, S * 0.16);
  ctx.beginPath(); ctx.ellipse(S / 2, S * 0.42, S * 0.21, S * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(S * 0.28, S * 0.36); ctx.lineTo(S * 0.33, S * 0.12); ctx.lineTo(S * 0.42, S * 0.24); ctx.lineTo(S * 0.5, S * 0.1);
  ctx.lineTo(S * 0.58, S * 0.24); ctx.lineTo(S * 0.67, S * 0.12); ctx.lineTo(S * 0.72, S * 0.36); ctx.fill();
  ctx.fillStyle = '#ffffff';
  [[0.41, -1], [0.59, 1]].forEach(function (e) {
    ctx.save(); ctx.translate(S * e[0], S * 0.4); ctx.rotate(e[1] * 0.35);
    ctx.beginPath(); ctx.ellipse(0, 0, S * 0.048, S * 0.02, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = S * 0.018; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(S / 2, S * 0.46, S * 0.09, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}
var RIPLEY_SKIP = ['sy', 'chief'];   // 부활·팀 전용 같은 특수 규칙 캐릭터는 변신 대상에서 제외
function ripleyPick(b, bt) {
  var ok = function (id) { return id !== 'ripley' && id !== b.rip.as && RIPLEY_SKIP.indexOf(id) < 0; };
  var ids = Object.keys(CHARACTERS).filter(ok);
  return ids[Math.floor(Math.random() * ids.length)];
}
// 리플리 증후군: 다른 캐릭터의 모습·스킬로 변신. 체력/속도/크기는 리플리 그대로
function ripleyTransform(bt, b, targetId) {
  var base = CHARACTERS.ripley, tdef = CHARACTERS[targetId], rc = CONFIG.chars.ripley;
  if (b.action) { if (b.action.end) b.action.end(); b.action = null; }
  b.hidden = false; b.air = false; b.phasing = false; b.lift = 0; b.jx = b.jy = 0;
  b.slow = 1; b.takenMult = 1;
  bt.darkOff(b);
  var proxy = Object.create(tdef);
  proxy.id = 'ripley'; proxy.imgId = targetId; proxy.name = base.name; proxy.sub = base.sub;
  proxy.update = function (bt, b, dt) { ripleyTick(bt, b, dt); if (b.def === proxy && tdef.update) tdef.update(bt, b, dt); };
  proxy.onPhase2 = function (bt, b) { ripleyPhase2(bt, b); if (tdef.onPhase2) tdef.onPhase2(bt, b); };
  proxy.drawExtra = function (ctx, b, bt, x, y, r, time) { if (tdef.drawExtra) tdef.drawExtra(ctx, b, bt, x, y, r, time); ripleyGlitch(ctx, b, x, y, r); };
  proxy.hudTag = ripleyTag;
  b.def = proxy;
  b.cfg = Object.assign({}, CONFIG.chars[targetId], { hp: rc.hp, speed: rc.speed, radius: rc.radius });
  b.data = {};
  if (tdef.init) tdef.init(bt, b);
  b.skills = tdef.skills.map(function (sk, i) {
    var max = sk.cd(b.cfg);
    return { def: sk, max: max, cd: i === 0 ? Math.min(max, rc.firstCast) : (b.phase >= 2 ? CONFIG.battle.phase2FirstDelay : max) };
  });
  b.rip.as = targetId;
  b.rip.glitch = rc.glitchTime * (b.phase >= 2 ? 1.8 : 1);
  if (b.phase >= 2 && tdef.onPhase2) tdef.onPhase2(bt, b);   // 중증 리플리: 변한 캐릭터의 2페이즈 상태로
  var col = CONFIG.chars[targetId].color;
  for (var i = 0; i < 26; i++) FX.particle({ x: b.x + _rnd(-b.r, b.r), y: b.y + _rnd(-b.r, b.r), vx: _rnd(-400, 400), vy: _rnd(-60, 60), life: 0.4, size: _rnd(8, 22), color: i % 3 ? (i % 2 ? '#00f0ff' : '#ff2bd6') : col, shape: 'square' });
  bt.skillText(b, '→ ' + tdef.name, col);
  FX.sfx('glitch');
  bt.emit('ripley', { as: targetId, phase: b.phase });
}
// 디마디영디 ???: 변신하지 않고, callTime초 뒤 사업 전화를 받으러 경기장을 떠남 (탈락 처리)
function ripleyCall(bt, b, dt) {
  var c = CONFIG.synergy.dmdyd;
  b.rip.call = (b.rip.call == null ? c.ripleyCall : b.rip.call) - dt;
  if (b.rip.call > 1.5 && b.rip.call - dt <= 1.5) FX.sfx('ding');
  if (b.rip.call > 0) return;
  FX.banner('📞 사업 전화', { color: '#9cff57', sub: b.name + ' 잠깐 통화 좀... (퇴장)', size: 110, life: 1.6 });
  FX.burst(b.x, b.y, '#5a5a7a', 30, 500, 16, 0.8, 'smoke'); FX.sfx('vanish');
  if (b.action && b.action.end) b.action.end();
  b.action = null; b.alive = false; b.deadAt = bt.time; b.leftCall = true;
  bt.emit('ripleyCall');
}
function ripleyTick(bt, b, dt) {
  var rc = CONFIG.chars.ripley;
  if (b.rip.glitch > 0) b.rip.glitch -= dt;
  b.rip.t -= dt;
  if (b.rip.t <= 0) { b.rip.t = rc.interval; ripleyTransform(bt, b, ripleyPick(b, bt)); }
}
function ripleyPhase2(bt, b) {
  b.rip.glitch = CONFIG.chars.ripley.glitchTime * 2;
  FX.banner('중증 리플리', { color: '#ff2bd6', size: 120, life: 1.3 });
  FX.flash('#00f0ff', 0.2, 0.2); FX.sfx('glitch');
}
// 글리치: 가로 줄무늬가 어긋나고 RGB가 갈라짐. 2페이즈에선 상시 지직거림
function ripleyGlitch(ctx, b, x, y, r) {
  var k = b.rip.glitch > 0 ? Math.min(1, b.rip.glitch / 0.3) : (b.phase >= 2 && Math.random() < 0.12 ? 0.5 : 0);
  if (!k) return;
  var key = b.def.portrait(b), col = b.color();
  ctx.save();
  for (var i = 0; i < 6; i++) {
    var sy = y - r + Math.random() * r * 2, sh = 5 + Math.random() * r * 0.3, dx = (Math.random() - 0.5) * r * 0.8 * k;
    ctx.save(); ctx.beginPath(); ctx.rect(x - r * 1.5, sy, r * 3, sh); ctx.clip();
    Assets.drawBall(ctx, b.def, key, x + dx, y, r, 0, col);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4 * k;
  ctx.fillStyle = '#00f0ff'; ctx.beginPath(); ctx.arc(x - 7 * k, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff2bd6'; ctx.beginPath(); ctx.arc(x + 7 * k, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function ripleyTag(ctx, b, x, y) {
  var txt = (b.rip.as ? '🎭 ' + CHARACTERS[b.rip.as].name : '🎭 정체불명') + ' · ' + Math.max(0, b.rip.t).toFixed(1) + 's';
  ctx.font = '700 22px "Malgun Gothic",sans-serif';
  var w = ctx.measureText(txt).width + 24;
  ctx.fillStyle = '#ff2bd6'; Battle.roundRect(ctx, x, y, w, 30, 15); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.fillText(txt, x + 12, y + 23);
}

// ---------- 이윤빈 ----------
// 전담: 이윤빈만 주울 수 있음. 못 찾는 동안 점점 강해지고, 찾으면 원래대로 (기억력 감퇴로 무시 가능)
class Vape {
  constructor(bt, owner, p) { this.bt = bt; this.owner = owner; this.x = p.x; this.y = p.y; this.t = 0; this.z = -1; this.r = 26; }
  update(dt) {
    var o = this.owner;
    this.t += dt;
    if (!o.alive || !_is(o, 'chino')) { this.dead = true; return; }
    if (Math.random() < dt * 3) FX.particle({ x: this.x + 10, y: this.y - 26, vx: _rnd(-10, 10), vy: _rnd(-50, -25), life: 1.2, size: _rnd(10, 18), color: '#e8e0ff', shape: 'smoke' });
    if (this.t < 0.4 || o.hidden || o.air) return;
    if (Math.hypot(o.x - this.x, o.y - this.y) > o.r + this.r) return;
    this.dead = true;
    chinoFound(this.bt, o, this);
  }
  draw(ctx) {
    var s = Math.min(1, this.t / 0.3), bob = Math.sin(this.t * 3) * 4;
    ctx.save(); ctx.translate(this.x, this.y + bob); ctx.scale(s, s); ctx.rotate(0.25);
    ctx.shadowColor = '#ff9ecf'; ctx.shadowBlur = 26;
    ctx.fillStyle = '#2a2a35'; Battle.roundRect(ctx, -12, -26, 24, 52, 10); ctx.fill();
    ctx.fillStyle = '#ff9ecf'; Battle.roundRect(ctx, -9, -36, 18, 14, 5); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = Math.sin(this.t * 5) > 0 ? '#7dffef' : '#2ab7a9';
    ctx.beginPath(); ctx.arc(0, 8, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 80 }; }
}
function chinoSpawnVape(bt, b) {
  var p = bt.randomPoint(70);
  for (var i = 0; i < 12; i++) {
    if (bt.balls.every(function (o) { return !o.alive || Math.hypot(o.x - p.x, o.y - p.y) > o.r + 120; })) break;
    p = bt.randomPoint(70);
  }
  bt.add(new Vape(bt, b, p));
  FX.ring(p.x, p.y, 10, 90, 0.4, '#ff9ecf', 8);
  bt.emit('vapeSpawn');
}
function chinoFound(bt, b, v) {
  var c = b.cfg, d = b.data;
  d.vapeRespawn = c.vape.respawn;
  FX.burst(v.x, v.y, '#e8e0ff', 24, 300, 20, 1.0, 'smoke');
  if (b.phase >= 2 && bt.time >= d.forgetVapeUntil) {   // 기억력 감퇴: 찾아도 까먹음
    d.forgetVapeUntil = bt.time + c.forget.vapeCd;
    bt.skillText(b, '어? 뭐 찾고 있었지?', '#b6ff00'); FX.sfx('glitch');
    bt.emit('forgetVape');
    return;
  }
  if (d.vapeF > 1) _scaleStats(b, 1 / d.vapeF);
  d.vapeF = 1;
  bt.skillText(b, '찾았다 내 전담!', '#ff9ecf'); FX.sfx('pickup');
  bt.emit('vapeFound');
}

// ---------- 서리 ----------
// 침 웅덩이 모음 (서리 1명당 하나). 밟은 적은 느려지고 도트 피해
class Drool {
  constructor(bt, owner) { this.bt = bt; this.owner = owner; this.pools = []; this.z = -2; this.tick = 0; this.drop = 0; }
  add(x, y, r, life) { this.pools.push({ x: x, y: y, r: r, life: life, t: 0, rot: _rnd(0, 6) }); }
  update(dt) {
    var o = this.owner, c = o.cfg.drool, self = this;
    if (!o.alive || !_is(o, 'seori')) { this.dead = true; return; }
    this.pools.forEach(function (p) { p.t += dt; });
    this.pools = this.pools.filter(function (p) { return p.t < p.life; });
    if (!o.hidden && !o.air) {
      this.drop += dt;
      var every = c.every / (this.bt.hasSynergy('dogowner', o.team) && o.def.name === '서리' ? CONFIG.synergy.dogowner.droolRate : 1);   // 개와 주인: 더 자주
      if (this.drop >= every) { this.drop = 0; this.add(o.x + _rnd(-12, 12), o.y + _rnd(-12, 12), c.r * _rnd(0.8, 1.15), c.life); }
    }
    this.tick += dt;
    if (this.tick < 0.4999) return;
    this.tick -= 0.5;
    this.bt.enemies(o).forEach(function (e) {
      if (!e.targetable || e.air) return;
      if (!self.pools.some(function (p) { return Math.hypot(e.x - p.x, e.y - p.y) < p.r + e.r * 0.5; })) return;
      self.bt.damage(e, c.dps * 0.5, o, { dot: true, color: '#bfe9ff', kind: 'drool' });
      var st = e.status;
      st.slowMul = st.slow > 0 ? Math.min(st.slowMul, c.slowMul) : c.slowMul;
      st.slow = Math.max(st.slow, 0.6);
      if (Math.random() < 0.3) FX.text(e.x, e.y - e.r - 40, '끈적', '#bfe9ff', 34, 0.5);
      self.bt.emit('droolHit', { who: e.def.id });
    });
  }
  draw(ctx) {
    ctx.save();
    this.pools.forEach(function (p) {
      var a = Math.min(1, (p.life - p.t) / 0.8) * Math.min(1, p.t / 0.15);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(170,225,255,0.2)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.8, p.rot, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.25, p.r * 0.22, p.r * 0.12, -0.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }
}
function seoriDrool(bt, b) {
  return bt.ents.find(function (e) { return e instanceof Drool && e.owner === b && !e.dead; }) || bt.add(new Drool(bt, b));
}
// 물기: 짧게 돌격 → 물면 hold초 매달려서 연속 피해 + 큰 침
function seoriBite(bt, b) {
  var c = b.cfg.bite, t = bt.nearest(b);
  if (!t) return null;
  var p = bt.aim(b, t.x, t.y), dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
  var keep = { vx: b.vx, vy: b.vy }, st = 'dash', time = 0, held = null, ang = 0, tk = 0, gt = 0, dr = seoriDrool(bt, b);
  b.vx = dx / d * c.dashSpeed; b.vy = dy / d * c.dashSpeed;
  bt.skillText(b, '왈!', '#e8b46a'); FX.sfx('roll');
  return {
    moves: false,
    update: function (dt) {
      time += dt;
      if (st === 'dash') {
        b.x += b.vx * dt; b.y += b.vy * dt; bt.walls(b);
        gt += dt; if (gt > 0.03) { gt = 0; _ghost(b); }
        held = bt.enemies(b).find(function (o) { return o.targetable && !o.air && _dist(o, b) < o.r + b.r + 6; }) || null;
        if (!held) return time >= c.dashTime;
        // 물 때는 일반 충돌로 처리: 서로 기본 박치기 피해(+접촉 효과)를 주고받음
        bt.contact(b, held, (b.x + held.x) / 2, (b.y + held.y) / 2);
        if (!b.alive || !held.alive) { held = null; return true; }
        st = 'hold'; time = 0; b.phasing = true;
        ang = Math.atan2(b.y - held.y, b.x - held.x);
        bt.damage(held, c.damage, b, { color: '#ffd9a0' });
        bt.skillText(b, '앙!', '#ff7ab6'); FX.sfx('bite'); FX.shake(10);
        bt.emit('bite', { who: held.def.id });
        return false;
      }
      if (!held.alive || held.hidden) return true;
      ang += dt * 3;
      b.x = held.x + Math.cos(ang) * (held.r + b.r * 0.55); b.y = held.y + Math.sin(ang) * (held.r + b.r * 0.55);
      b.jx = _rnd(-4, 4); b.jy = _rnd(-4, 4);
      held.status.slowMul = c.holdSlow; held.status.slow = Math.max(held.status.slow, 0.15);
      tk += dt;
      if (tk >= c.tick) {
        tk -= c.tick;
        bt.damage(held, c.tickDamage, b, { color: '#ffd9a0' });
        var a = _rnd(0, Math.PI * 2);
        dr.add(held.x + Math.cos(a) * 40, held.y + Math.sin(a) * 40, c.bigR * _rnd(0.85, 1.15), b.cfg.drool.life);
        FX.burst(held.x, held.y, '#bfe9ff', 12, 400, 9, 0.5); FX.sfx('drool');
        bt.emit('bigDrool');
      }
      return time >= c.hold;
    },
    end: function () {
      b.phasing = false; b.jx = b.jy = 0;
      if (held) _restoreSpeed(b, b.x - held.x, b.y - held.y); else _restoreSpeed(b, keep.vx, keep.vy);
    },
  };
}

// ---------- 차승민 ----------
// 강펀치: 사다리꼴 범위 (가까운 쪽 좁고 먼 쪽 넓음). charge초 동안 범위 표시 → 한 번에 타격
//   가운데(정타)일수록 피해 x centerMul, 가장자리일수록 x edgeMul. 받은 피해에 비례해 세지고 커짐
function _punchShape(c, k) { return { L: c.length * k, nw: c.near * k / 2, fw: c.far * k / 2 }; }
class Punch {
  constructor(bt, owner, ang, power, scale, c) {
    this.bt = bt; this.owner = owner; this.ang = ang; this.power = power; this.k = scale; this.c = c;
    this.x = owner.x; this.y = owner.y; this.r0 = owner.r * 0.6; this.t = 0; this.fired = false; this.z = 1;
    this.debris = [];
  }
  update(dt) {
    var self = this, c = this.c, sh = _punchShape(c, this.k), ca = Math.cos(this.ang), sa = Math.sin(this.ang), bt = this.bt;
    this.t += dt;
    if (!this.fired && this.t >= c.charge) {
      this.fired = true;
      bt.enemies(this.owner).forEach(function (e) {
        if (!e.targetable || e.air) return;
        var px = e.x - self.x, py = e.y - self.y, u = px * ca + py * sa, v = -px * sa + py * ca;
        if (u < self.r0 - e.r || u > self.r0 + sh.L + e.r * 0.5) return;
        var f = Math.max(0, Math.min(1, (u - self.r0) / sh.L)), half = sh.nw + (sh.fw - sh.nw) * f;
        if (Math.abs(v) > half + e.r * 0.6) return;
        var edge = Math.min(1, Math.abs(v) / half), mult = c.centerMul + (c.edgeMul - c.centerMul) * edge;
        var dmg = self.power * mult, center = edge < c.center;
        bt.damage(e, dmg, self.owner, { color: center ? '#ffffff' : '#ffcc00', kind: 'punch' });
        e.vx += ca * (center ? 1300 : 700); e.vy += sa * (center ? 1300 : 700);
        if (center) { FX.text(e.x, e.y - e.r - 70, '정타!', '#ffffff', 54, 0.9); e.status.stun = Math.max(e.status.stun, 0.3); }
        FX.burst(e.x, e.y, center ? '#ffffff' : '#ffcc00', 24, 900, 10, 0.5, 'spark');
        bt.emit('punchHit', { who: e.def.id, amt: dmg, center: center });
      });
      // 바닥이 깨지며 파편
      for (var i = 0; i < 26; i++) {
        var fu = _rnd(0.1, 1), fv = _rnd(-1, 1) * (sh.nw + (sh.fw - sh.nw) * fu), du = this.r0 + sh.L * fu;
        FX.particle({ x: this.x + ca * du - sa * fv, y: this.y + sa * du + ca * fv, vx: ca * _rnd(200, 700) + _rnd(-120, 120), vy: sa * _rnd(200, 700) + _rnd(-120, 120), drag: 0.9, life: _rnd(0.4, 0.8), size: _rnd(6, 14), color: i % 3 ? '#ffcc00' : '#ffffff', shape: 'shard' });
      }
      FX.shake(18 + this.power * 0.5); FX.flash('#ffcc00', 0.18, 0.18); FX.sfx('punch'); FX.sfx('slam');
      bt.emit('punchFire', { power: this.power });
    }
    if (this.t >= c.charge + c.fade) this.dead = true;
  }
  draw(ctx) {
    var c = this.c, sh = _punchShape(c, this.k), r0 = this.r0, t = this.t;
    function trap(len, wMul) {
      var f = len / sh.L, w1 = (sh.nw + (sh.fw - sh.nw) * f) * wMul;
      ctx.beginPath(); ctx.moveTo(r0, -sh.nw * wMul); ctx.lineTo(r0 + len, -w1); ctx.lineTo(r0 + len, w1); ctx.lineTo(r0, sh.nw * wMul); ctx.closePath();
    }
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.ang);
    if (!this.fired) {
      // 기 모으기: 범위 테두리 + 안쪽이 앞쪽으로 차오름, 가운데 정타 줄은 더 밝게
      var p = Math.min(1, t / c.charge);
      ctx.setLineDash([16, 10]); ctx.lineDashOffset = -t * 120; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,204,0,0.85)';
      trap(sh.L, 1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,170,0,' + (0.15 + p * 0.2) + ')'; trap(sh.L * p, 1); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + p * 0.35) + ')'; trap(sh.L * p, c.center); ctx.fill();
      ctx.font = Math.round(50 + p * 40) + 'px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(r0 + 10, 0); ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.6 + p * 0.4; ctx.fillText('👊', _rnd(-3, 3), _rnd(-3, 3)); ctx.restore();
    } else {
      // 타격: 범위 전체가 번쩍, 정타 줄은 하얗게, 주먹이 끝까지 날아감
      var q = (t - c.charge) / c.fade, a = Math.max(0, 1 - q);
      ctx.globalAlpha = a; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 50;
      var g = ctx.createLinearGradient(r0, 0, r0 + sh.L, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(255,190,40,0.75)'); g.addColorStop(1, 'rgba(255,90,30,0.4)');
      ctx.fillStyle = g; trap(sh.L, 1); ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = '#ffcc00'; ctx.stroke();
      ctx.fillStyle = '#ffffff'; trap(sh.L, c.center); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 3;   // 바닥 금
      for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(r0 + sh.L * 0.85, i * sh.fw * 0.3); ctx.lineTo(r0 + sh.L * 1.02, i * sh.fw * 0.42); ctx.lineTo(r0 + sh.L * 1.08, i * sh.fw * 0.36); ctx.stroke(); }
      ctx.font = Math.round(90 * this.k) + 'px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(r0 + sh.L * Math.min(1, q * 2.2), 0); ctx.rotate(Math.PI / 2); ctx.fillText('👊', 0, 0); ctx.restore();
    }
    ctx.restore();
  }
  light() { return { x: this.x + Math.cos(this.ang) * 250, y: this.y + Math.sin(this.ang) * 250, r: 350 }; }
}
function _seyuPower(b) { var c = b.cfg.punch; return Math.min(c.max, c.base + b.data.takenSince * c.perTaken); }
function _seyuScale(b, power) { var c = b.cfg.punch; return 1 + (power - c.base) / (c.max - c.base) * c.grow; }
// 준비된 강펀치 범위 안에 들어온 적 (가장 가까운)
function seyuInRange(bt, b) {
  var c = b.cfg.punch, sh = _punchShape(c, _seyuScale(b, _seyuPower(b))), best = null, bd = Infinity;
  bt.enemies(b).forEach(function (o) {
    if (!o.targetable || o.air) return;
    var d = _dist(o, b);
    if (d <= b.r * 0.6 + sh.L * 0.9 + o.r * 0.5 && d < bd) { bd = d; best = o; }
  });
  return best;
}
function seyuPunch(bt, b, t) {
  var c = b.cfg.punch, p = bt.aim(b, t.x, t.y), power = _seyuPower(b), k = _seyuScale(b, power);
  b.data.takenSince = 0; b.data.punchReady = false;
  bt.add(new Punch(bt, b, Math.atan2(p.y - b.y, p.x - b.x), power, k, c));
  bt.skillText(b, '강펀치 ' + Math.round(power) + '!', '#ffcc00'); FX.sfx('laserCharge');
  if (power >= c.max * 0.7) FX.banner('강펀치', { color: '#ffcc00', size: 120, life: 0.9 });
  bt.emit('punch', { power: power });
  var keep = { vx: b.vx, vy: b.vy }, time = 0;
  b.vx = b.vy = 0;
  return {
    moves: false, uninterruptible: true,
    update: function (dt) { time += dt; b.jx = time < c.charge ? _rnd(-3, 3) : 0; b.jy = time < c.charge ? _rnd(-3, 3) : 0; return time >= c.charge + 0.12; },
    end: function () { b.jx = b.jy = 0; _restoreSpeed(b, keep.vx, keep.vy); },
  };
}

// ---------- 최휘 ----------
function _hauMul(b) { var a = b.cfg.account; return a.poorMul + (a.richMul - a.poorMul) * b.data.bal / a.max; }
function hauSet(bt, b, v, why) {
  var a = b.cfg.account, d = b.data;
  d.bal = Math.max(0, Math.min(a.max, v));
  if (d.bal >= a.max && d.crashT < 0) {   // 잔고 MAX → 몇 초 뒤 사고
    d.crashT = a.crashDelay;
    FX.text(b.x, b.y - b.r - 60, '잔고 MAX... 불안하다', '#ffd400', 40, 1.0);
    bt.emit('hauMax');
  }
  if (d.bal <= 0 && !d.broke) {
    d.broke = true;
    bt.skillText(b, '파산...!', '#ff3b3b');
    bt.emit('hauBroke');
  }
}
// 주식 한 칸 움직이기. 떨어지면 범위 공격 (mult: 급락 구간 배율)
function hauStock(bt, b, up, mult) {
  var c = b.cfg.stock, d = b.data, last = d.chart[d.chart.length - 1];
  var mv = (up ? 1 : -1) * c.step * (mult || 1);
  d.chart.push(Math.max(5, last + mv * _rnd(0.8, 1.3))); if (d.chart.length > 24) d.chart.shift();
  d.lastUp = up;
  hauSet(bt, b, d.bal + mv);
  if (up) {
    FX.text(b.x, b.y - b.r - 50, '떡상! +' + Math.round(mv) + '만', '#ff3b3b', 46, 0.9); FX.sfx('stockUp');
    bt.emit('stockUp');
    return;
  }
  var k = mult || 1, R = c.radius * (k > 1 ? 1.25 : 1), ctr = bt.aimArea(b, b.x, b.y);
  FX.text(b.x, b.y - b.r - 50, (k > 1 ? '급락!! ' : '떡락... ') + Math.round(mv) + '만', '#3b8bff', 50, 1.0);
  FX.sfx(k > 1 ? 'crash' : 'stockDown'); FX.shake(k > 1 ? 24 : 12);
  for (var i = 0; i < 3; i++) FX.ring(ctr.x, ctr.y, b.r, R * (1 + i * 0.08), 0.45 + i * 0.12, i % 2 ? '#ffffff' : '#3b8bff', 14 - i * 3);
  for (var j = 0; j < 8; j++) FX.text(ctr.x + _rnd(-R, R) * 0.7, ctr.y + _rnd(-R, R) * 0.7, '📉', '#3b8bff', 40, 0.7);
  bt.enemies(b).forEach(function (o) {
    if (!o.targetable || o.air || _dist(o, ctr) > R + o.r * 0.5) return;
    bt.damage(o, c.damage * (k > 1 ? b.cfg.plunge.crashMul : 1), b, { color: '#7fb3ff' });
    bt.emit('stockHit', { who: o.def.id });
  });
  bt.emit('stockDown', { mult: k });
}
function hauChart(ctx, b, bt, x, y, w, h) {
  var d = b.data, a = b.cfg.account, pts = d.chart, mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), col = d.lastUp ? '#ff3b3b' : '#3b8bff';
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,20,0.78)'; Battle.roundRect(ctx, x, y, w, h, 14); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = '700 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
  ctx.fillText(b.name + ' 계좌 ' + Math.round(d.bal) + '만원', x + 12, y + 26);
  ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.fillText(d.lastUp ? '▲' : '▼', x + w - 12, y + 26);
  var gx = x + 12, gy = y + 38, gw = w - 24, gh = h - 62, rng = Math.max(1, mx - mn);
  ctx.beginPath();
  pts.forEach(function (v, i) { var px = gx + gw * i / Math.max(1, pts.length - 1), py = gy + gh * (1 - (v - mn) / rng); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
  // 잔고 바
  ctx.fillStyle = '#1b1530'; Battle.roundRect(ctx, gx, y + h - 18, gw, 10, 5); ctx.fill();
  ctx.fillStyle = d.crashT >= 0 && Math.sin(bt.time * 20) > 0 ? '#ff3b3b' : '#ffd400';
  Battle.roundRect(ctx, gx, y + h - 18, gw * d.bal / a.max, 10, 5); ctx.fill();
  ctx.restore();
}

// 파산 박치기 연출: 지폐·동전이 터지고 빨강→금색 섬광, 겹 충격파
function hauBankruptFX(bt, s, t, dmg) {
  var px = (s.x + t.x) / 2, py = (s.y + t.y) / 2, i;
  FX.banner('파산 박치기!!', { color: '#ffd400', sub: '잔고 0원 · 전 재산 박치기', size: 150, life: 1.6, y: CONFIG.arena.y + 200 });
  FX.flash('#ff3b3b', 0.45, 0.2);
  bt.after(0.12, function () { FX.flash('#ffd400', 0.35, 0.3); });
  FX.shake(45); bt.hitstop = Math.max(bt.hitstop, 0.22);
  FX.sfx('crash'); FX.sfx('bigHit');
  for (i = 0; i < 6; i++) bt.after(0.05 + i * 0.06, function () { FX.sfx('coin'); });
  for (i = 0; i < 5; i++) FX.ring(px, py, 20, 260 + i * 110, 0.45 + i * 0.12, ['#ff3b3b', '#ffd400', '#ffffff', '#57d36b', '#ffd400'][i], 22 - i * 3);
  // 지폐: 빙글빙글 돌며 흩날림
  for (i = 0; i < 34; i++) {
    var a = Math.random() * Math.PI * 2, v = _rnd(700, 1700);
    FX.particle({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 400, g: 1100, drag: 0.975, life: _rnd(1.0, 1.8), size: 0,
      color: '#57d36b', shape: 'custom', rot: Math.random() * 6, vr: _rnd(-12, 12),
      draw: function (ctx, x, y, k, p) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2);
        ctx.fillStyle = '#6fdc7a'; ctx.fillRect(-26, -13, 52, 26);
        ctx.strokeStyle = '#2e8b3d'; ctx.lineWidth = 3; ctx.strokeRect(-22, -9, 44, 18);
        ctx.fillStyle = '#1f5f2a'; ctx.font = '700 18px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('₩', 0, 1);
        ctx.restore();
      } });
  }
  // 동전 소나기 + 불꽃
  FX.burst(px, py, '#ffd400', 40, 1400, 10, 0.8, 'spark');
  FX.burst(px, py, '#ffe066', 26, 900, 12, 1.0, 'square', { g: 1200 });
  FX.burst(px, py, '#ff3b3b', 20, 700, 18, 0.7, 'smoke');
  ['💸', '💰', '🪙', '📉', '💸', '💰'].forEach(function (e, k) {
    var a = k / 6 * Math.PI * 2;
    FX.text(px + Math.cos(a) * 140, py + Math.sin(a) * 110, e, '#ffffff', 64, 1.1);
  });
  FX.text(t.x, t.y - t.r - 90, '-' + Math.round(dmg) + ' 파산!', '#ffd400', 78, 1.3);
}

// ---------- 유재후 (노광석) ----------
// 핫식스 포도맛: 같은 팀(본인 포함)이 먹으면 공격력·이속 영구 증가, 적이 먹으면 공격력 영구 감소 (각각 maxStacks번까지)
class Hot6 {
  constructor(bt, owner, p) { this.bt = bt; this.owner = owner; this.x = p.x; this.y = p.y; this.t = 0; this.z = -1; this.r = 26; }
  update(dt) {
    var o = this.owner, self = this, bt = this.bt, c = o.cfg.hot6;
    this.t += dt;
    if (!o.alive || !_is(o, 'nogwang')) { this.dead = true; FX.burst(this.x, this.y, '#9b5cff', 10, 300, 6, 0.4); return; }
    if (this.t < 0.4) return;
    var e = bt.balls.find(function (b) { return b.alive && !b.hidden && !b.air && !b.isBoss && Math.hypot(b.x - self.x, b.y - self.y) < b.r + self.r; });   // 보스는 못 먹음
    if (!e) return;
    this.dead = true;
    var h = e.hot6 || (e.hot6 = { up: 0, down: 0 });
    if (e.team === o.team) {
      if (h.up < c.maxStacks) { h.up++; e.dmgMult *= c.allyAtk; e.speed *= c.allySpeed; }
      FX.text(e.x, e.y - e.r - 50, '핫식스 충전! 🍇', '#c79bff', 44, 0.9); FX.sfx('powerup');
      FX.burst(e.x, e.y, '#9b5cff', 20, 600, 9, 0.5);
      bt.emit('hot6Ally', { who: e.def.id, n: h.up });
    } else {
      if (h.down < c.maxStacks) { h.down++; e.dmgMult *= c.enemyAtk; }
      FX.text(e.x, e.y - e.r - 50, '카페인 크래시... 공격력↓', '#ff6b8a', 40, 0.9); FX.sfx('stockDown');
      bt.emit('hot6Enemy', { who: e.def.id, n: h.down });
    }
  }
  draw(ctx) {
    var s = Math.min(1, this.t / 0.3), bob = Math.sin(this.t * 4) * 4;
    ctx.save(); ctx.translate(this.x, this.y + bob); ctx.scale(s, s); ctx.rotate(-0.15);
    ctx.shadowColor = '#b07cff'; ctx.shadowBlur = 24;
    ctx.fillStyle = '#5a1f9a'; Battle.roundRect(ctx, -16, -28, 32, 56, 7); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#c0c0d0'; ctx.fillRect(-14, -31, 28, 5); ctx.fillRect(-14, 26, 28, 4);
    ctx.fillStyle = '#ff2b6a'; ctx.fillRect(-16, -12, 32, 14);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 12px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('HOT6', 0, -5);
    ctx.fillStyle = '#d6a8ff'; ctx.beginPath(); ctx.arc(-5, 13, 4, 0, 7); ctx.arc(4, 13, 4, 0, 7); ctx.arc(0, 19, 4, 0, 7); ctx.fill();
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 80 }; }
}
function nogwangSpawn(bt, b) {
  var c = b.cfg.hot6;
  if (bt.ents.filter(function (e) { return e instanceof Hot6 && e.owner === b && !e.dead; }).length >= c.max) return;
  var p = bt.randomPoint(70);
  for (var i = 0; i < 12; i++) {
    if (bt.balls.every(function (o) { return !o.alive || Math.hypot(o.x - p.x, o.y - p.y) > o.r + 90; })) break;
    p = bt.randomPoint(70);
  }
  bt.add(new Hot6(bt, b, p));
  FX.ring(p.x, p.y, 10, 90, 0.4, '#9b5cff', 8); FX.sfx('pickup');
  bt.emit('hot6Spawn');
}
function _isIzk(o) { return CONFIG.synergy.izk.members.indexOf(o.def.name) >= 0; }
// 포코의 불협화음: 진행 방향 부채꼴로 퍼지는 기타 파동 (적마다 1회, 큰 넉백)
class GuitarWave {
  constructor(bt, owner, ang, c) { this.bt = bt; this.owner = owner; this.x = owner.x; this.y = owner.y; this.ang = ang; this.c = c; this.r = owner.r; this.hit = new Set(); this.z = 1; this.t = 0; }
  update(dt) {
    var self = this, c = this.c, half = c.angle * Math.PI / 180;
    this.t += dt; this.r += 1500 * dt;
    this.bt.enemies(this.owner).forEach(function (e) {
      if (self.hit.has(e) || !e.targetable || e.air) return;
      var d = Math.hypot(e.x - self.x, e.y - self.y);
      if (d > Math.min(self.r, c.radius) + e.r * 0.5) return;
      var da = Math.atan2(e.y - self.y, e.x - self.x) - self.ang;
      if (Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) > half + e.r / Math.max(d, 1)) return;
      self.hit.add(e);
      var izk = _isIzk(e);
      self.bt.damage(e, c.damage * (izk ? c.izkMul : 1), self.owner, { color: '#d6a8ff' });
      var k = c.knock / Math.max(1, d);
      e.vx += (e.x - self.x) * k; e.vy += (e.y - self.y) * k;
      if (izk) FX.text(e.x, e.y - e.r - 60, 'IZK 불협화음 x' + c.izkMul, '#ffe14d', 40, 0.9);
      self.bt.emit('pocoHit', { who: e.def.id, izk: izk });
    });
    // 같은 팀: 음파에 밀려나며 회복 (팀원마다 1회)
    this.bt.allies(this.owner).forEach(function (e) {
      if (self.hit.has(e) || !e.targetable || e.air) return;
      var d = Math.hypot(e.x - self.x, e.y - self.y);
      if (d > Math.min(self.r, c.radius) + e.r * 0.5) return;
      var da = Math.atan2(e.y - self.y, e.x - self.x) - self.ang;
      if (Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) > half + e.r / Math.max(d, 1)) return;
      self.hit.add(e);
      self.bt.heal(e, c.allyHeal);
      var k = c.allyKnock / Math.max(1, d);
      e.vx += (e.x - self.x) * k; e.vy += (e.y - self.y) * k;
      FX.text(e.x, e.y - e.r - 60, '♪ 힐링 사운드', '#c79bff', 36, 0.8);
      self.bt.emit('pocoAlly', { who: e.def.id });
    });
    if (this.r >= c.radius) this.dead = true;
  }
  draw(ctx) {
    var c = this.c, half = c.angle * Math.PI / 180, f = Math.min(1, this.r / c.radius);
    ctx.save(); ctx.globalAlpha = 1 - f * 0.7; ctx.shadowColor = '#b07cff'; ctx.shadowBlur = 30; ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var rr = this.r - i * 55;
      if (rr < this.owner.r) continue;
      ctx.strokeStyle = i % 2 ? '#ffffff' : '#9b5cff'; ctx.lineWidth = 18 - i * 5;
      ctx.beginPath(); ctx.arc(this.x, this.y, rr, this.ang - half, this.ang + half); ctx.stroke();
    }
    ctx.globalAlpha = 0.12 * (1 - f); ctx.fillStyle = '#9b5cff';
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.arc(this.x, this.y, this.r, this.ang - half, this.ang + half); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  light() { return { x: this.x + Math.cos(this.ang) * this.r * 0.6, y: this.y + Math.sin(this.ang) * this.r * 0.6, r: this.r * 0.7 + 60 }; }
}
function nogwangPoco(bt, b) {
  // 가장 가까운 적 쪽으로 몸을 틀어서 그 방향(=진행 방향)으로 연주
  var c = b.cfg.poco, t = bt.nearest(b), sp = Math.hypot(b.vx, b.vy) || b.speed;
  if (bt.hasSynergy('jeongbalsan', b.team)) {   // 정발산: 노광석 범위·회복량 증가
    var J = CONFIG.synergy.jeongbalsan;
    c = Object.assign({}, c, { radius: c.radius * J.nogwangRange, angle: c.angle * 1.15, allyHeal: c.allyHeal * J.nogwangHeal });
  }
  var ang = t ? Math.atan2(t.y - b.y, t.x - b.x) : Math.atan2(b.vy, b.vx);
  b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
  if (bt.blindRoll(b)) ang = _rnd(0, Math.PI * 2);   // 실명: 엉뚱한 방향
  bt.add(new GuitarWave(bt, b, ang, c));
  bt.skillText(b, '포코의 불협화음', '#c79bff'); FX.sfx('guitar'); FX.shake(c.shake);
  ['♪', '♬', '🎸'].forEach(function (n, i) { FX.text(b.x + Math.cos(ang + (i - 1) * 0.4) * b.r * 1.5, b.y + Math.sin(ang + (i - 1) * 0.4) * b.r * 1.5, n, '#d6a8ff', 54, 0.8); });
  bt.emit('poco');
  return null;
}

// ---------- 김선율 (김선율의 모습) ----------
var SY_JOKES = [
  '아플때 죽을 먹는 이유는? Sick은 죽 먹기니까~', '왕이 넘어지면? 킹콩~', '한규성 말고 두규성~', '진형권 말고 이긴형권~',
  '유재후 말고 유재전~', '조하람 말고 조상람~', '조우연 말고 조필연~', '문남휘 말고 문아는사람휘~', '이윤빈 말고 이윤찬~',
  '오리가 얼면? 언덕~', '바람이 귀엽게 부는 곳은? 분당~', '소가 계단을 올라가면? 소오름~', '세유가 지면 약해유~',
];
// 드립에 그 사람 이름(또는 모습 이름)이 나오면 관련 드립
function _jokeHits(text, o) {
  var keys = [o.def.name, (o.def.sub || '').replace(/의 모습$/, '')];
  return keys.some(function (k) { return k.length >= 2 && k !== '???' && text.indexOf(k) >= 0; });
}
class Joke {
  constructor(bt, owner, ang, c) {
    this.bt = bt; this.owner = owner; this.c = c; this.x = owner.x; this.y = owner.y; this.ang = ang; this.z = 2; this.t = 0;
    this.text = SY_JOKES[Math.floor(Math.random() * SY_JOKES.length)]; this.col = ['#00e5ff', '#ffe14d', '#ff7ad9', '#7dff9a'][Math.floor(Math.random() * 4)];
  }
  update(dt) {
    var A = CONFIG.arena, self = this, c = this.c;
    this.t += dt;
    this.x += Math.cos(this.ang) * c.speed * dt; this.y += Math.sin(this.ang) * c.speed * dt;
    var hit = this.t > 0.08 && this.bt.enemies(this.owner).some(function (o) { return o.targetable && !o.air && _dist(o, self) < o.r + 34; });
    var out = this.x < A.x + 10 || this.x > A.x + A.w - 10 || this.y < A.y + 10 || this.y > A.y + A.h - 10;
    if (hit || out) this.boom();
  }
  boom() {
    var self = this, c = this.c, bt = this.bt;
    this.dead = true;
    FX.burst(this.x, this.y, this.col, 22, 800, 10, 0.5, 'spark');
    FX.ring(this.x, this.y, 10, c.radius, 0.35, this.col, 10);
    FX.shake(c.shake);
    bt.enemies(this.owner).forEach(function (o) {
      if (!o.targetable || o.air || _dist(o, self) > c.radius + o.r * 0.5) return;
      var rel = _jokeHits(self.text, o);
      bt.damage(o, c.damage * (rel ? c.relatedMul : 1), self.owner, { color: self.col });
      if (rel) FX.text(o.x, o.y - o.r - 60, '찔림 x' + c.relatedMul, '#ff2b6a', 46, 0.9);
      bt.emit('jokeHit', { who: o.def.id, related: rel, text: self.text });
    });
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.sin(this.t * 10) * 0.08);
    FX.outlined(ctx, this.text, 0, 0, 30, this.col);
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 120 }; }
}
// 방구석 여포: 체력 0 → 구석으로 가서 키보드 꺼냄 → 부활해서 구석 고정 + 드립 난사
function syYeopo(bt, b) {
  var c = b.cfg.yeopo, A = CONFIG.arena, m = b.r + 14, d = b.data;
  var corners = [{ x: A.x + m, y: A.y + m }, { x: A.x + A.w - m, y: A.y + m }, { x: A.x + m, y: A.y + A.h - m }, { x: A.x + A.w - m, y: A.y + A.h - m }];
  var cn = corners[Math.floor(Math.random() * corners.length)], from = { x: b.x, y: b.y }, t = 0, fire = 0, typing = false;
  d.corner = cn; d.base = Math.atan2(A.y + A.h / 2 - cn.y, A.x + A.w / 2 - cn.x);
  FX.banner('방구석 여포', { color: '#00e5ff', sub: b.name + ' 키보드 꺼내는 중...', size: 130, life: 1.6 });
  FX.sfx('vanish');
  bt.emit('yeopo');
  return {
    moves: false, uninterruptible: true,
    update: function (dt) {
      t += dt;
      if (!typing) {
        var k = Math.min(1, t / (c.cutscene * 0.5)), e = 1 - (1 - k) * (1 - k);
        b.x = from.x + (cn.x - from.x) * e; b.y = from.y + (cn.y - from.y) * e; b.vx = b.vy = 0;
        if (k >= 1 && Math.random() < dt * 8) FX.text(b.x + _rnd(-40, 40), b.y - b.r - 30, '⌨️', '#ffffff', 40, 0.4);
        if (t >= c.cutscene) {
          typing = true; d.keyboard = true;
          b.invuln = false; b.phasing = false;
          b.hp = b.hpShown = c.reviveHp;
          bt.enterPhase2(b);
        }
        return false;
      }
      b.x = cn.x; b.y = cn.y; b.vx = b.vy = 0;   // 구석 고정
      if (b.disabled) return false;
      fire += dt;
      if (fire >= c.every) {
        fire -= c.every;
        bt.add(new Joke(bt, b, d.base + _rnd(-0.85, 0.85), c));
        FX.sfx('type');
        bt.emit('joke');
      }
      return false;
    },
  };
}
function syShy(bt, b) {
  var c = b.cfg.shy, t = 0, gone = false;
  FX.burst(b.x, b.y, '#ff8fb1', 16, 400, 14, 0.5, 'smoke'); FX.sfx('shy');
  FX.text(b.x, b.y - b.r - 40, '(낯가림)', '#ff8fb1', 40, 0.8);
  b.hidden = true; gone = true;
  bt.emit('shy');
  return {
    moves: false,
    update: function (dt) {
      t += dt;
      if (t < c.vanish) return false;
      // 가장 가까운 적의 바로 앞(진행 방향)에서 등장
      var e = bt.nearest(b), A = CONFIG.arena;
      if (e) {
        var sp = Math.hypot(e.vx, e.vy), dx = sp > 5 ? e.vx / sp : (A.x + A.w / 2 - e.x), dy = sp > 5 ? e.vy / sp : (A.y + A.h / 2 - e.y), dl = Math.hypot(dx, dy) || 1;
        var p = bt.clampPoint({ x: e.x + dx / dl * (e.r + b.r + 10), y: e.y + dy / dl * (e.r + b.r + 10) }, b.r + 4);
        b.x = p.x; b.y = p.y; b.vx = -dx / dl; b.vy = -dy / dl;
      } else { var q = bt.randomPoint(b.r + 10); b.x = q.x; b.y = q.y; }
      b.hidden = false; gone = false;
      FX.burst(b.x, b.y, '#ff8fb1', 14, 400, 10, 0.4);
      if (e) {
        bt.damage(e, c.damage, b, { color: '#ff8fb1' });
        var x0 = b.x, y0 = b.y, x1 = e.x, y1 = e.y;
        FX.particle({ x: 0, y: 0, vx: 0, vy: 0, life: 0.3, size: 0, color: '#ff8fb1', shape: 'custom',
          draw: function (ctx) { ctx.strokeStyle = '#ff8fb1'; ctx.lineWidth = 6; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); } });
        FX.text(b.x, b.y - b.r - 40, '...안녕하세요', '#ffffff', 40, 0.8);
        bt.emit('shyHit', { who: e.def.id });
      }
      return true;
    },
    end: function () { if (gone) b.hidden = false; _restoreSpeed(b, b.vx, b.vy); },
  };
}

// ---------- 문남휘 (이장님) ----------
// 웰우스 필드: 이장님 스킬이 켜져 있는 동안 경기장 전체에 씌워지는 이펙트 (1: 초록 회복, 2: 갈색 대청소)
class WellusField {
  constructor(bt, owner) { this.bt = bt; this.owner = owner; this.z = -3; this.t = 0; this.a = 0; this.started = false; this.ph = 1; this.wave = -1; this.motes = []; }
  update(dt) {
    var o = this.owner, A = CONFIG.arena;
    this.t += dt;
    if (!o.alive || !_is(o, 'chief')) { this.a -= dt; if (this.a <= 0) this.dead = true; return; }
    this.a = Math.min(1, this.a + dt * 1.5);
    if (!this.started) { this.started = true; this.wave = 0; FX.banner('웰우스 개방', { color: '#7dff9a', size: 110, life: 1.3, y: A.y + 200 }); FX.sfx('heal'); }
    if (o.phase >= 2 && this.ph < 2) { this.ph = 2; this.wave = 0; }
    if (this.wave >= 0) { this.wave += dt * 1400; if (this.wave > 2200) this.wave = -1; }
    if (Math.random() < dt * 22) this.motes.push({ x: _rnd(A.x, A.x + A.w), y: A.y + A.h + 10, v: _rnd(40, 110), s: _rnd(10, 22), w: _rnd(0, 6), t: 0 });
    this.motes.forEach(function (m) { m.t += dt; m.y -= m.v * dt; m.x += Math.sin(m.t * 2 + m.w) * 20 * dt; });
    this.motes = this.motes.filter(function (m) { return m.y > A.y - 20; });
  }
  draw(ctx) {
    if (this.bt.ents.find(function (e) { return e instanceof WellusField && !e.dead; }) !== this) return;   // 이장님 여럿이어도 한 겹만
    var A = CONFIG.arena, o = this.owner, two = this.ph >= 2, col = two ? '200,150,90' : '110,255,150', a = this.a, t = this.t;
    ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
    ctx.fillStyle = 'rgba(' + col + ',' + (0.13 + Math.sin(t * 2) * 0.03) * a + ')'; ctx.fillRect(A.x, A.y, A.w, A.h);
    var g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 520);
    g.addColorStop(0, 'rgba(' + col + ',' + 0.24 * a + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.fillRect(A.x, A.y, A.w, A.h);
    if (two) {   // 대청소: 비스듬히 쓸고 지나가는 빗자루 자국
      ctx.strokeStyle = 'rgba(230,190,130,' + 0.2 * a + ')'; ctx.lineWidth = 30; ctx.lineCap = 'round';
      for (var i = 0; i < 7; i++) {
        var off = ((t * 260 + i * 260) % (A.w + A.h + 600)) - 300;
        ctx.beginPath(); ctx.moveTo(A.x + off, A.y); ctx.lineTo(A.x + off - A.h * 0.6, A.y + A.h); ctx.stroke();
      }
    }
    ctx.globalAlpha = 0.11 * a;
    ctx.font = '120px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgb(' + col + ')';
    ctx.save(); ctx.translate(A.x + A.w / 2, A.y + A.h / 2); ctx.rotate(-0.35);
    ctx.fillText(two ? '대청소 중' : 'WELLUS', 0, -120); ctx.fillText(two ? '대청소 중' : 'WELLUS', 0, 120); ctx.restore();
    ctx.globalAlpha = a;
    this.motes.forEach(function (m) {
      ctx.globalAlpha = 0.65 * a; ctx.fillStyle = two ? '#c8a46a' : '#7dff9a';
      if (two) { ctx.beginPath(); ctx.arc(m.x, m.y, m.s * 0.4, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillRect(m.x - m.s / 2, m.y - m.s / 8, m.s, m.s / 4); ctx.fillRect(m.x - m.s / 8, m.y - m.s / 2, m.s / 4, m.s); }
    });
    ctx.globalAlpha = 1;
    if (this.wave >= 0) {   // 발동 순간 이장님에서 경기장 끝까지 퍼지는 물결
      ctx.strokeStyle = 'rgba(' + col + ',' + 0.6 * (1 - this.wave / 2200) + ')'; ctx.lineWidth = 30;
      ctx.beginPath(); ctx.arc(o.x, o.y, this.wave, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(' + col + ',' + (0.35 + Math.sin(t * 3) * 0.15) * a + ')'; ctx.strokeRect(A.x, A.y, A.w, A.h);
    ctx.restore();
  }
}
function chiefDdakbam(bt, t, src) {
  var hp = t.hp;
  t.stats.taken += hp; src.stats.dealt += hp;
  t.hp = 0; t.data.ddak = true;
  FX.banner('부랄딱밤!', { color: '#ff2a55', sub: src.name + ' → ' + t.name + ' 즉사', size: 170, life: 2.2, y: CONFIG.arena.y + 170 });
  FX.flash('#ffffff', 0.6, 0.35); FX.shake(50); FX.sfx('ddakbam');
  var def = t.def, x = t.x, y = t.y;
  FX.particle({ x: x, y: y, vx: 0, vy: -50, life: 2.2, size: 0, color: '#ff2a55', shape: 'custom',
    draw: function (ctx, px, py, k) {
      var r = 150 * Math.min(1, (1 - k) * 6 + 0.3);
      ctx.save(); ctx.shadowColor = '#ff2a55'; ctx.shadowBlur = 50; ctx.fillStyle = '#ff2a55';
      ctx.beginPath(); ctx.arc(px, py, r + 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      Assets.drawBall(ctx, def, 'ko', px, py, r, 0, '#ff2a55');
    } });
  bt.emit('ddakbam', { who: t.def.id, src: src.def.id });
  bt.kill(t);
}

// ---------- 한규성 (포식자) ----------
// 비타민 껍질: 심고 fuse초 뒤 하얀 액체로 터지며 방울 탄막
//   host가 있으면 그 상대에게 붙어서 같이 움직이고, 터질 때 host는 직접 splash 피해 (방울은 host를 비켜감)
class VitaminShell {
  constructor(bt, owner, x, y, c, host) {
    this.bt = bt; this.owner = owner; this.c = c; this.x = x; this.y = y; this.t = 0; this.z = host ? 1 : -1; this.rot = _rnd(0, 6);
    this.host = host || null;
    if (host) { this.ang = Math.atan2(y - host.y, x - host.x) + _rnd(-0.6, 0.6); this.rot = this.ang; }
  }
  update(dt) {
    var o = this.owner, c = this.c, bt = this.bt, h = this.host;
    this.t += dt;
    if (!o.alive || !_is(o, 'predator')) { this.dead = true; FX.burst(this.x, this.y, '#ffb347', 8, 200, 6, 0.4); return; }
    if (h) {
      if (h.alive) { this.x = h.x + Math.cos(this.ang) * h.r * 0.85; this.y = h.y + Math.sin(this.ang) * h.r * 0.85; }
      else this.host = h = null;   // 붙은 상대가 쓰러지면 그 자리에 떨어짐
    }
    if (this.t < c.fuse) return;
    this.dead = true;
    var off = _rnd(0, Math.PI * 2);
    for (var i = 0; i < c.bullets; i++) bt.add(new VitaminBullet(bt, o, this.x, this.y, off + i / c.bullets * Math.PI * 2, c, h));
    if (h && h.targetable) {
      bt.damage(h, c.stickDamage, o, { color: '#ffffff', kind: 'vitamin' });
    }
    bt.add(new VitaminSplat(this.x, this.y));
    // 액체 방울 튀기기
    for (var k = 0; k < 22; k++) {
      var a = _rnd(0, Math.PI * 2), v = _rnd(150, 650);
      FX.particle({ x: this.x, y: this.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150, g: 900, drag: 0.95, life: _rnd(0.4, 0.8), size: _rnd(5, 11), color: '#ffffff', shape: 'custom',
        draw: function (ctx, x, y, kk, p) {
          var sp = Math.hypot(p.vx, p.vy), st = Math.min(2.6, 1 + sp / 400);
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(0, 0, p.size * st, p.size, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } });
    }
    FX.ring(this.x, this.y, 10, 110, 0.3, '#ffffff', 10);
    FX.sfx('drool'); FX.sfx('shatter');
    bt.emit('vitaminBoom', { stuck: !!h });
  }
  draw(ctx) {
    var c = this.c, k = this.t / c.fuse, white = k > 0.7 && Math.sin(this.t * 40) > 0, s = Math.min(1, this.t / 0.2) * (1 + (k > 0.7 ? (k - 0.7) * 0.8 : 0));
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.scale(s * 1.6, s * 1.6);
    ctx.shadowColor = white ? '#ffffff' : '#ffb347'; ctx.shadowBlur = 16 + k * 20;
    ctx.fillStyle = white ? '#ffffff' : '#ffb347'; Battle.roundRect(ctx, -18, -9, 18, 18, 9); ctx.fill();
    ctx.fillStyle = white ? '#ffffff' : '#ff7a3c'; Battle.roundRect(ctx, 0, -9, 18, 18, 9); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(2, -2); ctx.lineTo(-3, 4); ctx.lineTo(3, 12); ctx.stroke();   // 깨진 껍질
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 70 }; }
}
// 터진 자리에 남는 하얀 액체 자국 (피해 없음, 연출용)
class VitaminSplat {
  constructor(x, y) {
    this.x = x; this.y = y; this.t = 0; this.z = -2; this.life = 1.6;
    this.blobs = []; for (var i = 0; i < 9; i++) { var a = _rnd(0, 6.28), d = _rnd(10, 55); this.blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: _rnd(10, 26) }); }
  }
  update(dt) { this.t += dt; if (this.t >= this.life) this.dead = true; }
  draw(ctx) {
    var a = Math.min(1, (this.life - this.t) / 0.6), g = Math.min(1, this.t / 0.12);
    ctx.save(); ctx.translate(this.x, this.y); ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#f4f4ff';
    ctx.beginPath(); ctx.arc(0, 0, 34 * g, 0, Math.PI * 2); ctx.fill();
    this.blobs.forEach(function (b) { ctx.beginPath(); ctx.arc(b.x * g, b.y * g, b.r * g, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 0.5 * a; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-10, -10, 8 * g, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
// 액체 방울 탄
class VitaminBullet {
  constructor(bt, owner, x, y, ang, c, skip) { this.bt = bt; this.owner = owner; this.c = c; this.x = x; this.y = y; this.vx = Math.cos(ang) * c.speed; this.vy = Math.sin(ang) * c.speed; this.t = 0; this.z = 1; this.skip = skip || null; }
  update(dt) {
    var A = CONFIG.arena, self = this;
    this.t += dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.x < A.x || this.x > A.x + A.w || this.y < A.y || this.y > A.y + A.h || this.t > 2) { this.dead = true; return; }
    var hit = this.bt.enemies(this.owner).find(function (o) { return o !== self.skip && o.targetable && !o.air && _dist(o, self) < o.r + 10; });
    if (!hit) return;
    this.dead = true;
    this.bt.damage(hit, this.c.damage, this.owner, { color: '#ffffff', kind: 'vitamin' });
    FX.burst(this.x, this.y, '#ffffff', 8, 260, 6, 0.3);
    this.bt.emit('vitaminHit', { who: hit.def.id });
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12; ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(4, -9, -14, 0); ctx.quadraticCurveTo(4, 9, 12, 0); ctx.fill();   // 물방울
    ctx.restore();
  }
  light() { return { x: this.x, y: this.y, r: 50 }; }
}
// host: 상대에게 붙이는 경우 (부딪힐 때)
function predPlant(bt, b, x, y, n, host) {
  var c = b.cfg.vitamin, mine = bt.ents.filter(function (e) { return e instanceof VitaminShell && e.owner === b && !e.dead; }).length;
  for (var i = 0; i < n && mine < c.max; i++, mine++) {
    var a = _rnd(0, Math.PI * 2), d = n > 1 && !host ? _rnd(30, 70) : 0;
    var p = host ? { x: x, y: y } : bt.clampPoint({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }, 20);
    if (host && n > 1) { var ha = Math.atan2(y - host.y, x - host.x) + (i - 1) * 1.2; p = { x: host.x + Math.cos(ha) * host.r, y: host.y + Math.sin(ha) * host.r }; }
    bt.add(new VitaminShell(bt, b, p.x, p.y, c, host));
  }
  FX.sfx('pickup');
  bt.emit('vitaminPlant', { n: n, stuck: !!host });
}
// 포식 물기 연출: 위아래로 굽은 송곳니가 벌어졌다 콱 닫히고, 닫힌 자리에 핏빛 물린 자국이 남음
function _biteFX(x, y, r, ang, color, dark) {
  FX.particle({ x: x, y: y, vx: 0, vy: 0, life: 0.55, size: 0, color: color, shape: 'custom',
    draw: function (ctx, px, py, k) {
      var t = 1 - k, R = r * 2.1;
      var close = t < 0.18 ? 0 : Math.min(1, (t - 0.18) / 0.1);   // 벌림 → 콱
      var gap = R * 0.75 * (1 - close), fade = t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.45) : 1;
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.globalAlpha = fade;
      ctx.shadowColor = color; ctx.shadowBlur = 35;
      [-1, 1].forEach(function (sg) {
        ctx.save(); ctx.translate(0, sg * gap);
        // 턱 윤곽 (반달)
        ctx.fillStyle = dark; ctx.strokeStyle = color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(0, sg * R * 0.18, R, R * 0.42, 0, sg < 0 ? Math.PI : 0, sg < 0 ? Math.PI * 2 : Math.PI); ctx.closePath();
        ctx.globalAlpha = fade * 0.55; ctx.fill(); ctx.globalAlpha = fade; ctx.stroke();
        // 송곳니: 바깥쪽 두 개는 크게 휘어서
        ctx.fillStyle = '#ffffff';
        for (var i = 0; i < 7; i++) {
          var f = i / 6, tx = -R * 0.85 + f * R * 1.7, big = i === 1 || i === 5, len = (big ? 0.62 : 0.32) * R, w = R * (big ? 0.11 : 0.07);
          ctx.beginPath(); ctx.moveTo(tx - w, sg * R * 0.08); ctx.quadraticCurveTo(tx - w * 0.2, -sg * len * 0.55, tx + (big ? (f < 0.5 ? 6 : -6) : 0), -sg * len); ctx.lineTo(tx + w, sg * R * 0.08); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });
      // 닫히는 순간 붉은 섬광 + 물린 자국
      if (close >= 1) {
        var m = Math.min(1, (t - 0.28) / 0.1);
        ctx.shadowBlur = 0; ctx.strokeStyle = color; ctx.lineCap = 'round';
        for (var j = -2; j <= 2; j++) {
          ctx.lineWidth = 12 - Math.abs(j) * 3;
          ctx.beginPath(); ctx.moveTo(-R * 0.9 * m, j * 13); ctx.quadraticCurveTo(0, j * 13 + 18, R * 0.9 * m, j * 13); ctx.stroke();
        }
      }
      ctx.restore();
    } });
}
// 포식 (워윅 Q 느낌): 상대에게 덮쳐서 물고, 상대 뒤로 뛰어넘어 착지
//   일반: 큰 피해 + 그 절반 흡혈 / 여성: 하트와 함께 피해 없이 damage만큼 회복
function predFeast(bt, s, t) {
  var c = s.cfg.feast, fem = _isFemale(t), i, col = fem ? '#ff7ab6' : '#ff2a2a', dark = fem ? '#5a1030' : '#3a0008';
  s.data.armed = false;
  var ang = Math.atan2(t.y - s.y, t.x - s.x);
  _biteFX(t.x, t.y, t.r, ang, col, dark);
  FX.sfx('bite'); FX.sfx('slam');
  FX.ring(t.x, t.y, t.r, t.r * 2.8, 0.45, col, 18);
  FX.ring(t.x, t.y, t.r * 0.5, t.r * 1.8, 0.3, '#ffffff', 8);
  var dealt = 0, got;
  if (fem) {
    got = bt.heal(s, c.damage);
    FX.banner('포식♥', { color: '#ff7ab6', size: 120, life: 1.0, y: CONFIG.arena.y + 200 });
    for (i = 0; i < 14; i++) {
      var a = _rnd(0, Math.PI * 2), v = _rnd(120, 420);
      FX.particle({ x: t.x, y: t.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: -60, drag: 0.94, life: _rnd(0.6, 1.1), size: _rnd(14, 24), color: '#ff7ab6', shape: 'custom',
        draw: function (ctx, x, y, k, p) {
          ctx.save(); ctx.translate(x, y); ctx.scale(p.size / 20, p.size / 20); ctx.fillStyle = '#ff5fa2';
          ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-14, -4, -8, -16, 0, -8); ctx.bezierCurveTo(8, -16, 14, -4, 0, 6); ctx.fill();
          ctx.restore();
        } });
    }
    FX.sfx('happy');
  } else {
    dealt = bt.damage(t, c.damage, s, { color: '#ff2a2a', kind: 'feast' });
    got = bt.heal(s, dealt * c.lifesteal);
    FX.banner('포식', { color: '#ff2a2a', size: 120, life: 0.9, y: CONFIG.arena.y + 200 });
    FX.burst(t.x, t.y, '#b0000f', 34, 900, 10, 0.7, 'square', { g: 900 });   // 피 튐
    FX.flash('#ff0000', 0.15, 0.18); FX.shake(28);
  }
  // 흡혈: 상대 → 본인으로 빨려 들어가는 붉은 줄기
  for (i = 0; i < 16; i++) {
    var d0 = _rnd(0, 0.25);
    FX.particle({ x: t.x + _rnd(-t.r, t.r) * 0.6, y: t.y + _rnd(-t.r, t.r) * 0.6, vx: 0, vy: 0, life: 0.5 + d0, size: _rnd(6, 11), color: col, shape: 'custom',
      draw: (function (sx, sy) { return function (ctx, x, y, k, p) {
        var q = 1 - k, e = q * q;   // 점점 빨라지며 빨려 들어감
        var px = sx + (s.x - sx) * e, py = sy + (s.y - sy) * e;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, p.size * (1 - e * 0.5), 0, Math.PI * 2); ctx.fill();
      }; })(t.x + _rnd(-20, 20), t.y + _rnd(-20, 20)) });
  }
  bt.emit('feast', { who: t.def.id, dealt: dealt, healed: got, female: fem });
  // 덮친 뒤 상대 뒤쪽으로 뛰어넘어 착지
  if (s.action && s.action.end) s.action.end();
  var from = { x: s.x, y: s.y }, to = bt.clampPoint({ x: t.x + Math.cos(ang) * (t.r + s.r + 20), y: t.y + Math.sin(ang) * (t.r + s.r + 20) }, s.r + 4), tt = 0, D = 0.22, gt = 0;
  s.phasing = true;
  s.action = {
    moves: false, uninterruptible: true,
    update: function (dt) {
      tt += dt;
      var k = Math.min(1, tt / D);
      s.x = from.x + (to.x - from.x) * k; s.y = from.y + (to.y - from.y) * k;
      s.lift = Math.sin(k * Math.PI) * 0.35;
      gt += dt; if (gt > 0.03) { gt = 0; _ghost(s); }
      return k >= 1;
    },
    end: function () {
      s.lift = 0; s.phasing = false;
      FX.burst(s.x, s.y, '#bfa27a', 10, 300, 14, 0.4, 'smoke');
      _restoreSpeed(s, Math.cos(ang), Math.sin(ang));
    },
  };
}

// ---------- 캐릭터 ----------
var CHARACTERS = {
  baton: {
    id: 'baton', name: '유재후', sub: '바통의 모습',
    flavor: "\"바통은 당신이 지구 어디에 있어도, 심지어 우주에 있어도 눈 깜짝할 사이에 굴러온다.\"",
    images: {
      base: { src: 'assets/baton.jpg', fx: 0.48, fy: 0.55, s: 0.8 },
      p2:   { src: 'assets/baton_p2.jpg', fx: 0.57, fy: 0.47, s: 0.6 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통',
    intro: '데굴데굴 굴러서 들이받는 돌격형. 체력이 가장 많아 오래 버티고, 페이즈 2에서는 맵 전체를 울리는 비명으로 모두를 한꺼번에 공격한다.',
    skills: [
      {
        key: 'roll', name: '구르기', desc: '가장 가까운 적에게 600px 굴러가며 경로의 모든 적에게 15 데미지 (적마다 1회)',
        cd: function (c) { return c.roll.cd; },
        start: function (bt, b) {
          var c = b.cfg.roll, t = bt.nearest(b), p = t ? bt.aim(b, t.x, t.y) : bt.randomPoint();
          var dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
          b.vx = dx / d * c.speed; b.vy = dy / d * c.speed; b.phasing = true;
          bt.skillText(b, '구르기'); FX.sfx('roll');
          var traveled = 0, hit = new Set(), gt = 0, spin = dx >= 0 ? 1 : -1;
          return {
            moves: false, spinning: true,
            update: function (dt) {
              var sp = Math.hypot(b.vx, b.vy);
              b.x += b.vx * dt; b.y += b.vy * dt;
              if (bt.walls(b)) FX.shake(5);
              traveled += sp * dt; b.rot += spin * sp * dt / b.r;
              gt += dt; if (gt > 0.025) { gt = 0; _ghost(b); }
              FX.particle({ x: b.x + _rnd(-20, 20), y: b.y + b.r * 0.8, vx: -b.vx * 0.1 + _rnd(-60, 60), vy: _rnd(-80, -10), life: 0.5, size: _rnd(12, 22), color: '#bfa27a', shape: 'smoke' });
              bt.enemies(b).forEach(function (o) {
                if (hit.has(o) || !o.targetable || o.air || _dist(o, b) > o.r + b.r) return;
                hit.add(o);
                bt.damage(o, c.damage, b, { color: '#ffe066' });
                var nx = -b.vy / sp, ny = b.vx / sp, side = (o.x - b.x) * nx + (o.y - b.y) * ny >= 0 ? 1 : -1;
                o.vx += nx * side * 500; o.vy += ny * side * 500;
                FX.ring(o.x, o.y, o.r, o.r * 2, 0.3, '#ffd400', 10);
                FX.shake(c.shake);
                bt.emit('rollHit', { who: o.def.id });
              });
              return traveled >= c.distance;
            },
            end: function () { b.phasing = false; _restoreSpeed(b, b.vx, b.vy); },
          };
        },
      },
      {
        key: 'scream', name: '끼야아아악', desc: '맵 전체 음파로 모든 적에게 20 데미지. 30% 확률로 0.6초 뒤 한 번 더',
        cd: function (c) { return c.scream.cd; },
        start: function (bt, b) {
          // 초대받지 못한 손님: 2스킬은 피해 배율 없이 확정 2연타
          var solo = bt.hasSynergy('uninvited', b.team);
          var c = b.cfg.scream, twice = solo || Math.random() < c.doubleChance, t = 0, fired = 1;
          bt.emit('scream', { double: twice });
          function blast(n) {
            var ctr = bt.aimArea(b, b.x, b.y);
            FX.banner(n === 2 ? '끼야아아악!!' : '끼야아아악', { color: '#ffd400', size: n === 2 ? 150 : 130, life: 1.1 });
            FX.sfx('scream'); FX.shake(c.shake); FX.flash('#ffd400', 0.18, 0.25);
            for (var i = 0; i < 4; i++) FX.ring(ctr.x, ctr.y, b.r, ctr.miss ? c.missRadius : 1500, 0.6 + i * 0.15, i % 2 ? '#ffffff' : '#ffd400', 18 - i * 3);
            bt.enemies(b).forEach(function (o) {
              if (!o.targetable) return;
              if (ctr.miss && _dist(o, ctr) > c.missRadius) return;
              bt.damage(o, c.damage, b, { color: '#ffe066', noMult: solo });
              bt.emit('screamHit', { who: o.def.id, n: n });
            });
          }
          blast(1);
          return {
            moves: false,
            update: function (dt) {
              t += dt; b.jx = _rnd(-6, 6); b.jy = _rnd(-6, 6);
              if (twice && fired === 1 && t >= c.doubleDelay) { fired = 2; blast(2); }
              return t >= (twice ? c.doubleDelay + 0.45 : 0.55);
            },
            end: function () { b.jx = b.jy = 0; _restoreSpeed(b, b.vx, b.vy); },
          };
        },
      },
    ],
  },

  ibi: {
    id: 'ibi', name: '한규성', sub: '이비의 모습',
    flavor: "\"(하이톤으로) 안녕 난 규순이야! 하하하핳ㅎ!!!!!!!!!!!!!!!!!!!!!!!!!\"",
    images: {
      base:    { src: 'assets/ibi.jpg', fx: 0.52, fy: 0.39, s: 0.42 },
      gyusuni: { src: 'assets/ibi_gyusuni.jpg', fx: 0.64, fy: 0.5, s: 0.5 },
      lucha:   { src: 'assets/ibi_lucha.jpg', fx: 0.62, fy: 0.4, s: 0.8 },
    },
    portrait: function (b) { return b.data.lucha ? 'lucha' : b.data.gyusuni ? 'gyusuni' : 'base'; },
    blurb: '이동 약간 빠름',
    intro: '멀리서 돌을 던져 견제하는 원거리형. 페이즈 2에서는 규순이로 각성해 경기장을 어둡게 만들고 새·점프 공격·충격파 중 하나를 랜덤으로 쓴다. (규순이일 땐 여성 취급)',
    passives: [{ name: '규순이', desc: '규순이로 각성한 동안은 여성 취급 (조우연의 뱀 피해 2배)' }, { name: '빠른 각성', desc: '체력 70%에서 페이즈 2' }],
    female: function (b) { return !!b.data.gyusuni; },
    // 디마디영디: 규순이를 페이즈 1부터, 대신 쿨타임 x gyusuniCd
    earlySkill2: function (bt, b) { return _dmdyd(bt, b); },
    init: function (bt, b) {
      if (!_dmdyd(bt, b)) return;
      var sk = b.skills[1]; sk.max *= CONFIG.synergy.dmdyd.gyusuniCd; sk.cd = sk.max * 0.5;
    },
    // IZK 1기 긴급소집으로 예약된 3연속 각성: 다른 행동이 끝나면 바로 시작
    update: function (bt, b) {
      if (b.data.pendingCombo && !b.action && !b.disabled && !b.hidden) {
        b.data.pendingCombo = false;
        b.action = ibiAwaken(bt, b, ['birds', 'lucha', 'toka']);
      }
    },
    skills: [
      {
        key: 'stone', name: '돌 던지기', desc: '가장 가까운 적에게 돌을 던져 18 데미지',
        cd: function (c) { return c.stone.cd; },
        start: function (bt, b) {
          var t = bt.nearest(b);
          if (!t) return null;
          var p = bt.aim(b, t.x, t.y);
          bt.add(new Stone(bt, b, p.x, p.y, b.cfg.stone));
          bt.skillText(b, '돌 던지기'); FX.sfx('throw');
          return null;
        },
      },
      {
        key: 'awaken', name: '규순이로 각성', desc: '경기장이 어두워지고 [새가 너무 좋아 / 루차루차 / 토카토카] 중 하나를 랜덤 발동 (마을회관에선 워터밤도). 워터밤: 물병으로 사방에 물을 뿌려 닿으면 피해 + 미끄러짐 (이장님은 안 닿아도 멘헤라로 둔화 · 지속 피해, 얼음 삼식이 무효 · 불 삼식이 2배)',
        cd: function (c) { return c.awaken.cd; },
        start: function (bt, b) { return ibiAwaken(bt, b, null); },
      },
    ],
  },

  samsik: {
    id: 'samsik', name: '김선율', sub: '삼식이의 모습',
    flavor: "\"누가 나를 쳐다볼때 한줄 긋고, 너 스토리 올라올때 또 긋고, 집에 들어가면 홧김에 또 긋고, 손목이 너덜거릴때까지 긋고...\"",
    images: {
      base:   { src: 'assets/samsik.jpg', fx: 0.495, fy: 0.45, s: 0.22 },
      red:    { src: 'assets/samsik_red.webp', fx: 0.51, fy: 0.69, s: 0.5 },
      yellow: { src: 'assets/samsik_yellow.webp', fx: 0.54, fy: 0.385, s: 0.32 },
      blue:   { src: 'assets/samsik_blue.jpg', fx: 0.51, fy: 0.46, s: 0.55 },
      shaved: { src: 'assets/samsik_shaved.jpg', fx: 0.47, fy: 0.51, s: 0.36 },
      black:  { src: 'assets/samsik_black.jpg', fx: 0.495, fy: 0.45, s: 0.22 },
      white:  { src: 'assets/samsik_white.jpg', fx: 0.62, fy: 0.3, s: 0.75 },
    },
    // 여러 색이 겹치면(긴급소집 복합 염색) 각 색 사진을 조각으로 전부 보여줌
    portrait: function (b) { var ds = _dyes(b.data); return ds.length > 1 ? 'multi:' + ds.join(',') : (b.data.dye || 'base'); },
    color: function (b) { var k = _curDye(b); return k ? DYES[k].color : b.cfg.color; },
    glow: function (b) { var k = _curDye(b); return k ? (DYES[k].glow || DYES[k].color) : b.cfg.color; },
    blurb: '이동 빠름',
    intro: '가장 빠른 근접 암살자. 부딪힐 때마다 칼로 그어 출혈을 쌓고, 페이즈 2부터는 8초마다 머리를 염색해 능력이 통째로 바뀐다.',
    passives: [{ name: '염색 후 흥분', desc: function () { var c = CONFIG.chars.samsik; return '페이즈 2에서 이동속도 x' + c.phase2Speed + ', 번개(노랑)일 땐 추가로 x' + c.dye.yellow.speedMul; } }],
    rollDye: rollDye,
    init: function (bt, b) { b.data.armed = false; b.data.dye = null; b.data.roulette = 0; b.data.showResult = 0; b.data.vanish = 0; b.data.whiteUntil = 0; },
    // 하양 보호막: 본인(팀전이면 같은 팀 전원)이 받는 피해 x guard
    guard: function (bt, s, t) {
      if (!(bt.time < s.data.whiteUntil) || !(t === s || (bt.mode === 'team' && t.team === s.team))) return 1;
      return s.cfg.dye.white.guard;
    },
    skills: [
      {
        key: 'slash', name: '긋기', desc: '장전 후 다음 접촉 시 출혈(5초간 중첩당 초당 3, 최대 5중첩, 중첩마다 지속시간 초기화)',
        cd: function (c) { return c.slash.cd; },
        holds: function (b) { return b.data.armed; },
        start: function (bt, b) {
          b.data.armed = true;
          bt.skillText(b, '장전'); FX.sfx('arm');
          FX.ring(b.x, b.y, b.r, b.r * 1.6, 0.3, '#e0e0ff', 6);
          return null;
        },
      },
      {
        key: 'dye', name: '염색', passive: true,
        desc: '8초마다 머리색 변경. 빨강=화상 / 노랑=스턴 / 파랑=빙결(재접촉 시 파쇄) / 삭발=지진 3연타 / 검정=사라졌다 뒤치기 / 하양=받는 모든 피해 80% 무시(팀전은 같은 팀 전원)',
        cd: function (c) { return c.dye.interval; },
        start: function (bt, b) { samsikDye(bt, b); },
      },
    ],
    onPhase2: function (bt, b) { samsikDye(bt, b); b.skills[1].cd = b.skills[1].max; },
    // 페이즈 2 이동속도 소폭 증가, 번개(노랑) 염색 중이면 추가 증가
    speedMul: function (bt, b) {
      if (b.phase < 2) return 1;
      return b.cfg.phase2Speed * (_dyes(b.data).indexOf('yellow') >= 0 ? b.cfg.dye.yellow.speedMul : 1);
    },
    update: function (bt, b, dt) {
      var d = b.data;
      d.cyc = (d.cyc || 0) + dt;
      if (d.roulette > 0) {
        d.roulette -= dt;
        if (d.roulette <= 0) {
          d.dye = d.pendingDye; d.dyes = [d.dye]; d.showResult = 0.6;
          var dc = DYES[d.dye].glow || DYES[d.dye].color;
          FX.ring(b.x, b.y, b.r, b.r * 2.6, 0.5, dc, 14);
          FX.burst(b.x, b.y, dc, 30, 700, 9, 0.6);
          FX.sfx('ding');
          bt.skillText(b, DYES[d.dye].label + '!', dc);
          bt.emit('dyeApplied', { color: d.dye });
          if (d.dye === 'white') {
            FX.flash('#ffffff', 0.5, 0.35); FX.sfx('blind');
            FX.ring(b.x, b.y, b.r, 1400, 0.7, '#ffffff', 20);
          }
        }
      }
      if (d.showResult > 0) d.showResult -= dt;
      if (d.vanish > 0) { d.vanish -= dt; if (d.vanish <= 0) samsikReappear(bt, b); }
      // 하양: 염색이 유지되는 동안 받는 피해 80% 무시 (팀전은 같은 팀 전원, 바뀌면 linger초 뒤 풀림)
      var ds = _dyes(d);
      if (ds.indexOf('white') >= 0) {
        d.whiteUntil = bt.time + b.cfg.dye.white.linger;
        d.auraT = (d.auraT || 0) - dt;
        if (d.auraT <= 0) {
          d.auraT = 0.7;
          [b].concat(bt.mode === 'team' ? bt.allies(b) : []).forEach(function (a) { FX.ring(a.x, a.y, a.r, a.r * 1.6, 0.6, '#ffffff', 6); });
        }
      }
      if (b.hidden || !d.dye) return;
      // 염색 색 파티클
      ds.forEach(function (dye) {
      var r = Math.random(), px = b.x + _rnd(-b.r, b.r) * 0.8, py = b.y + _rnd(-b.r, b.r) * 0.8;
      if (dye === 'red' && r < dt * 25) FX.particle({ x: px, y: py, vx: _rnd(-20, 20), vy: _rnd(-200, -100), life: 0.4, size: 10, color: '#ff6a00' });
      else if (dye === 'yellow' && r < dt * 20) FX.particle({ x: px, y: py, vx: _rnd(-300, 300), vy: _rnd(-300, 300), life: 0.15, size: 5, color: '#ffe11a', shape: 'spark' });
      else if (dye === 'blue' && r < dt * 18) FX.particle({ x: px, y: py, vx: _rnd(-30, 30), vy: _rnd(20, 80), life: 0.7, size: 6, color: '#bff0ff', shape: 'shard', vr: 4 });
      else if (dye === 'shaved' && r < dt * 8) FX.particle({ x: b.x + _rnd(-b.r, b.r) * 0.5, y: b.y - b.r * 0.6, vx: 0, vy: -20, life: 0.35, size: 14, color: '#ffffff' });
      else if (dye === 'black' && r < dt * 20) FX.particle({ x: px, y: py, vx: _rnd(-20, 20), vy: _rnd(-60, -20), life: 0.7, size: 14, color: '#2a1a40', shape: 'smoke' });
      else if (dye === 'white' && r < dt * 20) FX.particle({ x: px, y: py, vx: _rnd(-60, 60), vy: _rnd(-60, 60), life: 0.4, size: 7, color: '#ffffff' });
      });
    },
    onContact: function (bt, s, t, px, py) {
      if (s.hidden || !bt.canEffect(s, t)) return;   // 같은 상대 1초 내부 쿨다운
      var c = s.cfg, d = s.data, shattered = false;
      // 빙결된 상대와 다시 부딪히면 파쇄
      if (t.status.freeze > 0) {
        t.status.freeze = 0; shattered = true;
        FX.burst(t.x, t.y, '#bff0ff', 30, 900, 14, 0.7, 'shard');
        FX.ring(t.x, t.y, t.r, t.r * 2.2, 0.4, '#ffffff', 12);
        FX.sfx('shatter'); FX.shake(20);
        bt.damage(t, c.dye.blue.shatterDamage, s, { color: '#9fe8ff' });
        bt.emit('shatter', { who: t.def.id });
      }
      if (d.armed && t.alive) {
        d.armed = false;
        var a = _rnd(0, Math.PI);
        FX.particle({ x: t.x, y: t.y, vx: 0, vy: 0, life: 0.3, size: 0, color: '#ff0033', shape: 'ghost',
          draw: function (ctx, x, y) {
            ctx.save(); ctx.strokeStyle = '#ff0033'; ctx.shadowColor = '#ff0033'; ctx.shadowBlur = 25; ctx.lineWidth = 12; ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 130, y - Math.sin(a) * 130); ctx.lineTo(x + Math.cos(a) * 130, y + Math.sin(a) * 130); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
          } });
        FX.burst(t.x, t.y, '#d0002a', 20, 600, 8, 0.6, 'square', { g: 900 });
        FX.sfx('slash'); FX.shake(c.slash.shake);
        bt.applyBleed(t, c.slash, s);
        bt.skillText(s, '긋기!', '#ff0033');
        bt.emit('slash', { who: t.def.id });
      }
      if (!t.alive) return;
      var dc = c.dye;
      // 여러 색을 동시에 가지면 전부 적용, 검정(순간이동)은 마지막에
      _dyes(d).slice().sort(function (p, q) { return (p === 'black') - (q === 'black'); }).forEach(function (dye) {
      if (!t.alive) return;
      switch (dye) {
        case 'red':
          bt.damage(t, dc.red.damage, s, { color: '#ff7a3c' });
          t.status.burn = dc.red.burnTime; t.status.burnDps = dc.red.burnDps; t.status.burnSrc = s;   // 중첩 없이 시간만 초기화
          FX.burst(t.x, t.y, '#ff6a00', 25, 700, 12, 0.6); FX.sfx('fire');
          bt.emit('burn', { who: t.def.id });
          break;
        case 'yellow':
          bt.damage(t, dc.yellow.damage, s, { color: '#fff27a' });
          t.status.stun = Math.max(t.status.stun, dc.yellow.stun);
          FX.burst(t.x, t.y, '#ffe11a', 25, 1000, 6, 0.4, 'spark'); FX.sfx('zap');
          bt.emit('stun', { who: t.def.id });
          break;
        case 'blue':
          if (shattered) break;   // 깨진 직후 같은 접촉으로 다시 얼리지 않음
          bt.damage(t, dc.blue.damage, s, { color: '#9fe8ff' });
          t.status.freeze = dc.blue.freeze;
          FX.burst(t.x, t.y, '#bff0ff', 20, 500, 9, 0.5, 'shard'); FX.sfx('freeze');
          bt.emit('freeze', { who: t.def.id });
          break;
        case 'shaved':
          samsikQuake(bt, s);
          bt.emit('quake');
          break;
        case 'black':
          s.hidden = true; d.vanish = dc.black.vanish; d.vanishTarget = t;
          FX.burst(s.x, s.y, '#2a1a40', 30, 500, 28, 0.8, 'smoke'); FX.sfx('vanish');
          bt.emit('vanish');
          break;
        case 'white':   // 보호막은 패시브라 접촉 시엔 추가 데미지만
          bt.damage(t, dc.white.damage, s, { color: '#ffffff' });
          FX.burst(t.x, t.y, '#ffffff', 25, 800, 8, 0.5);
          break;
      }
      });
    },
    drawExtra: function (ctx, b, bt, x, y, r, time) {
      if (b.data.armed) {   // 장전: 공 주위를 도는 칼
        for (var i = 0; i < 3; i++) {
          var a = time * 5 + i * Math.PI * 2 / 3;
          ctx.save(); ctx.translate(x + Math.cos(a) * (r + 26), y + Math.sin(a) * (r + 26)); ctx.rotate(a + Math.PI / 2);
          ctx.shadowColor = '#ff0033'; ctx.shadowBlur = 14;
          ctx.fillStyle = '#e8e8f4'; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#5a3a2a'; ctx.fillRect(-4, 8, 8, 12);
          ctx.restore();
        }
      }
      if (_dyes(b.data).indexOf('shaved') >= 0 && Math.sin(time * 9) > 0.6) {
        ctx.save(); ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 20;
        var sx = x - r * 0.25, sy = y - r * 0.6;
        ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.lineTo(sx + 4, sy - 4); ctx.lineTo(sx + 16, sy); ctx.lineTo(sx + 4, sy + 4);
        ctx.lineTo(sx, sy + 16); ctx.lineTo(sx - 4, sy + 4); ctx.lineTo(sx - 16, sy); ctx.lineTo(sx - 4, sy - 4); ctx.fill(); ctx.restore();
      }
    },
    // 슬롯머신 연출 (전투는 계속 진행)
    drawOverlay: function (ctx, b, bt, time) {
      var d = b.data;
      if (!(d.roulette > 0 || d.showResult > 0) || !b.alive) return;
      var keys = Object.keys(DYES), W = CONFIG.W, cx = W / 2, cy = CONFIG.arena.y + 290;
      var idx;
      if (d.roulette > 0.12) {
        var p = 1 - d.roulette / b.cfg.dye.rouletteTime;
        idx = Math.floor(time * (30 - p * 20)) % keys.length;
      } else idx = keys.indexOf(d.pendingDye);
      ctx.save();
      ctx.globalAlpha = d.roulette > 0 ? 1 : Math.min(1, d.showResult / 0.2);
      ctx.fillStyle = 'rgba(10,6,20,0.85)'; Battle.roundRect(ctx, cx - 300, cy - 70, 600, 140, 30); ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      for (var k = -2; k <= 2; k++) {
        var key = keys[(idx + k + keys.length * 2) % keys.length], dy = DYES[key];
        var bx = cx + k * 110, s = k === 0 ? 1 : 0.7;
        ctx.globalAlpha = (k === 0 ? 1 : 0.45) * (d.roulette > 0 ? 1 : Math.min(1, d.showResult / 0.2));
        ctx.fillStyle = dy.color; ctx.strokeStyle = dy.glow || '#000'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(bx, cy, 44 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font = '700 ' + Math.round(26 * s) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = key === 'white' || key === 'yellow' ? '#111' : '#fff';
        ctx.fillText(dy.label, bx, cy);
      }
      ctx.restore();
    },
    hudTag: function (ctx, b, x, y) {
      var d = b.data, ds = _dyes(d);
      if (!ds.length) return;
      var dy = DYES[_curDye(b)];
      ctx.font = '700 22px "Malgun Gothic",sans-serif';
      var txt = ds.length > 1 ? ds.map(function (k) { return DYES[k].label; }).join('+') : dy.label + ' · ' + dy.el;
      var w = ctx.measureText(txt).width + 56;
      ctx.fillStyle = dy.color; Battle.roundRect(ctx, x, y, w, 30, 15); ctx.fill();
      ctx.strokeStyle = dy.glow || 'rgba(0,0,0,0.3)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.font = '20px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'left'; ctx.fillText(dy.icon, x + 8, y + 23);
      ctx.font = '700 22px "Malgun Gothic",sans-serif';
      var cd = _curDye(b);
      ctx.fillStyle = cd === 'white' || cd === 'yellow' || cd === 'shaved' ? '#111' : '#fff';
      ctx.fillText(txt, x + 40, y + 23);
    },
    gauge: function (b, k, sk) {
      if (k === 0 && b.data.armed) return { fill: 1, label: '🗡 긋기 장전!' };
      if (k === 1) return { fill: 1 - sk.cd / sk.max, label: '염색 · 다음까지 ' + Math.max(0, sk.cd).toFixed(1) + 's',
        color: b.data.dye ? (DYES[b.data.dye].glow || DYES[b.data.dye].color) : '#ffffff' };
      return null;
    },
  },
  ch: {
    id: 'ch', name: '조우연', sub: 'CH의 모습',
    flavor: "\"Izakaya from CH\"",
    images: {
      base: { src: 'assets/ch.jpg', fx: 0.44, fy: 0.5, s: 0.95 },
      p2:   { src: 'assets/ch_p2.jpg', fx: 0.53, fy: 0.6, s: 0.95 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통',
    intro: '뱀을 풀어 경기장을 어지럽히는 소환형. 페이즈 2에서는 몸 한 곳이 우뚝 솟아 빙글빙글 돌며, 뱀에 닿을수록 길어지고 빨라진다.',
    init: function (bt, b) { b.data.tentAng = 0; b.data.tentLen = b.cfg.tent.length; b.data.tentSpin = b.cfg.tent.spin; b.data.tentHit = {}; },
    skills: [
      {
        key: 'snake', name: '배앰', desc: '무작위로 돌아다니는 뱀 소환(최대 10마리). 적에게 닿으면 데미지를 주고 사라짐, 여성(규순이 포함)에게는 2배',
        cd: function (c) { return c.snake.cd; },
        start: function (bt, b) {
          var c = b.cfg.snake;
          if (bt.ents.filter(function (e) { return e instanceof Snake && e.owner === b && !e.dead; }).length >= c.max) return null;   // 최대 10마리
          bt.add(new Snake(bt, b, c));
          bt.skillText(b, '배앰'); FX.sfx('skill');
          FX.burst(b.x, b.y, '#39ff88', 16, 500, 9, 0.5);
          return null;
        },
      },
      {
        key: 'tent', name: '텐트치기', passive: true,
        desc: '몸 한 곳이 우뚝 솟아 빙글빙글 돌며 닿는 적에게 데미지. 돌아다니는 뱀에 닿으면 길이가 길어지고 회전이 빨라진다',
        cd: function () { return 1e9; },
        start: function () {},
      },
    ],
    onPhase2: function (bt, b) {
      FX.banner('텐트치기', { color: '#ff8a00', size: 130, life: 1.3 });
      FX.ring(b.x, b.y, b.r, b.r * 3, 0.6, '#ff8a00', 16);
    },
    update: function (bt, b, dt) {
      if (b.phase < 2) return;
      var d = b.data, c = b.cfg.tent, now = bt.time;
      d.tentAng += d.tentSpin * dt;
      var seg = _tentSeg(b);
      bt.enemies(b).forEach(function (o) {
        if (!o.targetable || o.air || d.tentHit[o.id] > now) return;
        if (_segDist(o.x, o.y, seg) > o.r + c.width / 2) return;
        d.tentHit[o.id] = now + c.hitCooldown;
        bt.damage(o, c.damage, b, { color: '#ffb36b' });
        var nx = o.x - b.x, ny = o.y - b.y, dd = Math.hypot(nx, ny) || 1;
        o.vx += nx / dd * 350; o.vy += ny / dd * 350;
        FX.burst(seg.x1, seg.y1, '#ff8a00', 10, 500, 7, 0.35, 'spark');
        bt.emit('tentHit', { who: o.def.id });
      });
      // 돌아다니는 뱀에 닿으면 길어지고 빨라짐 (같은 뱀은 snakeCooldown초마다)
      bt.ents.forEach(function (e) {
        if (!(e instanceof Snake) || e.dead || e.tentCD > now) return;
        var touch = _segDist(e.x, e.y, seg) < c.width / 2 + 14 ||
          e.pts.some(function (p, i) { return i % 3 === 0 && _segDist(p.x, p.y, seg) < c.width / 2 + 10; });
        if (!touch) return;
        e.tentCD = now + c.snakeCooldown;
        d.tentLen = Math.min(c.maxLength, d.tentLen + c.growLength);
        d.tentSpin = Math.min(c.maxSpin, d.tentSpin + c.growSpin);
        FX.burst(seg.x1, seg.y1, '#39ff88', 16, 600, 9, 0.5);
        FX.text(seg.x1, seg.y1 - 30, '쑥!', '#ff8a00', 54, 0.8); FX.sfx('arm');
        bt.emit('tentGrow', { len: d.tentLen, spin: d.tentSpin });
      });
    },
    drawExtra: function (ctx, b, bt, x, y, r) {
      if (b.phase < 2) return;
      var d = b.data, w = b.cfg.tent.width, len = d.tentLen;
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.tentAng);
      ctx.shadowColor = '#ff8a00'; ctx.shadowBlur = 22;
      var g = ctx.createLinearGradient(r * 0.8, 0, r + len, 0);
      g.addColorStop(0, '#ffb07a'); g.addColorStop(1, '#ff6a3d');
      ctx.fillStyle = g; ctx.strokeStyle = '#7a2a10'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(r * 0.8, -w * 0.75); ctx.lineTo(r + len - w / 2, -w / 2);
      ctx.arc(r + len - w / 2, 0, w / 2, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(r * 0.8, w * 0.75); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    gauge: function (b, k, sk, bt) {
      if (k === 0) {
        var n = bt.ents.filter(function (e) { return e instanceof Snake && e.owner === b && !e.dead; }).length;
        return { label: '배앰 (뱀 ' + n + ')' };
      }
      return { fill: b.data.tentLen / b.cfg.tent.maxLength, label: '텐트 길이 ' + Math.round(b.data.tentLen) + ' · 회전 ' + b.data.tentSpin.toFixed(1), color: '#ff8a00' };
    },
  },
  hxpwm: {
    id: 'hxpwm', name: '조하람', sub: 'hxpwm의 모습',
    flavor: "\"(한숨을 쉬며) 아-아-아잇 뭐 이건 뭐, 그냥 뜨지 마시죠.\"",
    passives: [{ name: '유재후 저격', desc: function () { return '유재후(모든 모습)에게 주는 모든 피해 x' + CONFIG.chars.hxpwm.antiYoo; } }],
    dealMult: function (bt, s, t) { return t.def.name === '유재후' ? s.cfg.antiYoo : 1; },
    images: {
      base:  { src: 'assets/hxpwm.jpg', fx: 0.4, fy: 0.555, s: 0.32 },
      p2:    { src: 'assets/hxpwm_p2.jpg', fx: 0.69, fy: 0.4, s: 0.9 },
      call:  { src: 'assets/hxpwm_call.jpg', fx: 0.41, fy: 0.33, s: 0.5 },
      happy: { src: 'assets/hxpwm_happy.jpg', fx: 0.72, fy: 0.29, s: 0.42 },
    },
    portrait: function (b) { return b.data.calling ? 'call' : b.data.happy > 0 ? 'happy' : b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통',
    intro: '충전기로 상대를 낚는 함정형. 맵에 충전기를 뿌려 적이 먹으면 초음파로 확정 피해를 주고, 자기가 먹으면 해피해져 받는 피해가 절반이 된다. 페이즈 2에서는 긴급소집으로 동료들의 스킬을 사방에서 불러온다.',
    init: function (bt, b) { b.data.happy = 0; b.data.calling = false; },
    skills: [
      {
        key: 'charger', name: '주뱃', passive: true,
        desc: '맵에 충전기가 랜덤 생성. 적이 먹으면 초음파로 확정 피해, 본인이 먹으면 해피(잠시 이동속도 감소, 받는 피해 절반)',
        cd: function (c) { return c.charger.interval; },
        start: function (bt, b) {
          var c = b.cfg.charger;
          var mine = bt.ents.filter(function (e) { return e instanceof Charger && e.owner === b && !e.dead; }).length;
          if (mine >= c.maxChargers) return;
          var p = bt.randomPoint(70);
          for (var i = 0; i < 12; i++) {   // 공 바로 위에는 안 생기게
            if (bt.balls.every(function (o) { return !o.alive || Math.hypot(o.x - p.x, o.y - p.y) > o.r + 90; })) break;
            p = bt.randomPoint(70);
          }
          bt.add(new Charger(bt, b, p));
          FX.ring(p.x, p.y, 10, 110, 0.5, '#fff27a', 10);
          FX.burst(p.x, p.y, '#fff27a', 14, 400, 6, 0.4, 'spark');
          FX.sfx('spawn');
          bt.emit('chargerSpawn');
        },
      },
      {
        key: 'call', name: '긴급소집', desc: '2초간 멈춰서 맵 사방에서 조우연의 뱀·한규성의 돌·김선율의 칼을 적에게 날린다',
        cd: function (c) { return c.call.cd; },
        start: function (bt, b) {
          var c = b.cfg.call, t = 0, next = 0, n = 0, keep = { vx: b.vx, vy: b.vy };
          b.data.calling = true; b.vx = b.vy = 0;
          FX.banner('긴급소집!', { color: '#ff3b3b', size: 140, life: 1.3 });
          FX.sfx('awaken'); FX.flash('#ff0000', 0.22, 0.4); FX.shake(14);
          bt.emit('call');
          if (bt.hasSynergy('izk', b.team)) izkCall(bt, b);
          return {
            moves: false, uninterruptible: true,
            update: function (dt) {
              t += dt; b.jx = _rnd(-3, 3); b.jy = _rnd(-3, 3);
              while (t >= next && next < c.duration) { hxpwmCallShot(bt, b, n++); next += c.interval; }
              return t >= c.duration;
            },
            end: function () { b.data.calling = false; b.jx = b.jy = 0; _restoreSpeed(b, keep.vx, keep.vy); },
          };
        },
      },
    ],
    update: function (bt, b, dt) {
      var c = b.cfg.charger, d = b.data;
      if (d.happy > 0) {
        d.happy -= dt;
        if (Math.random() < dt * 8) FX.particle({ x: b.x + _rnd(-b.r, b.r) * 0.6, y: b.y - b.r * 0.5, vx: _rnd(-20, 20), vy: -120, life: 0.7, size: 9, color: '#ff7ad9' });
      }
      b.slow = d.happy > 0 ? c.happySpeed : 1;
      b.takenMult = d.happy > 0 ? c.happyTaken : 1;
    },
    drawExtra: function (ctx, b, bt, x, y, r) {
      ctx.font = '50px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (b.data.calling) ctx.fillText('📢', x + r * 0.8, y - r - 20);
      else if (b.data.happy > 0) ctx.fillText('💗', x + r * 0.8, y - r - 20);
    },
    gauge: function (b, k, sk, bt) {
      if (k === 0) {
        var n = bt.ents.filter(function (e) { return e instanceof Charger && e.owner === b && !e.dead; }).length;
        return { label: '주뱃 · 충전기 ' + n + '/' + b.cfg.charger.maxChargers + (b.data.happy > 0 ? ' · 해피' : '') };
      }
      return null;
    },
  },
  dev: {
    id: 'dev', name: '문남휘', sub: '개발자의 모습',
    flavor: "\"이 게임의 개발자이다.\"",
    images: {
      base: { src: 'assets/dev.jpg', fx: 0.51, fy: 0.27, s: 0.4 },
      p2:   { src: 'assets/dev_p2.jpg', fx: 0.51, fy: 0.235, s: 0.45 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통',
    intro: '이 게임을 만든 장본인. 부딪힐 때마다 밸런스 패치로 상대를 너프하고 자기는 버프한다. 페이즈 2에서는 치트를 켜서 굵은 레이저를 쏜다.',
    init: function (bt, b) { b.data.patchF = 1; b.data.patches = 0; },
    skills: [
      {
        key: 'patch', name: '밸런스 패치', passive: true,
        desc: '닿을 때마다 상대의 모든 스탯(체력·이동속도·공격력) 5% 감소, 본인은 5% 증가 (최대 15회 중첩)',
        cd: function () { return 1e9; },
        start: function () {},
      },
      {
        key: 'cheat', name: '치트', desc: '상대를 조준한 뒤 굵은 레이저 발사 (경로의 모든 적 관통). 밸런스 패치를 많이 했을수록 강해짐',
        cd: function (c) { return c.cheat.cd; },
        start: function (bt, b) { return devLaser(bt, b); },
      },
    ],
    passives: [{ name: '개발자 박치기', desc: function () { return '몸통 박치기 데미지 ' + CONFIG.chars.dev.contactDamage + ' (기본 ' + CONFIG.battle.contactDamage + ')'; } }],
    onContact: function (bt, s, t) { if (!s.hidden && bt.canEffect(s, t)) devPatch(bt, s, t); },
    // 디마디영디: 아군과 닿으면 아군 스탯 +2% (아군 한 명당 최대 allyMax번)
    onAllyContact: function (bt, s, t) {
      if (!_dmdyd(bt, s)) return;
      var c = CONFIG.synergy.dmdyd;
      if ((t.data.devGift || 0) >= c.devAllyMax) return;
      t.data.devGift = (t.data.devGift || 0) + 1;
      _scaleStats(t, 1 + c.devAlly);
      FX.text(t.x, t.y - t.r - 50, '핫픽스 +' + Math.round(c.devAlly * 100) + '%', '#c6ff00', 40, 0.8); FX.sfx('patch');
      bt.emit('devGift', { who: t.def.id, n: t.data.devGift });
    },
    gauge: function (b, k) {
      if (k === 0) return { fill: b.data.patches / b.cfg.patch.maxStacks, label: '밸런스 패치 ' + b.data.patches + '/' + b.cfg.patch.maxStacks + ' · x' + b.data.patchF.toFixed(2), color: '#c6ff00' };
      return { label: '치트 · 위력 ' + Math.round(devCheatDamage(b) * b.dmgMult) };
    },
  },

  rock: {
    id: 'rock', name: '유재운', sub: '락사모의 모습',
    flavor: "\"네 줄 기타 아닙니다;\"",
    images: {
      base: { src: 'assets/rock.jpg', fx: 0.48, fy: 0.175, s: 0.35 },
      p2:   { src: 'assets/rock_p2.jpg', fx: 0.4, fy: 0.45, s: 0.85 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통',
    intro: '베이스 치는 밴드맨. 베이스 음파로 주변을 때리고, 맞힐수록 다음 연주가 빨라진다. 페이즈 2에서는 연습 후 발냄새가 퍼져 가까이 올수록 큰 피해를 준다.',
    skills: [
      {
        key: 'bass', name: '들린다고', desc: '베이스를 연주해 퍼지는 음파로 주변 적에게 데미지. 맞히면 쿨타임 감소 (여러 명을 맞혀도 한 번만)',
        cd: function (c) { return c.bass.cd; },
        start: function (bt, b) {
          var c = b.cfg.bass, ctr = bt.aimArea(b, b.x, b.y), refunds = 0;
          bt.skillText(b, '들린다고?!', '#ff8c42'); FX.sfx('bass'); FX.shake(c.shake);
          FX.ring(ctr.x, ctr.y, b.r, c.radius * 1.1, 0.6, '#ffffff', 6);
          ['♪', '♫', '♬', '♪'].forEach(function (n, i) {
            var a = i / 4 * Math.PI * 2 + _rnd(-0.3, 0.3);
            FX.text(b.x + Math.cos(a) * b.r * 1.3, b.y + Math.sin(a) * b.r * 1.3, n, '#ffb36b', 54, 0.9);
          });
          bt.add(new Wave(bt, b, ctr.x, ctr.y, c.radius, c.speed, c.damage, '#ff8c42', 'bassHit', {
            knock: 0,   // 들린다고는 넉백 없음
            onHit: function () {
              if (refunds++ >= c.refundMax) return;   // 한 번 연주에 쿨감은 refundMax번까지 (기본 1번)
              var sk = b.skills[0];
              sk.cd = Math.max(0, sk.cd - c.refund);
              bt.emit('bassRefund');
            },
          }));
          return null;
        },
      },
      {
        key: 'stink', name: '연습 후 발냄새', passive: true,
        desc: '본인 주변에 냄새 영역 생성. 가까이 올수록 초당 데미지 증가',
        cd: function () { return 1e9; },
        start: function () {},
      },
    ],
    onPhase2: function (bt, b) {
      bt.add(new StinkZone(bt, b));
      FX.banner('연습 후 발냄새', { color: '#c6e36b', size: 110, life: 1.3 });
      FX.burst(b.x, b.y, '#9acd32', 30, 500, 24, 1.0, 'smoke');
    },
  },

  gym: {
    id: 'gym', name: '진형권', sub: '헬스장의 모습',
    flavor: "\"어 형권이형이야~\"",
    images: {
      base: { src: 'assets/psych.jpg', fx: 0.25, fy: 0.31, s: 0.3 },   // 노래 부르는 사진 (얼굴 크게)
      p2:   { src: 'assets/gym_p2.jpg', fx: 0.585, fy: 0.32, s: 0.45 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 느림 · 체력 최고',
    intro: '헬스장 터줏대감. 맵에 생기는 아령을 먹을수록 체력·공격력·덩치가 커진다. 페이즈 2에서는 프로틴까지 챙겨 먹고 조우연의 뱀 피해가 절반이 된다. 초대받지 못한 손님(유재후·???)에게는 2배 피해.',
    init: function (bt, b) {
      b.data.bulk = 0;
      if (_dmdyd(bt, b)) b.skills.forEach(function (sk) { sk.max *= CONFIG.synergy.dmdyd.gymSpawn; sk.cd = Math.min(sk.cd, sk.max); });   // 디마디영디: 아령·프로틴 더 자주
    },
    passives: [
      { name: '헬창 박치기', desc: function () { return '몸통 박치기 데미지 ' + CONFIG.chars.gym.contactDamage + ' (기본 ' + CONFIG.battle.contactDamage + ')'; } },
      { name: '손님 사냥꾼', desc: function () { return '초대받지 못한 손님에게 주는 피해 x' + CONFIG.chars.gym.antiUninvited + ' (개인전에선 유재후·???에게, 보스 히어로 바통에게도)'; } },
      { name: '근육 갑옷', desc: function () { return '페이즈 2에서 조우연의 뱀에게 받는 피해 x' + CONFIG.chars.gym.snakeTaken; } },
    ],
    snakeTaken: function (b) { return b.phase >= 2 ? b.cfg.snakeTaken : 1; },
    kindTaken: function (b, kind) { return kind === 'vitamin' ? b.cfg.vitaminTaken : 1; },   // 단백질 먹방: 비타민 피해 반감
    // 캐릭터 패시브: 초대받지 못한 손님에게 피해 2배 (개인전에선 유재후 자체)
    dealMult: function (bt, s, t) { return bt.isUninvited(t) || t.def.batonBoss ? s.cfg.antiUninvited : 1; },   // 보스 히어로 바통도 유재후
    skills: [
      {
        key: 'dumbbell', name: '벌크업', passive: true,
        desc: '주기적으로 아령 생성. 본인이 먹으면 체력·공격력·크기 증가, 적이 먹으면 잠시 이동속도 감소',
        cd: function (c) { return c.dumbbell.interval; },
        start: function (bt, b) { gymSpawn(bt, b, 'dumbbell'); },
      },
      {
        key: 'protein', name: '단백질 먹방', passive: true,
        desc: '주기적으로 프로틴 생성. 본인이 먹으면 이동속도 증가+체력 회복, 다른 사람이 먹으면 소폭 회복. 단백질로 다져진 몸이라 포식자 한규성의 비타민 피해는 항상 절반',
        cd: function (c) { return c.protein.interval; },
        start: function (bt, b) { gymSpawn(bt, b, 'protein'); },
      },
    ],
    gauge: function (b, k) {
      if (k === 0) return { label: '벌크업 x' + b.data.bulk };
      return null;
    },
  },
  psych: {
    id: 'psych', name: '진형권', sub: '심리학자의 모습',
    flavor: "\"노래가 들리면… 넌 이미 맞을 준비가 된 거야.\"",
    images: {
      base: { src: 'assets/gym.jpg', fx: 0.34, fy: 0.39, s: 0.7 },
      p2:   { src: 'assets/psych_p2.jpg', fx: 0.49, fy: 0.45, s: 0.7 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통 · 표식형',
    intro: '노래로 상대를 길들이는 심리학자. 노래를 틀어 두다가 쿨타임이 되면 한 명만 노려 돌진하고, 세 번 맞힌 상대에겐 표식(🔔)을 찍은 뒤 표식 없는 다음 상대로 넘어간다. 페이즈 2에서는 노래를 맵 전체에 울려 표식 찍힌 적 모두에게 돌진과 같은 피해를 준다.',
    init: function (bt, b) { b.data.marks = {}; b.data.hits = {}; b.data.target = null; b.data.note = 0; },
    passives: [
      { name: '손님 사냥꾼', desc: function () { return '초대받지 못한 손님에게 주는 피해 x' + CONFIG.chars.psych.antiUninvited + ' (개인전에선 유재후·???에게, 보스 히어로 바통에게도)'; } },
    ],
    dealMult: function (bt, s, t) { return bt.isUninvited(t) || t.def.batonBoss ? s.cfg.antiUninvited : 1; },
    skills: [
      {
        key: 'pavlov', name: '파블로프의 개(준비)',
        desc: '쿨타임 동안 노래를 틀다가, 쿨타임이 되면 고정한 한 명에게 돌진해 ' + CONFIG.chars.psych.pavlov.damage + ' 피해 (부딪힌 반동으로 본인도 상대의 박치기 피해를 받음). 같은 적을 ' + CONFIG.chars.psych.pavlov.marks + '번 맞히면 표식(🔔)을 찍고, 표식 없는 적으로 타겟을 바꾼다',
        cd: function (c) { return c.pavlov.cd; },
        start: function (bt, b) {
          var c = b.cfg.pavlov, t = psychTarget(bt, b);
          if (!t) return null;
          var p = bt.aim(b, t.x, t.y), track = p.miss ? null : t, dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
          b.vx = dx / d * c.speed; b.vy = dy / d * c.speed; b.phasing = true;
          bt.skillText(b, '돌진!', '#7ad1ff'); FX.sfx('roll');
          var traveled = 0, gt = 0;
          return {
            moves: false,
            update: function (dt) {
              if (track && track.targetable) {   // 타겟 쪽으로 살짝 꺾음
                var cur = Math.atan2(b.vy, b.vx), want = Math.atan2(track.y - b.y, track.x - b.x);
                var diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), turn = Math.max(-c.turn * dt, Math.min(c.turn * dt, diff));
                cur += turn; b.vx = Math.cos(cur) * c.speed; b.vy = Math.sin(cur) * c.speed;
              }
              b.x += b.vx * dt; b.y += b.vy * dt; bt.walls(b);
              traveled += c.speed * dt;
              gt += dt; if (gt > 0.03) { gt = 0; _ghost(b); }
              var o = bt.enemies(b).find(function (e) { return e.targetable && !e.air && _dist(e, b) < e.r + b.r; });
              if (o) {
                bt.damage(o, c.damage, b, { color: '#7ad1ff', kind: 'pavlov' });
                bt.damage(b, o.cfg.contactDamage || CONFIG.battle.contactDamage, o, { kind: 'contact' });   // 부딪힌 반동: 본인도 상대 박치기 피해
                var a = Math.atan2(o.y - b.y, o.x - b.x); o.vx += Math.cos(a) * 600; o.vy += Math.sin(a) * 600;
                FX.ring(o.x, o.y, o.r, o.r * 2, 0.3, '#7ad1ff', 10); FX.shake(10);
                psychHit(bt, b, o);
                return true;
              }
              return traveled >= c.distance;
            },
            end: function () { b.phasing = false; _restoreSpeed(b, -b.vx, -b.vy); },
          };
        },
      },
      {
        key: 'pavlov2', name: '파블로프의 개(완성)',
        desc: '노래를 크게 틀어 맵 전체에 울린다. 표식이 찍힌 적은 1스킬과 같은 피해, 표식이 없으면 피해 없음',
        cd: function (c) { return c.pavlov2.cd; },
        start: function (bt, b) {
          var c = b.cfg.pavlov, n = 0;
          FX.banner('파블로프의 개', { color: '#7ad1ff', sub: '🎵 노래가 울려 퍼진다', size: 110, life: 1.3 });
          FX.sfx('guitar'); FX.shake(12);
          for (var i = 0; i < 4; i++) FX.ring(b.x, b.y, b.r, 1600, 0.7 + i * 0.15, i % 2 ? '#ffffff' : '#7ad1ff', 16 - i * 3);
          bt.enemies(b).forEach(function (o) {
            if (!o.targetable || !b.data.marks[o.id]) return;
            bt.damage(o, c.damage, b, { color: '#7ad1ff', kind: 'pavlov2' });
            FX.text(o.x, o.y - o.r - 70, '🔔 딸랑!', '#ffe680', 44, 0.9);
            n++;
          });
          bt.emit('pavlovRing', { hit: n });
          return null;
        },
      },
    ],
    // 쿨타임 동안 노래 (음표)
    update: function (bt, b, dt) {
      if (b.action || b.hidden) return;
      b.data.note += dt;
      if (b.data.note < (b.phase >= 2 ? 0.22 : 0.35)) return;
      b.data.note = 0;
      FX.text(b.x + _rnd(-b.r, b.r), b.y - b.r * 0.6, Math.random() < 0.5 ? '♪' : '♫', Math.random() < 0.5 ? '#7ad1ff' : '#ffffff', b.phase >= 2 ? 44 : 34, 0.9);
    },
    // 고정 타겟 점선 + 맞힌 횟수, 표식 찍힌 적 머리 위 종
    drawExtra: function (ctx, b, bt, x, y, r, time) {
      var t = b.data.target, c = b.cfg.pavlov;
      ctx.save();
      if (t && t.alive && !t.hidden) {
        ctx.setLineDash([12, 14]); ctx.lineDashOffset = -time * 40; ctx.strokeStyle = 'rgba(122,209,255,0.35)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.setLineDash([]);
        var n = b.data.hits[t.id] || 0;
        for (var i = 0; i < c.marks; i++) {
          ctx.fillStyle = i < n ? '#7ad1ff' : 'rgba(255,255,255,0.25)';
          ctx.beginPath(); ctx.arc(t.x + (i - (c.marks - 1) / 2) * 20, t.y + t.r + 18, 7, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.font = '40px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      bt.balls.forEach(function (o) { if (b.data.marks[o.id] && o.alive && !o.hidden) ctx.fillText('🔔', o.x - o.r * 0.75, o.y - o.r * 0.75 + Math.sin(time * 6 + o.id) * 4); });
      ctx.restore();
    },
    gauge: function (b, k) {
      if (k === 0) { var n = Object.keys(b.data.marks).length; return { label: '파블로프 · 표식 ' + n }; }
      return null;
    },
  },

  chino: {
    id: 'chino', name: '이윤빈', sub: '치노의 모습',
    flavor: "\"내 전담이 어디갔지?\"",
    images: {
      base: { src: 'assets/chino.jpg', fx: 0.47, fy: 0.295, s: 0.42 },
      p2:   { src: 'assets/chino_p2.png', fx: 0.57, fy: 0.31, s: 0.5 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통',
    intro: '전담을 늘 어디 뒀는지 까먹는 치노. 전담을 못 찾는 동안 짜증이 쌓여 점점 강해지지만, 찾으면 진정해서 원래대로 돌아온다. 페이즈 2에서는 맞은 것도 까먹고, 전담을 찾은 것도 까먹는다.',
    passives: [{ name: '여성', desc: '조우연의 뱀에게 받는 피해 2배' }, { name: '박치기', desc: function () { return '몸통 박치기 데미지 ' + CONFIG.chars.chino.contactDamage + ' (공격 스킬이 없는 대신)'; } }],
    female: function () { return true; },
    init: function (bt, b) { b.data.vapeF = 1; b.data.growT = 0; b.data.vapeRespawn = 1.0; b.data.forgetHitUntil = 0; b.data.forgetVapeUntil = 0; },
    skills: [
      {
        key: 'vape', name: '내 전담 어딨어', passive: true,
        desc: '맵에 전담이 하나 생성. 못 찾는 동안 3초마다 모든 스탯 8% 증가(최대 2.5배), 찾으면 스탯 초기화',
        cd: function () { return 1e9; }, start: function () {},
      },
      {
        key: 'forget', name: '기억력 감퇴', passive: true,
        desc: '맞으면 맞은 걸 까먹어서 피해 무효화(4초 쿨). 전담을 찾아도 까먹어서 스탯이 초기화되지 않음(12초 쿨, 따로 적용)',
        cd: function () { return 1e9; }, start: function () {},
      },
    ],
    update: function (bt, b, dt) {
      var c = b.cfg.vape, d = b.data;
      // 전담이 없으면 잠시 뒤 새로 생성
      var lost = _dmdyd(bt, b);   // 디마디영디: 전담을 평생 못 찾음 (안 나옴), 짜증은 절반
      if (!lost && !bt.ents.some(function (e) { return e instanceof Vape && e.owner === b && !e.dead; })) {
        d.vapeRespawn -= dt;
        if (d.vapeRespawn <= 0) { d.vapeRespawn = c.respawn; chinoSpawnVape(bt, b); }
      }
      // 못 찾는 동안 스탯 증가
      d.growT += dt;
      if (d.growT >= c.growEvery) {
        d.growT -= c.growEvery;
        var gr = c.growRate * (lost ? CONFIG.synergy.dmdyd.chinoGrow : 1), k = Math.min(c.maxGrow, d.vapeF * (1 + gr)) / d.vapeF;
        if (k > 1) {
          _scaleStats(b, k); d.vapeF *= k;
          FX.text(b.x, b.y - b.r - 40, '짜증 +' + Math.round(gr * 100) + '%', '#ff9ecf', 36, 0.7);
          bt.emit('vapeGrow', { f: d.vapeF });
        }
      }
    },
    // 기억력 감퇴: 페이즈 2에서 쿨타임마다 한 번 피해 무효화
    absorb: function (bt, t) {
      if (t.phase < 2 || bt.time < t.data.forgetHitUntil) return false;
      t.data.forgetHitUntil = bt.time + t.cfg.forget.hitCd;
      FX.text(t.x, t.y - t.r - 50, '방금 뭐였지?', '#b6ff00', 48, 0.9);
      FX.ring(t.x, t.y, t.r, t.r * 1.8, 0.35, '#b6ff00', 10);
      FX.sfx('glitch');
      bt.emit('forgetHit');
      return true;
    },
    drawExtra: function (ctx, b, bt, x, y, r) {
      if (b.phase >= 2 && bt.time >= b.data.forgetHitUntil) {   // 무효화 준비됨 표시
        ctx.save(); ctx.strokeStyle = 'rgba(182,255,0,0.7)'; ctx.lineWidth = 4; ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.arc(x, y, r + 24, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    },
    gauge: function (b, k, sk, bt) {
      var d = b.data;
      if (k === 0) return { fill: (d.vapeF - 1) / (b.cfg.vape.maxGrow - 1), label: '전담 찾는 중 · x' + d.vapeF.toFixed(2), color: '#ff9ecf' };
      var h = Math.max(0, d.forgetHitUntil - bt.time), v = Math.max(0, d.forgetVapeUntil - bt.time);
      return { fill: 1 - h / b.cfg.forget.hitCd, label: '까먹기 ' + (h ? h.toFixed(1) + 's' : '준비') + ' · 전담 ' + (v ? v.toFixed(0) + 's' : '준비'), color: '#b6ff00' };
    },
  },
  seori: {
    id: 'seori', name: '서리', sub: '애완견의 모습',
    flavor: "\"멍\"",
    images: {
      base: { src: 'assets/seori.jpg', fx: 0.5, fy: 0.45, s: 0.85 },
      p2:   { src: 'assets/seori_p2.jpg', fx: 0.4, fy: 0.33, s: 0.42 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 빠름',
    intro: '바통의 애완견. 돌아다니는 길마다 침을 흘려 밟은 적을 끈적하게 만든다. 페이즈 2에서는 짧게 돌격해 물고 늘어지며 더 큰 침을 사방에 퍼뜨린다. 주인 유재후는 살살 문다.',
    passives: [{ name: '바통의 애완견', desc: function () { return '유재후(모든 모습)에게 주는 피해 x' + CONFIG.chars.seori.batonDeal; } }, { name: '암컷', desc: '여성 취급 (조우연의 뱀 피해 2배 등 여성 효과를 받음)' }],
    female: function () { return true; },
    dealMult: function (bt, s, t) { return t.def.name === '유재후' ? s.cfg.batonDeal : 1; },
    init: function (bt, b) { seoriDrool(bt, b); },
    skills: [
      {
        key: 'drool', name: '침흘리기', passive: true,
        desc: '지나간 길에 침 웅덩이를 남김. 밟은 적은 느려지고 지속 피해. 시간이 지나면 마름',
        cd: function () { return 1e9; }, start: function () {},
      },
      {
        key: 'bite', name: '물기', desc: '가까운 적에게 짧게 돌격해 1초 동안 물고 늘어짐 (연속 피해 + 큰 침 퍼뜨리기). 물 때는 부딪힌 것으로 쳐서 서로 박치기 피해를 주고받음',
        cd: function (c) { return c.bite.cd; },
        start: function (bt, b) { return seoriBite(bt, b); },
      },
    ],
  },

  seyu: {
    id: 'seyu', name: '차승민', sub: '세유의 모습',
    flavor: "\"안녕하떼요, 떼유입니다.\"",
    images: {
      base: { src: 'assets/seyu.png', fx: 0.48, fy: 0.42, s: 0.72 },
      p2:   { src: 'assets/seyu_p2.png', fx: 0.5, fy: 0.42, s: 0.8 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통 · 추격 시 빠름',
    intro: '상대만 보이면 달려드는 세유. 부딪히면 한 대 더 때리는 정신나간 세트를 넣고, 페이즈 2에서는 그동안 맞은 만큼 세지는 사다리꼴 강펀치를 날린다.',
    passives: [
      { name: '추격', desc: function () { return '상대에게 다가가는 중엔 이동속도 x' + CONFIG.chars.seyu.chase; } },
      { name: '박치기', desc: function () { return '몸통 박치기 데미지 ' + CONFIG.chars.seyu.contactDamage + ' (기본 ' + CONFIG.battle.contactDamage + ')'; } },
    ],
    init: function (bt, b) { b.data.takenSince = 0; b.data.chasing = false; b.data.punchReady = false; },
    // 강펀치 준비 중이면 범위 안에 상대가 들어올 때 발동
    update: function (bt, b) {
      if (!b.data.punchReady || b.action || b.disabled || b.hidden) return;
      var t = seyuInRange(bt, b);
      if (t) b.action = seyuPunch(bt, b, t);
    },
    onHurt: function (bt, t, amt) { t.data.takenSince += amt; },
    onPhase2: function (bt, b) { b.data.takenSince = 0; },
    speedMul: function (bt, b) {
      var n = bt.nearest(b), sp = Math.hypot(b.vx, b.vy);
      b.data.chasing = false;
      if (!n || sp < 1) return 1;
      var dx = n.x - b.x, dy = n.y - b.y, dot = (b.vx * dx + b.vy * dy) / (sp * (Math.hypot(dx, dy) || 1));
      b.data.chasing = dot > 0.6;
      return 1 + (b.cfg.chase - 1) * Math.max(0, Math.min(1, (dot - 0.3) / 0.5));
    },
    onContact: function (bt, s, t) {
      if (s.hidden || !bt.canEffect(s, t)) return;
      var c = s.cfg.set, dmg = (s.cfg.contactDamage || CONFIG.battle.contactDamage) * c.mult;
      bt.after(c.delay, function () {
        if (!s.alive || !t.alive) return;
        bt.damage(t, dmg, s, { color: '#ffcc00', kind: 'set' });
        FX.text(t.x, t.y - t.r - 50, '한 대 더!', '#ffcc00', 44, 0.8); FX.sfx('punch');
        FX.burst(t.x, t.y, '#ffcc00', 14, 600, 8, 0.4, 'spark');
        bt.emit('setHit', { who: t.def.id });
      });
    },
    skills: [
      {
        key: 'set', name: '정신나간 세트', passive: true,
        desc: '닿으면 한 번 더 때려서 추가 피해 (두 번째는 박치기의 1.5배)',
        cd: function () { return 1e9; }, start: function () {},
      },
      {
        key: 'punch', name: '강펀치', desc: '쿨타임이 차면 준비했다가 상대가 범위에 들어오면 기를 모아 사다리꼴 펀치. 쿨타임 동안 받은 피해만큼 세지고 커짐. 가운데(정타)는 강하고 가장자리는 약함',
        cd: function (c) { return c.punch.cd; },
        holds: function (b) { return b.data.punchReady; },
        start: function (bt, b) {
          b.data.punchReady = true;
          FX.text(b.x, b.y - b.r - 40, '강펀치 준비', '#ffcc00', 40, 0.8); FX.sfx('arm');
          bt.emit('punchReady');
          return null;
        },
      },
    ],
    drawExtra: function (ctx, b, bt, x, y, r) {
      if (b.data.chasing && !b.action) {   // 추격 중 속도선
        var a = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.strokeStyle = 'rgba(255,204,0,0.6)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (var i = -1; i <= 1; i++) {
          var ox = x - Math.cos(a) * (r + 10) - Math.sin(a) * i * r * 0.5, oy = y - Math.sin(a) * (r + 10) + Math.cos(a) * i * r * 0.5;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - Math.cos(a) * 50, oy - Math.sin(a) * 50); ctx.stroke();
        }
        ctx.restore();
      }
    },
    gauge: function (b, k) {
      if (k === 1) return b.data.punchReady ? { fill: 1, label: '강펀치 준비! · 위력 ' + Math.round(_seyuPower(b)), color: '#ffcc00' } : { label: '강펀치 · 위력 ' + Math.round(_seyuPower(b)) };
      return null;
    },
  },

  hau: {
    id: 'hau', name: '최휘', sub: '사랑하우의 모습',
    flavor: "\"병신같은 새끼야 난, 결국 손에 남는게 ㅈ도 없지 난.\"",
    images: {
      base: { src: 'assets/hau_rich.png', fx: 0.49, fy: 0.45, s: 0.6 },
      poor: { src: 'assets/hau_poor.png', fx: 0.5, fy: 0.3, s: 0.55 },
      p2:   { src: 'assets/hau_p2.png', fx: 0.5, fy: 0.5, s: 0.8 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : (b.data.bal != null && b.data.bal < b.cfg.account.max * 0.5 ? 'poor' : 'base'); },
    blurb: '이동 보통 · 잔고에 따라 변함',
    intro: '급등주 타다가 100만원 잃은 사랑하우. 알바비로 계좌가 차오르지만, 돈이 많으면 느긋해져서 약해지고 돈이 없으면 독해져서 강해진다. 주식이 떨어질 때마다 주변을 때린다.',
    passives: [
      { name: '계좌', desc: function () { var a = CONFIG.chars.hau.account; return a.pay + '초마다 알바비 +' + a.payAmt + '만원. 잔고가 많을수록 주는 피해·이동속도 감소(최대 x' + a.richMul + '), 적을수록 증가(최대 x' + a.poorMul + ')'; } },
      { name: '사고', desc: function () { return '잔고가 꽉 차면 ' + CONFIG.chars.hau.account.crashDelay + '초 뒤 사고가 나서 절반이 날아감'; } },
      { name: '파산 박치기', desc: function () { var a = CONFIG.chars.hau.account; return '잔고 0이 된 뒤 적과 부딪히면 ' + a.bankrupt + ' 피해 (본인도 ' + a.selfDamage + '), 잔고 절반으로 복구'; } },
    ],
    init: function (bt, b) {
      var a = b.cfg.account, d = b.data;
      d.bal = a.start; d.payT = 0; d.crashT = -1; d.broke = false; d.chart = [100]; d.lastUp = true;
    },
    dealMult: function (bt, s) { return _hauMul(s); },
    speedMul: function (bt, b) { return _hauMul(b); },
    update: function (bt, b, dt) {
      var a = b.cfg.account, d = b.data;
      d.payT += dt;
      if (d.payT >= a.pay) {
        d.payT -= a.pay;
        hauSet(bt, b, d.bal + a.payAmt);
        FX.text(b.x, b.y - b.r - 30, '알바비 +' + a.payAmt, '#ffd400', 30, 0.6); FX.sfx('coin');
        bt.emit('hauPay');
      }
      if (d.crashT >= 0) {
        d.crashT -= dt;
        if (d.crashT < 0) {
          hauSet(bt, b, d.bal / 2);
          FX.banner('사고 발생!', { color: '#ff3b3b', sub: b.name + ' 잔고 반토막', size: 110, life: 1.2 });
          FX.sfx('crash'); FX.shake(16);
          bt.emit('hauCrash');
        }
      }
    },
    onContact: function (bt, s, t) {
      var d = s.data, a = s.cfg.account;
      if (!d.broke) return;
      d.broke = false;
      var dealt = bt.damage(t, a.bankrupt, s, { color: '#ff3b3b', kind: 'bankrupt', noMult: true });
      hauBankruptFX(bt, s, t, dealt || a.bankrupt);
      bt.damage(s, a.selfDamage, null, { color: '#ff3b3b', kind: 'bankruptSelf' });
      hauSet(bt, s, a.max / 2);
      bt.emit('hauBankrupt', { who: t.def.id });
    },
    skills: [
      {
        key: 'stock', name: '급등주 타다가 100만원 잃었다고!!!', desc: '주식이 한 칸 움직임: 30% 확률로 상승(잔고 +), 70% 확률로 하락(잔고 −) + 주변 범위 공격. 그래프는 경기장 오른쪽 위',
        cd: function (c) { return c.stock.cd; },
        start: function (bt, b) { hauStock(bt, b, Math.random() < b.cfg.stock.upChance, 1); return null; },
      },
      {
        key: 'plunge', name: '급락 구간', desc: '쿨타임마다 주식이 2배로 폭락: 잔고 크게 감소 + 더 넓고 센 범위 공격',
        cd: function (c) { return c.plunge.cd; },
        start: function (bt, b) { FX.banner('급락 구간', { color: '#3b8bff', size: 110, life: 1.0 }); hauStock(bt, b, false, 2); return null; },
      },
    ],
    drawExtra: function (ctx, b, bt, x, y, r) {
      ctx.font = '50px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (b.data.broke) ctx.fillText('💸', x + r * 0.8, y - r - 20);
      else if (b.data.crashT >= 0 && Math.sin(bt.time * 16) > 0) ctx.fillText('⚠️', x + r * 0.8, y - r - 20);
    },
    // 경기장 오른쪽 위 주식 그래프 (최휘가 여럿이면 아래로 쌓음)
    drawOverlay: function (ctx, b, bt) {
      if (!b.alive || !b.data.chart) return;
      var list = bt.balls.filter(function (o) { return o.alive && o.data.chart && o.def.drawOverlay === b.def.drawOverlay; }), i = list.indexOf(b), A = CONFIG.arena;
      hauChart(ctx, b, bt, A.x + A.w - 300, A.y + 12 + i * 152, 288, 140);
    },
    gauge: function (b, k) {
      if (k === 0) return { fill: b.data.bal / b.cfg.account.max, label: '잔고 ' + Math.round(b.data.bal) + '만 · x' + _hauMul(b).toFixed(2) + (b.data.broke ? ' · 파산' : ''), color: '#ffd400' };
      return null;
    },
  },

  nogwang: {
    id: 'nogwang', name: '유재후', sub: '노광석의 모습',
    flavor: "\"할매 할매 할매~ 허리나간 할매 새끼\"",
    images: {
      base: { src: 'assets/nogwang.jpg', fx: 0.47, fy: 0.38, s: 0.42 },
      p2:   { src: 'assets/nogwang_p2.jpg', fx: 0.53, fy: 0.16, s: 0.24 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 보통',
    intro: '핫식스 포도맛을 맵 곳곳에 쟁여두는 기타리스트 유재후. 같은 팀이 마시면 힘이 나고 적이 마시면 힘이 빠진다. 페이즈 2에서는 포코의 불협화음으로 앞을 쓸어버린다.',
    skills: [
      {
        key: 'hot6', name: '핫식스 쟁여놓기', passive: true,
        desc: '맵에 핫식스 포도맛 생성. 본인·같은 팀이 먹으면 공격력·이동속도 영구 증가, 적이 먹으면 공격력 영구 감소',
        cd: function (c) { return c.hot6.interval; },
        start: function (bt, b) { nogwangSpawn(bt, b); },
      },
      {
        key: 'poco', name: '포코의 불협화음', desc: '진행 방향 부채꼴로 기타 파동. 맞은 적은 피해 + 크게 넉백 (IZK 1기 멤버에겐 1.5배). 같은 팀은 밀려나며 체력 회복',
        cd: function (c) { return c.poco.cd; },
        start: function (bt, b) { return nogwangPoco(bt, b); },
      },
    ],
    gauge: function (b, k, sk, bt) {
      if (k === 0) {
        var n = bt.ents.filter(function (e) { return e instanceof Hot6 && e.owner === b && !e.dead; }).length;
        return { label: '핫식스 ' + n + '/' + b.cfg.hot6.max + (b.hot6 ? ' · 충전 ' + b.hot6.up : '') };
      }
      return null;
    },
  },

  sy: {
    id: 'sy', name: '김선율', sub: '김선율의 모습',
    flavor: "\"왜나면 난.. 낯가림이 심하니까......\"",
    images: {
      base: { src: 'assets/sy.jpg', fx: 0.53, fy: 0.48, s: 0.42 },
      p2:   { src: 'assets/sy_p2.jpg', fx: 0.5, fy: 0.5, s: 0.62 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 약간 빠름 · 체력 적음',
    intro: '낯을 가려서 자꾸 맵 밖으로 숨는 김선율. 체력이 0이 되면 방구석으로 가서 키보드를 꺼내 들고, 구석에 박힌 채 아재개그와 개드립을 마구 쏟아낸다. 드립에 이름이 나온 사람은 더 아프다.',
    passives: [{ name: '방구석', desc: '페이즈 2는 체력 절반이 아니라 체력이 0이 될 때 시작 (한 번만 부활)' }, { name: '소심함', desc: '페이즈 1에서 주는 모든 피해는 1' }, { name: '여자 앞에서 작아짐', desc: '여성 캐릭터에게 주는 피해 절반 (이윤빈은 예외)' }],
    // 페이즈 1: 모든 피해 1 / 여성에게는 피해 절반 (이윤빈 제외)
    dealMult: function (bt, s, t, amt) { return (s.phase < 2 && amt > 0 ? 1 / amt : 1) * (_isFemale(t) && t.def.name !== '이윤빈' ? s.cfg.femaleDeal : 1); },
    noAutoPhase2: true,
    onLethal: function (bt, b) {
      if (b.data.yeopo) return false;
      b.data.yeopo = true; b.data.pendingYeopo = true;
      b.invuln = true; b.phasing = true; b.hidden = false;
      var st = b.status;
      st.burn = st.bleed = st.bleedStacks = st.stun = st.freeze = st.blind = st.slow = 0;
      return true;
    },
    update: function (bt, b) {
      if (!b.data.pendingYeopo) return;
      b.data.pendingYeopo = false;
      if (b.action && b.action.end) b.action.end();
      b.action = syYeopo(bt, b);
    },
    skills: [
      {
        key: 'shy', name: '낯가림', desc: '맵 밖으로 잠깐 사라졌다가 가장 가까운 적 바로 앞에서 등장하며 단일 공격 (데미지 1)',
        cd: function (c) { return c.shy.cd; },
        start: function (bt, b) { return syShy(bt, b); },
      },
      {
        key: 'yeopo', name: '방구석 여포', passive: true,
        desc: '체력이 0이 되면 구석으로 가서 키보드를 꺼내고 체력 아주 조금으로 부활. 구석에 고정된 채 드립을 무작위 방향으로 난사해 폭발 피해 (드립에 이름이 나온 상대는 1.5배)',
        cd: function () { return 1e9; }, start: function () {},
      },
    ],
    drawExtra: function (ctx, b, bt, x, y, r) {
      if (!b.data.keyboard) return;
      var kx = x - r * 0.9, ky = y + r * 0.55, kw = r * 1.8, kh = r * 0.5;
      ctx.save(); ctx.fillStyle = '#1a1a24'; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3;
      Battle.roundRect(ctx, kx, ky, kw, kh, 8); ctx.fill(); ctx.stroke();
      for (var i = 0; i < 3; i++) for (var j = 0; j < 8; j++) {
        ctx.fillStyle = Math.random() < 0.15 ? '#00e5ff' : '#555566';
        ctx.fillRect(kx + 6 + j * (kw - 12) / 8, ky + 5 + i * (kh - 10) / 3, (kw - 12) / 8 - 3, (kh - 10) / 3 - 3);
      }
      ctx.restore();
      if (Math.random() < 0.05) FX.text(x + _rnd(-r, r), y - r - 20, '타닥', '#00e5ff', 28, 0.4);
    },
  },

  chief: {
    id: 'chief', name: '문남휘', sub: '이장님의 모습',
    flavor: "\"아니 신발장에 자리가 없는데요;\"",
    images: {
      base: { src: 'assets/chief.jpg', fx: 0.56, fy: 0.28, s: 0.32 },
      ko:   { src: 'assets/chief_ko.jpg', fx: 0.54, fy: 0.4, s: 0.6 },
    },
    portrait: function (b) { return b.data.ddak ? 'ko' : 'base'; },
    blurb: '이동 보통 · 팀전 버프형',
    intro: '마을을 돌보는 이장님 문남휘. 팀전에서는 웰우스를 열어 같은 팀을 계속 회복시키고, 페이즈 2에서는 대청소로 적들에게 지속 피해를 준다. 혼자 싸우는 건 서툴고, 개인전에선 한규성의 공격 한 방에 쓰러진다.',
    passives: [
      { name: '이장님은 팀이 필요해', desc: function () { return '개인전·토너먼트에서 받는 피해 ' + Math.round(CONFIG.chars.chief.ffaTaken * 100) + '%'; } },
      { name: '부랄딱밤', desc: '개인전·토너먼트에서 한규성의 공격에 맞으면 부랄딱밤! 즉사 (팀전은 안전)' },
    ],
    init: function (bt, b) {
      b.data.tick = 0; if (bt.mode !== 'team') b.takenMult = b.cfg.ffaTaken; bt.add(new WellusField(bt, b));
      if (_dmdyd(bt, b)) b.synTaken *= CONFIG.synergy.dmdyd.chiefTaken;   // 디마디영디: 효과가 세진 대신 받는 피해 증가
    },
    absorb: function (bt, t, amt, src) {
      if (bt.mode === 'team' || !src || src.def.name !== '한규성') return false;   // 팀전에선 즉사 없음
      chiefDdakbam(bt, t, src);
      return true;
    },
    update: function (bt, b, dt) {
      var d = b.data;
      d.tick += dt;
      if (d.tick < 0.4999) return;
      d.tick -= 0.5;
      [b].concat(bt.allies(b)).forEach(function (a) {   // 웰우스 개방: 같은 팀 지속 회복
        if (bt.heal(a, b.cfg.wellus.hps * 0.5 * (_dmdyd(bt, b) ? CONFIG.synergy.dmdyd.chiefMul : 1) * (bt.map && bt.map.sub === 'hall' ? CONFIG.maps.hall.wellusHeal : 1), true) > 0 && Math.random() < 0.35)
          FX.particle({ x: a.x + _rnd(-a.r, a.r) * 0.6, y: a.y, vx: 0, vy: -90, life: 0.7, size: 12, color: '#7dff9a', shape: 'square' });
      });
      if (b.phase < 2) return;
      bt.enemies(b).forEach(function (e) {   // 웰우스 대청소: 적 전체 지속 피해
        if (!e.targetable) return;
        bt.damage(e, b.cfg.clean.dps * 0.5 * (_dmdyd(bt, b) ? CONFIG.synergy.dmdyd.chiefMul : 1), b, { dot: true, color: '#d8c38a', kind: 'clean' });
        if (Math.random() < 0.25) FX.particle({ x: e.x + _rnd(-e.r, e.r) * 0.6, y: e.y, vx: _rnd(-20, 20), vy: -60, life: 0.7, size: 14, color: '#c8a46a', shape: 'smoke' });
      });
    },
    onPhase2: function (bt, b) {
      FX.banner('웰우스 대청소', { color: '#d8c38a', size: 110, life: 1.3 });
      bt.enemies(b).forEach(function (e) { FX.burst(e.x, e.y, '#c8a46a', 14, 300, 16, 0.8, 'smoke'); });
    },
    skills: [
      {
        key: 'wellus', name: '웰우스 개방', passive: true,
        desc: '시작부터 같은 팀 전원(본인 포함)에게 지속 체력 회복',
        cd: function () { return 1e9; }, start: function () {},
      },
      {
        key: 'clean', name: '웰우스 대청소', passive: true,
        desc: '적 전원에게 지속 피해',
        cd: function () { return 1e9; }, start: function () {},
      },
    ],
    drawExtra: function (ctx, b, bt, x, y, r, time) {
      ctx.save(); ctx.strokeStyle = 'rgba(125,255,154,0.35)'; ctx.lineWidth = 4; ctx.setLineDash([10, 12]); ctx.lineDashOffset = -time * 30;
      ctx.beginPath(); ctx.arc(x, y, r + 26, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    },
  },

  predator: {
    id: 'predator', name: '한규성', sub: '포식자의 모습',
    flavor: "\"(어디선가 비타민을 꺼내며) 라면 먹고 가시죠.\"",
    preciseContact: true,   // 박치기 숫자를 8.8로 표시
    images: {
      base: { src: 'assets/predator.jpg', fx: 0.5, fy: 0.5, s: 0.95 },
      p2:   { src: 'assets/predator_p2.jpg', fx: 0.52, fy: 0.26, s: 0.4 },
    },
    portrait: function (b) { return b.phase >= 2 ? 'p2' : 'base'; },
    blurb: '이동 약간 빠름',
    intro: '작업실 비타민의 주인, 포식자 한규성. 부딪히는 곳마다 비타민 껍질을 심어 하얀 탄막으로 터뜨린다. 페이즈 2에서는 포식이 준비될 때마다 덮쳐 물어뜯고 피를 빨아 회복한다. 여성에게는 더 빨리 다가가지만 물지는 않는다.',
    passives: [
      { name: '빠른 각성', desc: '체력 70%에서 페이즈 2' },
      { name: '기본 공격 8.8', desc: function () { return '몸통 박치기는 항상 ' + CONFIG.chars.predator.baseHit + ' (공격력 증가·감소 영향 없음)'; } },
      { name: '직진', desc: function () { return '여성 캐릭터에게 다가갈 때 이동속도 +' + Math.round((CONFIG.chars.predator.femaleChase - 1) * 100) + '% (분홍 속도선·하트)'; } },
    ],
    init: function (bt, b) { b.data.armed = false; b.data.wallCd = 0; b.data.chasing = false; },
    // 여성 캐릭터 쪽으로 다가가는 중이면 이동속도 증가
    speedMul: function (bt, b) {
      var sp = Math.hypot(b.vx, b.vy), best = 0;
      b.data.chasing = false;
      if (sp < 1) return 1;
      bt.enemies(b).forEach(function (o) {
        if (!o.targetable || !_isFemale(o)) return;
        var dx = o.x - b.x, dy = o.y - b.y, dot = (b.vx * dx + b.vy * dy) / (sp * (Math.hypot(dx, dy) || 1));
        best = Math.max(best, dot);
      });
      b.data.chasing = best > 0.6;
      return 1 + (b.cfg.femaleChase - 1) * Math.max(0, Math.min(1, (best - 0.3) / 0.5));
    },
    // 박치기는 8.8 고정 (받는 쪽 배율만 적용)
    dealMult: function (bt, s, t, amt, o) {
      return o && o.kind === 'contact' && amt > 0 ? s.cfg.baseHit * t.takenMult / amt : 1;
    },
    update: function (bt, b, dt) {
      var A = CONFIG.arena, d = b.data;
      // 여성에게 돌진 중: 뒤로 하트가 흩날림
      if (d.chasing && !b.hidden && Math.random() < dt * 14) {
        var sp = Math.hypot(b.vx, b.vy) || 1, bx = b.x - b.vx / sp * b.r, by = b.y - b.vy / sp * b.r;
        FX.text(bx + _rnd(-20, 20), by + _rnd(-20, 20), Math.random() < 0.7 ? '♥' : '💕', '#ff5fa2', _rnd(26, 40), 0.6);
      }
      if (d.wallCd > 0) { d.wallCd -= dt; return; }
      if (b.hidden || b.air) return;
      var m = 1.5;
      if (b.x - b.r <= A.x + m || b.x + b.r >= A.x + A.w - m || b.y - b.r <= A.y + m || b.y + b.r >= A.y + A.h - m) {
        d.wallCd = b.cfg.vitamin.wallCd;
        predPlant(bt, b, b.x, b.y, 1);
      }
    },
    onContact: function (bt, s, t) {
      if (s.hidden || !bt.canEffect(s, t)) return;
      if (s.phase >= 2 && s.data.armed) predFeast(bt, s, t);
      if (!t.alive) return;
      var fem = _isFemale(t);
      predPlant(bt, s, (s.x + t.x) / 2, (s.y + t.y) / 2, fem ? 3 : 1, t);   // 부딪힌 상대에게 붙임
      if (fem) FX.text(t.x, t.y - t.r - 60, '비타민 x3', '#ffb347', 40, 0.8);
    },
    skills: [
      {
        key: 'vitamin', name: '작업실 비타민의 주인', passive: true,
        desc: '벽에 부딪히면 그 자리에, 상대와 부딪히면 상대 몸에 비타민 껍질을 붙임. 잠시 뒤 하얀 액체로 터지며 방울 탄막 (여성과 부딪히면 3개)',
        cd: function () { return 1e9; }, start: function () {},
      },
      {
        key: 'feast', name: '포식', desc: '쿨타임이 차면 다음에 부딪힌 상대를 덮쳐 물고 뒤로 뛰어넘음. 큰 피해 + 그 절반만큼 흡혈. 여성 상대는 하트와 함께 피해 없이 회복만',
        cd: function (c) { return c.feast.cd; },
        holds: function (b) { return b.data.armed; },
        start: function (bt, b) {
          b.data.armed = true;
          FX.sfx('arm');
          bt.emit('feastArmed');
          return null;
        },
      },
    ],
    drawExtra: function (ctx, b, bt, x, y, r, time) {
      if (b.data.chasing && !b.action) {   // 여성에게 돌진: 분홍 속도선 + 분홍 오라 + 머리 위 하트
        var a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,95,162,0.75)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.shadowColor = '#ff5fa2'; ctx.shadowBlur = 14;
        for (var i = -2; i <= 2; i++) {
          var ox = x - Math.cos(a) * (r + 8) - Math.sin(a) * i * r * 0.38, oy = y - Math.sin(a) * (r + 8) + Math.cos(a) * i * r * 0.38, L = 70 - Math.abs(i) * 15;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - Math.cos(a) * L, oy - Math.sin(a) * L); ctx.stroke();
        }
        ctx.globalAlpha = 0.35 + Math.sin(time * 12) * 0.15; ctx.lineWidth = 8; ctx.strokeStyle = '#ff5fa2';
        ctx.beginPath(); ctx.arc(x, y, r + 16, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        var hs = 1 + Math.sin(time * 14) * 0.15;
        ctx.font = Math.round(46 * hs) + 'px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('😍', x, y - r - 34);
        ctx.restore();
      }
      if (!b.data.armed || b.phase < 2) return;
      // 포식 준비: 이빨 링
      ctx.save(); ctx.translate(x, y); ctx.rotate(time * 1.5);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = 3; ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 20;
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2, r0 = r + 14, r1 = r + 34 + Math.sin(time * 10 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.12) * r0, Math.sin(a - 0.12) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a + 0.12) * r0, Math.sin(a + 0.12) * r0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    },
    gauge: function (b, k, sk, bt) {
      if (k === 0) {
        var n = bt.ents.filter(function (e) { return e instanceof VitaminShell && e.owner === b && !e.dead; }).length;
        return { label: '비타민 껍질 ' + n + '/' + b.cfg.vitamin.max };
      }
      if (b.data.armed) return { fill: 1, label: '포식 준비! 부딪혀라', color: '#ff2a2a' };
      return null;
    },
  },

  ripley: {
    id: 'ripley', name: '???', sub: '리플리의 모습',
    flavor: "\"...\"",
    images: { base: { draw: drawSilhouette } },
    portrait: function () { return 'base'; },
    blurb: '이동 보통 · 정체불명',
    intro: '정체를 알 수 없는 검은 실루엣. 몇 초마다 다른 캐릭터로 변신해 그 캐릭터의 스킬을 그대로 쓴다. 페이즈 2부터는 변신한 캐릭터의 2페이즈 모습이 되어 2스킬까지 쓰고, 화면이 지직거린다.',
    passives: [{ name: '모방', desc: '변신하면 그 캐릭터의 스킬·패시브를 그대로 사용 (체력·속도·크기는 리플리 그대로)' }],
    init: function (bt, b) { b.rip = { t: CONFIG.chars.ripley.firstChange, glitch: 0, as: null }; },
    update: function (bt, b, dt) {
      if (_dmdyd(bt, b)) { ripleyCall(bt, b, dt); return; }   // 디마디영디: 변신 안 하고 전화 받으러 감
      ripleyTick(bt, b, dt);
    },
    onPhase2: function (bt, b) { ripleyPhase2(bt, b); },
    drawExtra: function (ctx, b, bt, x, y, r, time) {
      ripleyGlitch(ctx, b, x, y, r);
      if (b.rip.call != null && b.rip.call < 2.5 && Math.sin(time * 18) > 0) { ctx.font = '56px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('📞', x + r * 0.8, y - r - 20); }
    },
    hudTag: ripleyTag,
    skills: [
      {
        key: 'ripley', name: '리플리 증후군', passive: true,
        desc: '몇 초마다 전체 캐릭터 중 하나의 모습으로 변신하고 그 캐릭터의 1스킬을 사용',
        cd: function () { return 1e9; }, start: function () {},
      },
      {
        key: 'ripley2', name: '중증 리플리', passive: true,
        desc: '변한 캐릭터의 2페이즈 모습으로 변신해 2스킬까지 사용. 변신할 때 글리치',
        cd: function () { return 1e9; }, start: function () {},
      },
    ],
  },
};

// ---------- 시너지 (팀전 전용, 수치는 CONFIG.synergy) ----------
// solo: 그 사람이 팀에 혼자일 때 / members: 전원이 한 팀일 때 (팀원 전체에 적용). 조건은 이름 기준 → 이격도 포함
function _pct(m) { return (m >= 1 ? '+' : '') + Math.round((m - 1) * 100) + '%'; }
var SYNERGIES = [
  { key: 'uninvited', color: '#ff8c1a', name: '초대받지 못한 손님', solo: ['유재후', '???'], fillIds: ['baton'],
    desc: function () { var u = CONFIG.synergy.uninvited; return '유재후 또는 ???가 팀에 혼자일 때: 체력·이동속도·공격력 x' + u.hp + '. 끼야아아악은 배율 없이 확정 2연타'; } },
  { key: 'izk', color: '#00e5ff', name: 'IZK 1기', members: function () { return CONFIG.synergy.izk.members; }, suppressedBy: 'jeongbalsan',
    fillIds: ['ibi'],   // 시너지별 채우기 때 고를 모습
    desc: function () { var z = CONFIG.synergy.izk; return '주는 피해 ' + _pct(z.damage) + ', 받는 피해 ' + _pct(z.taken) + '. 조하람의 긴급소집 때 추가 효과: 조우연 뱀 3마리 즉시 소환 / 김선율 복합 염색 / 한규성 규순이 3종 연속'; } },
  { key: 'ssabang', color: '#b36bff', name: '싸방', members: function () { return CONFIG.synergy.ssabang.members; },
    desc: function () { var c = CONFIG.synergy.ssabang; return '체력 ' + _pct(c.hp) + ', 주는 피해 ' + _pct(c.damage) + ', 스킬 쿨타임 ' + Math.round((1 - 1 / c.cdr) * 100) + '% 감소'; } },
  { key: 'hwajeong', color: '#ff4fa3', name: '화정듀오', members: function () { return CONFIG.synergy.hwajeong.members; }, needIds: function () { return CONFIG.synergy.hwajeong.needIds; },
    onlyMembers: true,   // 팀 전체가 아니라 두 사람만 효과를 받음
    note: '한규성은 포식자의 모습일 때만',
    desc: function () { var c = CONFIG.synergy.hwajeong; return '유재후·포식자 한규성 둘만: 주는 피해 ' + _pct(c.damage) + ', 최대 체력 ' + _pct(c.hp); } },
  { key: 'jeongbalsan', color: '#e8e8ff', name: '정발산', members: function () { return CONFIG.synergy.jeongbalsan.members; },
    desc: function () { var c = CONFIG.synergy.jeongbalsan; return '이동속도 ' + _pct(c.speed) + ', 주는 피해 ' + _pct(c.decayDamage) + ' (' + c.decayTime + '초에 걸쳐 0까지 감소). 노광석 유재후의 포코 범위 x' + c.nogwangRange + '·팀원 회복 x' + c.nogwangHeal + '. IZK 1기는 긴급소집 효과만 남음'; } },
  { key: 'seoulbc', color: '#d4a24c', name: '서울방송고', members: function () { return CONFIG.synergy.seoulbc.members; },
    desc: function () { var c = CONFIG.synergy.seoulbc; return '받는 회복 ' + _pct(c.heal) + ', 스킬 쿨타임 ' + Math.round((1 - 1 / c.cdr) * 100) + '% 단축. 최휘 주는 피해 ' + _pct(c.per['최휘'].damage); } },
  { key: 'dmdyd', color: '#9cff57', name: '디마디영디', members: function () { return CONFIG.synergy.dmdyd.members; }, needIds: function () { return CONFIG.synergy.dmdyd.needIds; },
    note: '한규성은 이비의 모습일 때만',
    desc: function () { var c = CONFIG.synergy.dmdyd; return '체력 ' + _pct(c.hp) + '. 멤버별: 이장님 웰우스 효과 x' + c.chiefMul + ' (대신 받는 피해 ' + _pct(c.chiefTaken) + ') / 개발자 아군과 닿으면 아군 스탯 +' + Math.round(c.devAlly * 100) + '% / 한규성 규순이를 페이즈 1부터 (쿨타임 x' + c.gyusuniCd + ') / 유재운 발냄새 범위 x' + c.stinkMul + ' / 진형권 헬스 메이트 + 아령·프로틴 생성 x' + c.gymSpawn + ' / 이윤빈 전담을 평생 못 찾음, 짜증 x' + c.chinoGrow + ' / ??? 변신 안 하고 ' + c.ripleyCall + '초 뒤 사업 전화 받으러 퇴장'; } },
  { key: 'dogowner', color: '#a1887f', name: '개와 주인', members: function () { return CONFIG.synergy.dogowner.members; },
    desc: function () { var p = CONFIG.synergy.dogowner.per; var c = CONFIG.synergy.dogowner; return '서리 이동속도 ' + _pct(p['서리'].speed) + ', 주는 피해 ' + _pct(p['서리'].damage) + ', 침흘리기 빈도 x' + c.droolRate + ' / 유재후 이동속도 ' + _pct(p['유재후'].speed); } },
];
function synergiesOf(id) {
  var n = CHARACTERS[id].name;
  return SYNERGIES.filter(function (sy) {
    if (sy.solo) return sy.solo.indexOf(n) >= 0;
    if (sy.members().indexOf(n) < 0) return false;
    // needIds: 같은 이름 중 그 모습만 해당 (화정듀오의 한규성은 포식자만)
    return !sy.needIds || sy.needIds().indexOf(id) >= 0 || !sy.needIds().some(function (q) { return CHARACTERS[q].name === n; });
  });
}

// 테스트/디버그용
var Ents = { WaterShot: WaterShot, Puddle: Puddle, Ripley: { transform: ripleyTransform }, Vape: Vape, Drool: Drool, Punch: Punch, Hot6: Hot6, GuitarWave: GuitarWave, Joke: Joke, WellusField: WellusField, VitaminShell: VitaminShell, VitaminBullet: VitaminBullet, VitaminSplat: VitaminSplat, Snake: Snake, Stone: Stone, Charger: Charger, Knife: Knife, Ultrasound: Ultrasound, Laser: Laser, StinkZone: StinkZone, Pickup: Pickup, Wave: Wave };
