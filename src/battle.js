// 물리, 충돌, 데미지, 상태이상, 페이즈, 팀/시너지, 승패 처리 (캐릭터 독립적인 공통 로직)
var Battle = (function () {
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var TEAMS = [
    { label: 'A', color: '#ff3b5c' },
    { label: 'B', color: '#2f9bff' },
    { label: 'C', color: '#ffd400' },
    { label: 'D', color: '#39ff88' },
  ];

  // 개인전에서 같은 캐릭터가 여럿일 때 구분용 색 (번호 순)
  var DUP_COLORS = ['#ff3b5c', '#2f9bff', '#ffd400', '#39ff88', '#ff8c42', '#c77dff', '#ffffff', '#00f0ff'];

  class Ball {
    constructor(def, idx, team) {
      var c = CONFIG.chars[def.id];
      this.def = def; this.cfg = c; this.id = idx; this.name = def.name; this.team = team;
      this.maxHp = c.hp; this.hp = c.hp; this.hpShown = c.hp;
      this.speed = c.speed; this.r = c.radius;
      this.dmgMult = 1;     // 주는 피해 배율 (시너지)
      this.takenMult = 1;   // 받는 피해 배율 (hxpwm 해피 등)
      this.synTaken = 1;    // 시너지로 받는 피해 배율
      this.synHeal = 1;     // 시너지로 받는 회복 배율 (서울방송고)
      this.synDecay = null; // 시간이 지날수록 줄어드는 시너지 피해 보너스 {amt, time} (정발산)
      this.slow = 1;        // 이동 속도 배율
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.phase = 1; this.alive = true; this.action = null;
      this.rot = 0; this.scale = 1; this.pulse = 0; this.lift = 0; this.flash = 0;
      this.air = false; this.phasing = false; this.hidden = false; this.invuln = false; this.jx = 0; this.jy = 0;
      this.status = { burn: 0, burnDps: 0, stun: 0, freeze: 0, bleed: 0, bleedStacks: 0, bleedDps: 0, blind: 0, slow: 0, slowMul: 1, haste: 0, hasteMul: 1 };
      this.burnTick = 0; this.bleedTick = 0;
      this.stats = { dealt: 0, taken: 0, healed: 0 };   // 결과 화면 그래프용
      this.data = {};
      // 1스킬은 시작 직후 너무 바로 터지지 않게 약간 랜덤 오프셋
      this.skills = def.skills.map(function (s, i) {
        var max = s.cd(c);
        return { def: s, max: max, cd: i === 0 ? max * rnd(0.5, 0.9) : max };
      });
    }
    get disabled() { return this.status.stun > 0 || this.status.freeze > 0; }
    get targetable() { return this.alive && !this.hidden; }
    color() { return this.def.color ? this.def.color(this) : this.cfg.color; }
  }

  class Battle {
    // roster: ['baton','ibi'] (개인전) 또는 [{id:'baton', team:0}, ...] + mode 'team'
    constructor(roster, mode) {
      var self = this;
      this.mode = mode === 'team' ? 'team' : 'ffa';
      var entries = roster.map(function (r, i) {
        var e = typeof r === 'string' ? { id: r } : r;
        return { id: e.id, team: self.mode === 'team' ? (e.team || 0) : i };
      });
      var counts = {}, seen = {};
      entries.forEach(function (e) { counts[e.id] = (counts[e.id] || 0) + 1; });
      this.balls = entries.map(function (e, i) {
        var b = new Ball(CHARACTERS[e.id], i, e.team);
        if (counts[e.id] > 1) { seen[e.id] = (seen[e.id] || 0) + 1; b.name = b.def.name + seen[e.id]; b.dupNo = seen[e.id]; }
        return b;
      });
      this.ents = []; this.timers = []; this.log = [];
      this.time = 0; this.over = false; this.winner = null; this.winnerTeam = null; this.timeUp = false;
      this.hitstop = 0; this.freeze = 0; this.dark = 0; this.darkHold = new Set();
      this.pairCD = {}; this.effCD = {};
      this.darkCanvas = null;
      this.synergies = [];
      if (this.mode === 'team') this.applySynergies();
      this.place();
      this.balls.forEach(function (b) {
        var va = rnd(0, Math.PI * 2);
        b.vx = Math.cos(va) * b.speed; b.vy = Math.sin(va) * b.speed;
        if (b.def.init) b.def.init(self, b);
      });
    }

    // 팀원끼리 붙도록 팀 순서대로 원 위에 배치, 많으면 랜덤 배치
    place() {
      var A = CONFIG.arena, bs = this.balls.slice().sort(function (p, q) { return p.team - q.team; });
      var n = bs.length, cx = A.x + A.w / 2, cy = A.y + A.h / 2, off = rnd(0, Math.PI * 2);
      if (n <= 12) {
        var rx = A.w / 2 - 110, ry = A.h / 2 - 110;
        bs.forEach(function (b, i) { var a = off + i / n * Math.PI * 2; b.x = cx + Math.cos(a) * rx; b.y = cy + Math.sin(a) * ry; });
      } else {
        bs.forEach(function (b) { b.x = rnd(A.x + b.r, A.x + A.w - b.r); b.y = rnd(A.y + b.r, A.y + A.h - b.r); });
      }
    }

    // 시너지 목록은 characters.js의 SYNERGIES, 수치는 CONFIG.synergy
    applySynergies() {
      var self = this;
      this.teamIds().forEach(function (team) {
        var mem = self.balls.filter(function (b) { return b.team === team; });
        var names = mem.map(function (b) { return b.def.name; });   // 시너지는 이름(사람) 기준: 이격도 같은 사람
        var ids = mem.map(function (b) { return b.def.id; });          // needIds: 특정 모습이 꼭 있어야 하는 시너지 (화정듀오)
        var on = SYNERGIES.filter(function (sy) {
          if (sy.solo) return mem.length === 1 && sy.solo.indexOf(names[0]) >= 0;
          return sy.members().every(function (n) { return names.indexOf(n) >= 0; })
            && (!sy.needIds || sy.needIds().every(function (id) { return ids.indexOf(id) >= 0; }));
        });
        var keys = on.map(function (sy) { return sy.key; });
        on.forEach(function (sy) {
          var c = CONFIG.synergy[sy.key], off = sy.suppressedBy && keys.indexOf(sy.suppressedBy) >= 0;   // 정발산이면 IZK 수치 효과 꺼짐
          if (!off) mem.forEach(function (b) {
            [c, c.per && c.per[b.def.name]].forEach(function (m) {   // 팀 전체 효과 → 이 사람만 받는 효과
              if (!m) return;
              if (m.hp) { b.maxHp *= m.hp; b.hp = b.hpShown = b.maxHp; }
              if (m.speed) b.speed *= m.speed;
              if (m.damage) b.dmgMult *= m.damage;
              if (m.taken) b.synTaken *= m.taken;
              if (m.heal) b.synHeal *= m.heal;
            });
            if (c.decayDamage) b.synDecay = { amt: c.decayDamage - 1, time: c.decayTime };
          });
          self.synergies.push({ key: sy.key, team: team, name: sy.name + (off ? ' (소집 효과만)' : ''), off: !!off });
        });
      });
    }
    // 초대받지 못한 손님 대상: 팀전에선 시너지가 붙은 바통, 개인전에선 바통 (진형권 패시브용)
    isUninvited(t) {
      var solo = SYNERGIES.filter(function (q) { return q.key === 'uninvited'; })[0].solo;
      return solo.indexOf(t.def.name) >= 0 && (this.mode === 'ffa' || this.hasSynergy('uninvited', t.team));
    }
    hasSynergy(key, team) { return this.synergies.some(function (s) { return s.key === key && s.team === team; }); }
    teamIds() {
      var t = [];
      this.balls.forEach(function (b) { if (t.indexOf(b.team) < 0) t.push(b.team); });
      return t.sort(function (a, b) { return a - b; });
    }

    // ---------- 유틸 ----------
    emit(type, data) { var e = data || {}; e.type = type; e.t = this.time; this.log.push(e); return e; }
    after(delay, fn) { this.timers.push({ t: delay, fn: fn }); }
    add(ent) { this.ents.push(ent); return ent; }
    enemies(b) { return this.balls.filter(function (o) { return o.team !== b.team && o.alive; }); }
    allies(b) { return this.balls.filter(function (o) { return o !== b && o.team === b.team && o.alive; }); }
    nearest(b) {
      var best = null, bd = Infinity;
      this.enemies(b).forEach(function (o) {
        if (!o.targetable) return;
        var d = Math.hypot(o.x - b.x, o.y - b.y);
        if (d < bd) { bd = d; best = o; }
      });
      return best;
    }
    randomPoint(margin) {
      var A = CONFIG.arena, m = margin || 80;
      return { x: rnd(A.x + m, A.x + A.w - m), y: rnd(A.y + m, A.y + A.h - m) };
    }
    clampPoint(p, m) {
      var A = CONFIG.arena; m = m || 0;
      return { x: clamp(p.x, A.x + m, A.x + A.w - m), y: clamp(p.y, A.y + m, A.y + A.h - m) };
    }
    blindRoll(b) {
      if (b.status.blind > 0 && Math.random() < CONFIG.status.blindMissChance) {
        FX.text(b.x, b.y - b.r - 70, '어디야?!', '#ffffff', 52, 0.9);
        this.emit('blindMiss', { who: b.def.id });
        return true;
      }
      return false;
    }
    // 조준형 스킬: 실명이면 일정 확률로 맵 안 랜덤 위치
    aim(b, x, y) {
      if (this.blindRoll(b)) { var p = this.randomPoint(); p.miss = true; return p; }
      return { x: x, y: y, miss: false };
    }
    // 범위형 스킬: 실명이면 일정 확률로 중심이 크게 어긋남
    aimArea(b, x, y) {
      if (this.blindRoll(b)) {
        var a = rnd(0, Math.PI * 2), d = CONFIG.status.blindAreaOffset;
        var p = this.clampPoint({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }, 60);
        p.miss = true; return p;
      }
      return { x: x, y: y, miss: false };
    }
    canEffect(s, t) {
      var k = s.id + '>' + t.id;
      if (this.effCD[k] > this.time) return false;
      this.effCD[k] = this.time + CONFIG.battle.effectCooldown;
      return true;
    }
    darkOn(b) { this.darkHold.add(b); }
    darkOff(b) { this.darkHold.delete(b); }
    skillText(b, text, color) { FX.text(b.x, b.y - b.r - 40, text, color || b.color(), 66, 1.1); }

    // ---------- 데미지 / 상태 ----------
    damage(t, amt, src, o) {
      o = o || {};
      if (!t.alive || t.hidden || t.invuln || amt <= 0) return 0;
      if (src && src !== t && src.team === t.team) return 0;   // 팀킬 없음
      if (!o.dot && t.def.absorb && t.def.absorb(this, t, amt, src, o)) return 0;   // 피해 무효화 (이윤빈 기억력 감퇴)
      amt *= (src && !o.noMult ? src.dmgMult : 1) * t.takenMult * t.synTaken;   // noMult: 시너지 피해 배율 미적용
      if (src && !o.noMult && src.synDecay) amt *= 1 + src.synDecay.amt * Math.max(0, 1 - this.time / src.synDecay.time);   // 정발산: 점점 줄어듦
      if (src && src.def.dealMult) amt *= src.def.dealMult(this, src, t, amt, o);   // amt: 지금까지 계산된 피해, o.kind로 박치기 구분
      amt *= this.guardMult(t);   // 보호막 (삼식이 하양)
      if (t.def.onHurt) t.def.onHurt(this, t, amt, src, o);   // 받은 피해 기록 (차승민 강펀치)
      var real = Math.min(amt, t.hp);   // 오버킬 제외한 실제 피해
      t.stats.taken += real;
      if (src && src !== t) src.stats.dealt += real;
      t.hp -= amt; t.flash = 0.12;
      FX.num(t.x, t.y - t.r * 0.6 - t.lift * 140, amt, { dot: o.dot, color: o.color || (o.dot ? '#ffb3b3' : '#ffffff'), precise: o.kind === 'contact' && src && src.def.preciseContact });
      if (!o.dot) {
        var big = amt >= CONFIG.battle.bigHitDamage;
        this.hitstop = Math.max(this.hitstop, big ? CONFIG.battle.bigHitstop : CONFIG.battle.hitstop);
        FX.sfx(big ? 'bigHit' : 'hit');
        if (CONFIG.fx.hitSparks) FX.burst(t.x, t.y, o.color || '#ffffff', big ? 18 : 8, big ? 900 : 600, 6, 0.35, 'spark');
      }
      this.emit('damage', { who: t.def.id, src: src ? src.def.id : null, amt: amt, kind: o.kind || '' });
      if (t.hp <= 0) {
        t.hp = 0;
        if (!(t.def.onLethal && t.def.onLethal(this, t))) this.kill(t);   // onLethal이 true면 안 죽음 (김선율 방구석 여포)
        return amt;
      }
      if (t.phase === 1 && !t.def.noAutoPhase2 && t.hp <= t.maxHp * CONFIG.battle.phase2Ratio) this.enterPhase2(t);
      return amt;
    }
    // 받는 피해 보호 배율: guard 훅을 가진 캐릭터가 t를 지켜주면 그중 가장 강한 것 하나만 (중첩 없음)
    guardMult(t) {
      var m = 1, self = this;
      this.balls.forEach(function (g) { if (g.alive && g.def.guard) m = Math.min(m, g.def.guard(self, g, t)); });
      return m;
    }
    heal(t, amt, quiet) {
      if (!t.alive) return 0;
      amt = Math.min(amt * t.synHeal, t.maxHp - t.hp);
      if (amt <= 0) return 0;
      t.hp += amt; t.stats.healed += amt;
      if (quiet) return amt;   // 지속 회복은 숫자 안 띄움
      FX.text(t.x, t.y - t.r - 30, '+' + Math.round(amt), '#7dff9a', 46, 0.9);
      FX.sfx('heal');
      this.emit('heal', { who: t.def.id, amt: amt });
      return amt;
    }
    applyBleed(t, c, src) {
      var s = t.status;
      if (src) s.bleedSrc = src;   // 도트 피해 기록용
      s.bleedStacks = Math.min(c.maxStacks, s.bleedStacks + 1);
      s.bleed = c.bleedTime;          // 중첩될 때마다 지속시간 초기화
      s.bleedDps = c.bleedDps;
      this.emit('bleed', { who: t.def.id, stacks: s.bleedStacks, time: s.bleed });
    }
    enterPhase2(b) {
      var B = CONFIG.battle, col = b.color();
      b.phase = 2; b.pulse = B.phaseFreeze + 0.4;
      this.freeze = Math.max(this.freeze, B.phaseFreeze);
      if (b.skills[1]) b.skills[1].cd = B.phase2FirstDelay;
      FX.banner('PHASE 2', { color: b.cfg.phase2Color, sub: b.name + ' 각성', size: 150, life: 1.6 });
      for (var i = 0; i < 3; i++) FX.ring(b.x, b.y, b.r, b.r * (2.5 + i), 0.7 + i * 0.2, i % 2 ? '#ffffff' : col, 14);
      FX.burst(b.x, b.y, col, 40, 900, 10, 0.8);
      FX.flash('#ffffff', 0.35, 0.3); FX.shake(22); FX.sfx('phase');
      this.emit('phase2', { who: b.def.id });
      if (b.def.onPhase2) b.def.onPhase2(this, b);
    }
    kill(b) {
      b.alive = false;
      if (b.action) { if (b.action.end) b.action.end(); b.action = null; }
      b.hidden = false; this.darkOff(b);
      FX.burst(b.x, b.y, b.color(), 70, 1300, 12, 1.0);
      FX.burst(b.x, b.y, '#ffffff', 30, 700, 8, 0.8, 'spark');
      FX.ring(b.x, b.y, b.r, b.r * 4, 0.8, b.color(), 20);
      FX.banner('K.O.', { color: '#ff2a55', sub: b.name + ' 탈락', size: 170, life: 1.6 });
      FX.flash('#ffffff', 0.5, 0.35); FX.shake(40); FX.sfx('ko');
      this.hitstop = 0.25;
      this.emit('ko', { who: b.def.id });
    }

    // ---------- 업데이트 ----------
    update(dt) {
      if (this.hitstop > 0) { this.hitstop -= dt; return; }
      if (this.freeze > 0) {
        this.freeze -= dt;
        this.balls.forEach(function (b) { if (b.pulse > 0) b.pulse -= dt; });
        return;
      }
      if (this.over) return;
      this.time += dt;
      var self = this, i;

      for (i = this.timers.length - 1; i >= 0; i--) {
        var tm = this.timers[i]; tm.t -= dt;
        if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
      }
      this.balls.forEach(function (b) { if (b.alive) self.updateBall(b, dt); });
      this.collide();
      for (i = this.ents.length - 1; i >= 0; i--) {
        var e = this.ents[i];
        if (!e.dead) e.update(dt);
        if (e.dead) this.ents.splice(i, 1);
      }
      var target = this.darkHold.size ? CONFIG.chars.ibi.awaken.darkness : 0;
      this.dark += target > this.dark ? Math.min(target - this.dark, dt * 4)
        : -Math.min(this.dark - target, dt / CONFIG.chars.ibi.awaken.fadeOut);
      this.checkEnd();
    }

    updateBall(b, dt) {
      var st = b.status;
      // 도트 데미지
      if (st.burn > 0) {
        st.burn -= dt; b.burnTick += dt;
        if (b.burnTick >= 0.4999) { b.burnTick -= 0.5; this.damage(b, st.burnDps * 0.5, st.burnSrc || null, { dot: true, noMult: true, color: '#ff9a3c', kind: 'burn' }); }
        if (Math.random() < dt * 30) FX.particle({ x: b.x + rnd(-b.r, b.r) * 0.7, y: b.y + rnd(-b.r, b.r) * 0.5, vx: rnd(-30, 30), vy: rnd(-260, -140), life: 0.5, size: rnd(8, 16), color: Math.random() < 0.5 ? '#ff6a00' : '#ffd000' });
        if (st.burn <= 0) b.burnTick = 0;
      }
      if (!b.alive) return;
      if (st.bleed > 0) {
        st.bleed -= dt; b.bleedTick += dt;
        if (b.bleedTick >= 0.4999) { b.bleedTick -= 0.5; this.damage(b, st.bleedDps * st.bleedStacks * 0.5, st.bleedSrc || null, { dot: true, noMult: true, color: '#ff3355', kind: 'bleed' }); }
        if (Math.random() < dt * 8 * st.bleedStacks) FX.particle({ x: b.x + rnd(-b.r, b.r) * 0.6, y: b.y + b.r * 0.3, vx: rnd(-20, 20), vy: rnd(40, 120), g: 500, life: 0.6, size: rnd(5, 9), color: '#d0002a', shape: 'square' });
        if (st.bleed <= 0) { st.bleedStacks = 0; b.bleedTick = 0; }
      }
      if (!b.alive) return;
      if (st.stun > 0) st.stun -= dt;
      if (st.freeze > 0) st.freeze -= dt;
      if (st.blind > 0) st.blind -= dt;
      if (st.slow > 0) st.slow -= dt;
      if (st.haste > 0) st.haste -= dt;
      if (b.flash > 0) b.flash -= dt;
      if (b.pulse > 0) b.pulse -= dt;
      b.hpShown += (b.hp - b.hpShown) * Math.min(1, dt * 4);

      if (b.def.update) b.def.update(this, b, dt);

      // 행동 불능이 되면 진행 중이던 스킬 취소
      if (b.disabled && b.action && !b.action.uninterruptible) { if (b.action.end) b.action.end(); b.action = null; }

      // 스킬 쿨타임 / 자동 발동
      for (var i = 0; i < b.skills.length; i++) {
        var sk = b.skills[i];
        if (i > 0 && b.phase < 2) continue;              // 2스킬은 페이즈 2부터
        if (sk.def.passive) {                              // 쿨타임과 무관한 패시브 타이머(염색, 충전기)
          sk.cd -= dt;
          if (sk.cd <= 0) { sk.cd += sk.max; this.emit('skill', { who: b.def.id, skill: sk.def.key }); sk.def.start(this, b); }
          continue;
        }
        if (sk.def.holds && sk.def.holds(b)) continue;    // 장전 상태 등에선 쿨타임 정지
        if (sk.cd > 0) sk.cd -= dt;
        if (sk.cd <= 0 && !b.action && !b.disabled && !b.hidden) {
          sk.cd = sk.max;
          this.emit('skill', { who: b.def.id, skill: sk.def.key });
          var act = sk.def.start(this, b);
          if (act) b.action = act;
        }
      }

      if (b.action) {
        // 행동 도중에 그 행동이 바뀌거나 사라질 수 있음 (탈락, 접촉 효과 등) → 지금 행동일 때만 정리
        var act = b.action;
        if (act.update(dt) && b.action === act) { if (act.end) act.end(); b.action = null; }
      }
      if (!b.hidden && (!b.action || b.action.moves)) this.move(b, dt);

      // 구르기 이외에는 얼굴이 정방향으로 돌아오도록
      if (!b.action || !b.action.spinning) {
        b.rot = Math.atan2(Math.sin(b.rot), Math.cos(b.rot));
        b.rot -= b.rot * Math.min(1, dt * 6);
      }
    }

    move(b, dt) {
      var st = b.status, sp = Math.hypot(b.vx, b.vy);
      var want = b.speed * b.slow * (st.slow > 0 ? st.slowMul : 1) * (st.haste > 0 ? st.hasteMul : 1) * (b.def.speedMul ? b.def.speedMul(this, b) : 1);
      if (b.disabled) {
        var k = Math.max(0, 1 - CONFIG.battle.disabledFriction * dt);
        b.vx *= k; b.vy *= k;
      } else if (sp < 5) {
        var a = rnd(0, Math.PI * 2);
        b.vx = Math.cos(a) * want; b.vy = Math.sin(a) * want;
      } else {
        // 넉백 후엔 원래 속도로 서서히 복귀, 평소엔 속도 크기 유지
        var ns = Math.abs(sp - want) < 2 ? want : sp + (want - sp) * Math.min(1, dt * 3);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      this.walls(b);
    }

    walls(b) {
      var A = CONFIG.arena, hit = false;
      if (b.x - b.r < A.x) { b.x = A.x + b.r; b.vx = Math.abs(b.vx); hit = true; }
      if (b.x + b.r > A.x + A.w) { b.x = A.x + A.w - b.r; b.vx = -Math.abs(b.vx); hit = true; }
      if (b.y - b.r < A.y) { b.y = A.y + b.r; b.vy = Math.abs(b.vy); hit = true; }
      if (b.y + b.r > A.y + A.h) { b.y = A.y + A.h - b.r; b.vy = -Math.abs(b.vy); hit = true; }
      if (hit) {
        // 완전히 수평/수직으로 갇히지 않게 살짝 비틀기
        var a = Math.atan2(b.vy, b.vx), s = Math.hypot(b.vx, b.vy);
        if (Math.abs(Math.sin(a * 2)) < 0.25) { a += rnd(-0.2, 0.2); b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; }
      }
      return hit;
    }

    collide() {
      var bs = this.balls;
      for (var i = 0; i < bs.length; i++) for (var j = i + 1; j < bs.length; j++) {
        var a = bs[i], b = bs[j];
        if (!a.alive || !b.alive || a.hidden || b.hidden || a.air || b.air || a.phasing || b.phasing) continue;
        var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min || d === 0) continue;
        var nx = dx / d, ny = dy / d, ov = (min - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        var vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vrel >= 0) continue; // 이미 멀어지는 중
        a.vx += vrel * nx; a.vy += vrel * ny; b.vx -= vrel * nx; b.vy -= vrel * ny;
        this.walls(a); this.walls(b);
        if (a.team !== b.team) this.contact(a, b, a.x + nx * a.r, a.y + ny * a.r);   // 같은 팀은 튕기기만
      }
    }

    contact(a, b, px, py) {
      var B = CONFIG.battle, now = this.time, self = this;
      FX.burst(px, py, '#ffffff', 10, 700, 6, 0.3, 'spark');
      FX.shake(6);
      [[a, b], [b, a]].forEach(function (p) {
        var s = p[0], t = p[1], k = s.id + '>' + t.id;
        if (!(self.pairCD[k] > now)) { self.pairCD[k] = now + B.contactCooldown; self.damage(t, s.cfg.contactDamage || B.contactDamage, s, { kind: 'contact' }); }
      });
      [[a, b], [b, a]].forEach(function (p) {
        if (p[0].alive && p[1].alive && p[0].def.onContact) p[0].def.onContact(self, p[0], p[1], px, py);
      });
    }

    teamScore(team) {
      var hp = 0, max = 0;
      this.balls.forEach(function (b) { if (b.team === team) { hp += b.alive ? b.hp : 0; max += b.maxHp; } });
      return max ? hp / max : 0;
    }
    checkEnd() {
      var self = this, alive = this.balls.filter(function (b) { return b.alive; });
      var teams = [];
      alive.forEach(function (b) { if (teams.indexOf(b.team) < 0) teams.push(b.team); });
      if (teams.length <= 1) {
        this.over = true; this.winnerTeam = teams.length ? teams[0] : null;
      } else if (this.time >= CONFIG.battle.maxTime) {
        this.over = true; this.timeUp = true;
        this.winnerTeam = teams.sort(function (x, y) { return self.teamScore(y) - self.teamScore(x); })[0];
        FX.banner('TIME UP', { color: '#00f0ff', size: 150 });
      }
      if (this.over) {
        var wt = this.winnerTeam;
        this.winner = alive.filter(function (b) { return b.team === wt; })
          .sort(function (x, y) { return y.hp / y.maxHp - x.hp / x.maxHp; })[0] || null;
        this.balls.forEach(function (b) { if (b.action && b.action.end) b.action.end(); b.action = null; });
        this.darkHold.clear();
        this.emit('end', { winner: this.winner ? this.winner.def.id : null, team: wt });
      }
    }

    // ---------- 그리기 ----------
    draw(ctx, time) {
      var A = CONFIG.arena, self = this;
      // 경기장
      ctx.save();
      ctx.fillStyle = '#0c0a1d';
      ctx.fillRect(A.x, A.y, A.w, A.h);
      ctx.strokeStyle = 'rgba(160,120,255,0.07)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (var gx = A.x + 50; gx < A.x + A.w; gx += 100) { ctx.moveTo(gx, A.y); ctx.lineTo(gx, A.y + A.h); }
      for (var gy = A.y + 60; gy < A.y + A.h; gy += 100) { ctx.moveTo(A.x, gy); ctx.lineTo(A.x + A.w, gy); }
      ctx.stroke();
      ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 30; ctx.lineWidth = 8;
      var grad = ctx.createLinearGradient(A.x, A.y, A.x + A.w, A.y + A.h);
      grad.addColorStop(0, '#ff2bd6'); grad.addColorStop(0.5, '#7a5cff'); grad.addColorStop(1, '#00e5ff');
      ctx.strokeStyle = grad; ctx.strokeRect(A.x, A.y, A.w, A.h);
      ctx.restore();

      this.ents.forEach(function (e) { if ((e.z || 0) < 0) e.draw(ctx, self); });
      this.balls.forEach(function (b) { if (b.alive) self.drawBall(ctx, b, time); });
      this.ents.forEach(function (e) { if ((e.z || 0) >= 0) e.draw(ctx, self); });
      if (this.dark > 0.01) this.drawDark(ctx);
    }

    drawDark(ctx) {
      var A = CONFIG.arena;
      if (!this.darkCanvas) {
        this.darkCanvas = document.createElement('canvas');
        this.darkCanvas.width = CONFIG.W; this.darkCanvas.height = CONFIG.H;
      }
      var dc = this.darkCanvas.getContext('2d');
      dc.globalCompositeOperation = 'source-over';
      dc.clearRect(0, 0, CONFIG.W, CONFIG.H);
      dc.fillStyle = 'rgba(2,0,8,' + this.dark + ')';
      dc.fillRect(A.x - 20, A.y - 20, A.w + 40, A.h + 40);
      dc.globalCompositeOperation = 'destination-out';
      var lights = this.balls.filter(function (b) { return b.alive && !b.hidden; })
        .map(function (b) { return { x: b.x, y: b.y - b.lift * 140, r: b.r * (2.4 + b.lift) }; });
      this.ents.forEach(function (e) { if (e.light) lights.push(e.light()); });
      lights.forEach(function (l) {
        var g = dc.createRadialGradient(l.x, l.y, l.r * 0.35, l.x, l.y, l.r);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        dc.fillStyle = g; dc.beginPath(); dc.arc(l.x, l.y, l.r, 0, Math.PI * 2); dc.fill();
      });
      ctx.drawImage(this.darkCanvas, 0, 0);
    }

    // 테두리 색: 팀전은 팀 색, 개인전에서 같은 캐릭터가 여럿이면 번호별 색, 아니면 캐릭터 색
    rimColor(b) {
      if (this.mode === 'team') return TEAMS[b.team % TEAMS.length].color;
      if (b.dupNo) return DUP_COLORS[(b.dupNo - 1) % DUP_COLORS.length];
      return b.color();
    }
    drawBall(ctx, b, time) {
      if (b.hidden) return;
      var lift = b.lift || 0;
      var pulse = b.pulse > 0 ? Math.sin(b.pulse * 16) * 0.18 * Math.min(1, b.pulse) : 0;
      var r = b.r * (1 + lift * 0.8 + pulse) * b.scale;
      var x = b.x + b.jx, y = b.y - lift * 140 + b.jy;
      var col = b.color(), glow = b.def.glow ? b.def.glow(b) : col;

      if (lift > 0.01) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.5, b.r * (1 - lift * 0.35), b.r * 0.35 * (1 - lift * 0.35), 0, 0, Math.PI * 2); ctx.fill();
      }
      if (b.phase >= 2) {
        var ar = r * (1.55 + Math.sin(time * 6) * 0.08);
        var g = ctx.createRadialGradient(x, y, r * 0.8, x, y, ar);
        g.addColorStop(0, glow + 'aa'); g.addColorStop(1, glow + '00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, ar, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 35; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      Assets.drawBall(ctx, b.def, b.def.portrait(b), x, y, r, b.rot, col);

      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      if (b.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (b.flash / 0.12 * 0.65) + ')'; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
      if (b.status.freeze > 0) {
        ctx.fillStyle = 'rgba(140,220,255,0.55)'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4; ctx.beginPath();
        ctx.moveTo(x - r * 0.6, y - r * 0.2); ctx.lineTo(x - r * 0.1, y + r * 0.1); ctx.lineTo(x + r * 0.5, y - r * 0.5);
        ctx.moveTo(x - r * 0.1, y + r * 0.1); ctx.lineTo(x + r * 0.1, y + r * 0.7); ctx.stroke();
      }
      if (b.status.blind > 0 && Math.sin(time * 25) > 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
      ctx.restore();

      ctx.lineWidth = this.mode === 'team' || b.dupNo ? 11 : 9; ctx.strokeStyle = this.rimColor(b);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      if (b.phase >= 2) {
        ctx.save(); ctx.setLineDash([26, 14]); ctx.lineDashOffset = -time * 80;
        ctx.lineWidth = 7; ctx.strokeStyle = b.cfg.phase2Color; ctx.shadowColor = b.cfg.phase2Color; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(x, y, r + 13, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (b.status.freeze > 0) { ctx.lineWidth = 6; ctx.strokeStyle = '#bff0ff'; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
      if (this.guardMult(b) < 1) {   // 보호막
        ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(time * 8) * 0.2; ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 25;
        ctx.beginPath(); ctx.arc(x, y, r + 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }

      // 팀 배지
      if (this.mode === 'team') {
        var T = TEAMS[b.team % TEAMS.length], bx = x - r * 0.72, by = y - r * 0.72;
        ctx.fillStyle = T.color; ctx.strokeStyle = '#0a0612'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(bx, by, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        FX.outlined(ctx, T.label, bx, by + 1, 26, '#ffffff');
      } else if (b.dupNo) {   // 같은 캐릭터 번호 배지
        var dc = this.rimColor(b), dx = x - r * 0.72, dy = y - r * 0.72;
        ctx.fillStyle = dc; ctx.strokeStyle = '#0a0612'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(dx, dy, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        FX.outlined(ctx, String(b.dupNo), dx, dy + 1, 28, dc === '#ffffff' || dc === '#ffd400' ? '#111111' : '#ffffff');
      }

      // 머리 위 상태 표시
      var top = y - r - 34;
      if (b.status.stun > 0) {
        ctx.save(); ctx.strokeStyle = '#ffe600'; ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 20; ctx.lineWidth = 6;
        for (var k = 0; k < 3; k++) {
          var a = time * 6 + k * 2.09, sx = x + Math.cos(a) * r * 0.8, sy = top + Math.sin(a) * 10;
          ctx.beginPath(); ctx.moveTo(sx - 10, sy - 18); ctx.lineTo(sx + 4, sy - 4); ctx.lineTo(sx - 6, sy + 2); ctx.lineTo(sx + 10, sy + 18); ctx.stroke();
        }
        ctx.restore();
      }
      if (b.status.blind > 0) {
        ctx.font = '56px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🙈', x, top - (b.status.stun > 0 ? 40 : 0));
      }
      if (b.def.drawExtra) b.def.drawExtra(ctx, b, this, x, y, r, time);
    }

    // 인원 수에 맞춰 1열/2열, 패널 높이 자동 조절
    drawHUD(ctx, time) {
      var self = this, n = this.balls.length, top = 14, area = 372;
      var cols = n <= 3 ? 1 : 2, rows = Math.ceil(n / cols), gap = 8;
      var ph = Math.min(108, (area - (rows - 1) * gap) / rows), pw = (1040 - (cols - 1) * 10) / cols;
      this.balls.forEach(function (b, i) {
        var col = i % cols, row = Math.floor(i / cols);
        self.drawPanel(ctx, b, 20 + col * (pw + 10), top + row * (ph + gap), pw, ph, cols === 1, time);
      });
      if (this.synergies.length) {
        var txt = this.synergies.map(function (s) { return '✦ ' + TEAMS[s.team % TEAMS.length].label + '팀 ' + s.name; }).join('   ');
        ctx.font = '700 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe14d';
        ctx.strokeText(txt, CONFIG.W / 2, CONFIG.arena.y - 6); ctx.fillText(txt, CONFIG.W / 2, CONFIG.arena.y - 6);
      }
      // 각 캐릭터의 화면 오버레이 (예: 염색 슬롯)
      this.balls.forEach(function (b) { if (b.def.drawOverlay) b.def.drawOverlay(ctx, b, self, time); });
    }

    drawPanel(ctx, b, x, y, w, h, wide, time) {
      var col = b.color(), dead = !b.alive, k = h / 108, self = this;
      var tcol = this.mode === 'team' || b.dupNo ? this.rimColor(b) : col;
      ctx.save();
      ctx.globalAlpha = dead ? 0.4 : 1;
      ctx.fillStyle = 'rgba(20,14,40,0.85)'; roundRect(ctx, x, y, w, h, 18 * k + 4); ctx.fill();
      ctx.strokeStyle = tcol; ctx.lineWidth = this.mode === 'team' || b.dupNo ? 5 : 3; ctx.stroke();
      // 초상화
      var pr = 40 * k, pcx = x + 14 + pr, pcy = y + h / 2;
      Assets.drawBall(ctx, b.def, b.def.portrait(b), pcx, pcy, pr, 0, col);
      ctx.lineWidth = 5 * k; ctx.strokeStyle = this.rimColor(b); ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, Math.PI * 2); ctx.stroke();
      if (b.phase >= 2) { ctx.strokeStyle = b.cfg.phase2Color; ctx.lineWidth = 4 * k; ctx.beginPath(); ctx.arc(pcx, pcy, pr + 7 * k, 0, Math.PI * 2); ctx.stroke(); }
      if (this.mode === 'team') FX.outlined(ctx, TEAMS[b.team % TEAMS.length].label, x + 16, y + 18, 24, TEAMS[b.team % TEAMS.length].color);
      // 이름 / 페이즈
      var tx = x + 28 + pr * 2;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '700 ' + Math.round(34 * k) + 'px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(b.name, tx, y + 36 * k);
      var nx = tx + ctx.measureText(b.name).width + 12 * k;
      var ptxt = dead ? 'K.O.' : b.phase >= 2 ? (wide ? 'PHASE 2' : 'P2') : (wide ? 'PHASE 1' : 'P1');
      ctx.font = '700 ' + Math.round(21 * k) + 'px "Malgun Gothic",sans-serif';
      var pw = ctx.measureText(ptxt).width + 16 * k;
      ctx.fillStyle = b.phase >= 2 ? b.cfg.phase2Color : 'rgba(255,255,255,0.18)';
      roundRect(ctx, nx, y + 12 * k, pw, 28 * k, 14 * k); ctx.fill();
      ctx.fillStyle = b.phase >= 2 ? '#111' : '#fff'; ctx.fillText(ptxt, nx + 8 * k, y + 33 * k);
      nx += pw + 10 * k;
      if (wide && b.def.hudTag) b.def.hudTag(ctx, b, nx, y + 12, time);
      // HP 바
      var bx = tx, by = y + 46 * k, bw = wide ? 600 : x + w - 12 - tx, bh = 28 * k;
      ctx.fillStyle = '#1b1530'; roundRect(ctx, bx, by, bw, bh, 9 * k); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; roundRect(ctx, bx, by, bw * Math.max(0, b.hpShown / b.maxHp), bh, 9 * k); ctx.fill();
      var hg = ctx.createLinearGradient(bx, 0, bx + bw, 0); hg.addColorStop(0, col); hg.addColorStop(1, b.cfg.phase2Color);
      ctx.fillStyle = hg; roundRect(ctx, bx, by, bw * Math.max(0, b.hp / b.maxHp), bh, 9 * k); ctx.fill();
      ctx.font = '700 ' + Math.round(21 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      var ht = Math.ceil(b.hp) + ' / ' + Math.round(b.maxHp);
      ctx.strokeText(ht, bx + bw - 8, by + bh * 0.78); ctx.fillText(ht, bx + bw - 8, by + bh * 0.78);
      // 상태이상 아이콘 (넓으면 HP바 오른쪽, 좁으면 이름줄 오른쪽 끝)
      var icons = [], s = b.status;
      if (s.burn > 0) icons.push(['🔥', s.burn.toFixed(1)]);
      if (s.stun > 0) icons.push(['⚡', s.stun.toFixed(1)]);
      if (s.freeze > 0) icons.push(['🧊', s.freeze.toFixed(1)]);
      if (s.bleedStacks > 0) icons.push(['🩸', 'x' + s.bleedStacks]);
      if (s.blind > 0) icons.push(['🙈', s.blind.toFixed(1)]);
      if (b.hidden) icons.push(['🌑', '']);
      if (b.takenMult < 1) icons.push(['😊', '']);
      if (this.guardMult(b) < 1) icons.push(['🛡️', '']);
      if (s.slow > 0) icons.push(['🐌', s.slow.toFixed(1)]);
      if (s.haste > 0) icons.push(['💨', s.haste.toFixed(1)]);
      icons.forEach(function (ic, q) {
        var isz = wide ? 34 : Math.round(26 * k), step = isz * 1.7;
        var ix = wide ? 760 + q * 60 : x + w - 14 - (icons.length - q) * step;
        var iy = wide ? by + 26 : y + 34 * k;
        ctx.font = isz + 'px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.fillText(ic[0], ix + isz * 0.5, iy);
        ctx.font = '700 ' + Math.round(isz * 0.53) + 'px "Malgun Gothic",sans-serif';
        ctx.strokeText(ic[1], ix + isz * 0.9, iy + isz * 0.4); ctx.fillText(ic[1], ix + isz * 0.9, iy + isz * 0.4);
      });
      // 스킬 게이지 (패널이 너무 작으면 생략)
      if (h >= 64) {
        b.skills.forEach(function (sk, q) {
          var gw = wide ? 290 : (bw - 8) / 2, gx = bx + q * (gw + (wide ? 20 : 8)), gy = y + 84 * k, gh = Math.max(10, 16 * k);
          var locked = q > 0 && b.phase < 2;
          var info = b.def.gauge ? b.def.gauge(b, q, sk, self) : null;
          var fill = info && info.fill != null ? info.fill : 1 - Math.max(0, sk.cd) / sk.max;
          var label = info && info.label ? info.label : sk.def.name;
          ctx.fillStyle = '#1b1530'; roundRect(ctx, gx, gy, gw, gh, gh / 2); ctx.fill();
          if (!locked) {
            ctx.fillStyle = fill >= 1 ? '#ffffff' : (info && info.color) || col;
            roundRect(ctx, gx, gy, gw * clamp(fill, 0, 1), gh, gh / 2); ctx.fill();
          }
          ctx.font = '700 ' + Math.max(12, Math.round(17 * k)) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'left';
          ctx.fillStyle = locked ? 'rgba(255,255,255,0.4)' : '#fff';
          var lt = locked ? '🔒 ' + sk.def.name + (wide ? ' (PHASE 2)' : '') : label;
          ctx.strokeText(lt, gx + 6, gy + gh - 2, gw - 10); ctx.fillText(lt, gx + 6, gy + gh - 2, gw - 10);
        });
      }
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h / 2, Math.max(0, w) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  Battle.Ball = Ball;
  Battle.TEAMS = TEAMS;
  Battle.roundRect = roundRect;
  return Battle;
})();
