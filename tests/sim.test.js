// 헤드리스 시뮬레이션 테스트: node tests/sim.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const ctx = { console, Math, Set, Object, Array, JSON };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['config.js', 'fx.js', 'battle.js', 'characters.js', 'records.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const { CONFIG, Battle, CHARACTERS, Ents, SYNERGIES } = ctx;
const DT = 1 / 60;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n   ', e.message); }
}
function run(bt, seconds) { for (let i = 0; i < seconds * 60 && !bt.over; i++) bt.update(DT); }
// 끝날 때까지 (히트스톱 동안은 전투 시간이 멈추므로 프레임 여유 있게)
function runToEnd(bt) { for (let i = 0; i < (CONFIG.battle.maxTime + 60) * 90 && !bt.over; i++) bt.update(DT); }
function count(bt, type, pred) { return bt.log.filter(e => e.type === type && (!pred || pred(e))).length; }
// 테스트용: 특정 캐릭터를 페이즈 2로 만들기
function toPhase2(bt, b) { b.hp = b.maxHp * 0.5 + 1; bt.damage(b, 2, null, {}); bt.freeze = 0; bt.hitstop = 0; }

test('2명 선택 전투가 끝까지 진행된다', () => {
  const bt = new Battle(['baton', 'samsik']);
  runToEnd(bt);
  assert(bt.over, 'battle not over');
  assert(count(bt, 'end') === 1);
});

test('3명 선택 개인전이 끝까지 진행된다', () => {
  const bt = new Battle(['baton', 'ibi', 'samsik']);
  runToEnd(bt);
  assert(bt.over);
});

test('1스킬이 쿨타임 간격으로 자동 발동 (페이즈 1)', () => {
  CONFIG.battle.contactDamage = 0; // 페이즈 전환 없이 쿨타임만 보기
  for (const id of ['baton', 'ibi', 'samsik', 'ch', 'hxpwm']) {
    const other = id === 'baton' ? 'ibi' : 'baton';
    const bt = new Battle([id, other]);
    bt.balls.forEach(b => { b.hp = b.maxHp = 1e6; });
    run(bt, 30);
    const key = CHARACTERS[id].skills[0].key;
    const times = bt.log.filter(e => e.type === 'skill' && e.who === id && e.skill === key).map(e => e.t);
    assert(times.length >= (id === 'samsik' ? 2 : 3), id + ' cast ' + times.length);   // 김선율은 접촉해야 다시 장전
    const cd = CHARACTERS[id].skills[0].cd(CONFIG.chars[id]);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      // 삼식이 긋기는 장전 후 접촉할 때까지 쿨이 멈추므로 최소 간격만 확인
      assert(gap >= cd - 0.05, `${id} gap ${gap.toFixed(2)} < cd ${cd}`);
      if (id !== 'samsik') assert(gap <= cd + 2.0, `${id} gap ${gap.toFixed(2)} too long`);
    }
    assert(count(bt, 'skill', e => e.who === id && e.skill !== key) === 0, id + ' used skill2 in phase1');
  }
  CONFIG.battle.contactDamage = 5;
});

test('페이즈 2 진입 시 1·2스킬 모두 사용', () => {
  CONFIG.battle.contactDamage = 0;
  for (const id of ['baton', 'ibi', 'samsik', 'ch', 'hxpwm', 'gym']) {
    const bt = new Battle([id, id === 'baton' ? 'ibi' : 'baton']);
    const b = bt.balls[0];
    bt.balls[1].hp = bt.balls[1].maxHp = 1e6;
    toPhase2(bt, b);
    assert.strictEqual(b.phase, 2);
    b.maxHp = 1e6; b.hp = 1e6;  // 죽지 않게
    run(bt, 40);
    const s1 = count(bt, 'skill', e => e.who === id && e.skill === CHARACTERS[id].skills[0].key);
    // CH의 2스킬은 상시 패시브라 발동 횟수 대신 회전 여부로 확인
    const s2 = id === 'ch' ? (b.data.tentAng > 1 ? 99 : 0) : count(bt, 'skill', e => e.who === id && e.skill === CHARACTERS[id].skills[1].key);
    assert(s1 >= 2 && s2 >= 2, `${id} s1=${s1} s2=${s2}`);
  }
  CONFIG.battle.contactDamage = 5;
});

test('이비 규순이 각성: 3개 하위 스킬이 모두 랜덤하게 나온다', () => {
  const picks = { birds: 0, lucha: 0, toka: 0 };
  for (let k = 0; k < 40; k++) {
    const bt = new Battle(['ibi', 'baton']);
    const ibi = bt.balls[0];
    bt.balls[1].hp = bt.balls[1].maxHp = 1e6;
    toPhase2(bt, ibi); ibi.hp = ibi.maxHp = 1e6;
    run(bt, 30);
    bt.log.filter(e => e.type === 'awakenPick').forEach(e => picks[e.pick]++);
    if (k === 0) {
      assert(count(bt, 'luchaLand') + count(bt, 'tokaWave') + count(bt, 'birdHit') > 0, 'no sub effects');
    }
  }
  console.log('    각성 선택 횟수', JSON.stringify(picks));
  for (const k in picks) assert(picks[k] > 10, k + ' rarely picked');
});

test('출혈 중첩 시 지속시간 초기화 + 최대 5중첩', () => {
  const bt = new Battle(['samsik', 'baton']);
  const t = bt.balls[1], c = CONFIG.chars.samsik.slash;
  bt.balls[0].skills[0].cd = 1e9; bt.balls[0].data.armed = false;   // 실제 긋기가 끼어들지 않게
  bt.applyBleed(t, c);
  const t0 = bt.time;
  run(bt, 2);
  assert(Math.abs(t.status.bleed - (c.bleedTime - (bt.time - t0))) < 0.05, 'bleed left ' + t.status.bleed);
  bt.applyBleed(t, c);
  assert.strictEqual(t.status.bleedStacks, 2);
  assert.strictEqual(t.status.bleed, c.bleedTime);
  for (let i = 0; i < 10; i++) bt.applyBleed(t, c);
  assert.strictEqual(t.status.bleedStacks, 5);
  const hp = t.hp;
  t.status.bleed = 1; // 1초 동안 5중첩 x bleedDps
  for (let i = 0; i < 60; i++) bt.updateBall(t, DT);
  assert(Math.abs(hp - t.hp - 5 * c.bleedDps) < 0.01, 'bleed dmg ' + (hp - t.hp));
  assert.strictEqual(t.status.bleedStacks, 0);
});

test('염색 확률 (100,000회)', () => {
  const N = 100000, cnt = {};
  for (let i = 0; i < N; i++) { const c = CHARACTERS.samsik.rollDye(); cnt[c] = (cnt[c] || 0) + 1; }
  const total = Object.values(CONFIG.dyeChances).reduce((a, b) => a + b, 0);
  const out = [];
  for (const k in CONFIG.dyeChances) {
    const p = cnt[k] / N, want = CONFIG.dyeChances[k] / total;
    out.push(`${k} ${(p * 100).toFixed(2)}%`);
    assert(Math.abs(p - want) < 0.008, `${k}: ${p} vs ${want}`);
  }
  console.log('    ', out.join(' · '));
});

test('염색: 페이즈 2 진입 즉시 첫 염색, 이후 8초마다', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['samsik', 'baton']);
  const s = bt.balls[0];
  bt.balls[1].hp = bt.balls[1].maxHp = 1e6;
  run(bt, 3);
  assert.strictEqual(count(bt, 'dye'), 0, 'dye in phase 1');
  const t0 = bt.time;
  toPhase2(bt, s); s.hp = s.maxHp = 1e6;
  assert.strictEqual(count(bt, 'dye'), 1, 'no immediate dye');
  run(bt, 0.9);
  assert(s.data.dye, 'dye not applied after roulette');
  run(bt, 17);
  const times = bt.log.filter(e => e.type === 'dye').map(e => e.t);
  assert(times.length === 3, 'dyes ' + times.length);
  assert(Math.abs(times[1] - times[0] - 8) < 0.05 && Math.abs(times[2] - times[1] - 8) < 0.05, times.join(','));
  CONFIG.battle.contactDamage = 5;
});

// 염색 효과 단위 테스트: 접촉을 직접 발생시킨다
function dyeSetup(color) {
  const bt = new Battle(['samsik', 'ibi']);
  const s = bt.balls[0], t = bt.balls[1];
  s.phase = 2; s.data.dye = color;
  s.x = 300; s.y = 900; t.x = 700; t.y = 900; t.vx = 300; t.vy = 0;
  return { bt, s, t };
}
test('빨강: 추가 데미지 + 화상(중첩X, 시간 초기화)', () => {
  const { bt, s, t } = dyeSetup('red');
  const hp = t.hp;
  bt.contact(s, t, 0, 0);
  assert.strictEqual(t.status.burn, 3);
  assert.strictEqual(hp - t.hp, 5 + 10);
  t.status.burn = 1; bt.time += 1.1;
  bt.contact(s, t, 0, 0);
  assert.strictEqual(t.status.burn, 3, 'burn refresh');
  const h2 = t.hp; t.status.burn = 1;
  for (let i = 0; i < 60; i++) bt.updateBall(t, DT);
  assert(Math.abs(h2 - t.hp - CONFIG.chars.samsik.dye.red.burnDps) < 0.01, 'burn dps ' + (h2 - t.hp));
});
test('노랑: 스턴, 스턴 중 이동·스킬 불가', () => {
  const { bt, s, t } = dyeSetup('yellow');
  t.skills[0].cd = 0.01;
  bt.contact(s, t, 0, 0);
  assert.strictEqual(t.status.stun, CONFIG.chars.samsik.dye.yellow.stun);
  for (let i = 0; i < 30; i++) bt.updateBall(t, DT);
  assert.strictEqual(count(bt, 'skill', e => e.who === 'ibi'), 0, 'skill used while stunned');
  for (let i = 0; i < (CONFIG.chars.samsik.dye.yellow.stun + 0.5) * 60; i++) bt.updateBall(t, DT);
  assert(count(bt, 'skill', e => e.who === 'ibi') >= 1, 'skill not used after stun');
});
test('파랑: 2.5초 빙결 → 재접촉 시 25 추가 데미지 + 해제', () => {
  const { bt, s, t } = dyeSetup('blue');
  bt.contact(s, t, 0, 0);
  assert.strictEqual(t.status.freeze, 2.5);
  assert(t.disabled);
  bt.time += 0.5;
  bt.contact(s, t, 0, 0);  // 1초 내부 쿨다운: 무효
  assert(t.status.freeze > 0, 'internal cooldown not respected');
  bt.time += 0.6;
  const hp = t.hp;
  bt.contact(s, t, 0, 0);
  assert.strictEqual(t.status.freeze, 0);
  assert.strictEqual(hp - t.hp, 5 + 25);
  assert.strictEqual(count(bt, 'shatter'), 1);
});
test('삭발: 지진 파동 3번(간격은 config), 파동당 1회 8데미지', () => {
  const { bt, s, t } = dyeSetup('shaved');
  t.x = s.x + 150; t.vx = 0; t.speed = 0;
  s.speed = 0; s.vx = s.vy = 0;
  bt.contact(s, t, 0, 0);
  const hp = t.hp, Q = CONFIG.chars.samsik.dye.shaved;
  run(bt, Q.interval * (Q.waves - 1) - 0.1);
  assert.strictEqual(count(bt, 'quakeWave'), Q.waves - 1, 'waves came too fast');
  run(bt, 1.2);   // 히트스톱 동안은 전투 시간이 멈추므로 여유 있게
  assert.strictEqual(count(bt, 'quakeWave'), Q.waves);
  assert.strictEqual(count(bt, 'quakeHit'), 3);
  const quakeDmg = bt.log.filter(e => e.type === 'damage' && e.who === 'ibi' && e.src === 'samsik' && e.amt === 8).length;
  assert.strictEqual(quakeDmg, 3);
});
test('검정: 0.8초 사라짐(무적) → 상대 뒤에 나타나 20 데미지', () => {
  const { bt, s, t } = dyeSetup('black');
  bt.contact(s, t, 0, 0);
  assert(s.hidden);
  const h0 = s.hp;
  bt.damage(s, 50, t);
  assert.strictEqual(s.hp, h0, 'hidden not invulnerable');
  const hp = t.hp;
  run(bt, 0.85);
  assert(!s.hidden);
  assert.strictEqual(count(bt, 'ambush'), 1);
  assert(hp - t.hp >= 20);
  const sp = Math.hypot(t.vx, t.vy), dot = ((s.x - t.x) * t.vx + (s.y - t.y) * t.vy) / (sp || 1);
  assert(dot < 0, 'should appear behind target');
});
test('하양: 받는 모든 피해 80% 무시 (팀전은 같은 팀 전원), 색이 바뀌면 해제', () => {
  CONFIG.battle.contactDamage = 0;
  const G = CONFIG.chars.samsik.dye.white.guard;
  const bt = new Battle(['samsik', 'baton', 'ibi']);
  const s = bt.balls[0], t = bt.balls[2];
  bt.balls.forEach(b => { b.hp = b.maxHp = 1e6; });
  s.phase = 2; s.data.dye = 'white';
  run(bt, 0.5);
  assert(Math.abs(bt.damage(s, 10, t) - 10 * G) < 1e-9, 'samsik not shielded');
  assert.strictEqual(bt.damage(bt.balls[1], 10, t), 10, '개인전에서 남은 보호 안 됨');
  assert.strictEqual(t.status.blind, 0, 'no more blind');
  s.data.dye = 'red';
  run(bt, 1);
  assert.strictEqual(bt.damage(s, 10, t), 10, 'shield did not wear off');
  const tm = new Battle(team([['samsik', 0], ['gym', 0], ['ibi', 1]]), 'team');
  const [s3, g3, i3] = tm.balls;
  tm.balls.forEach(b => { b.hp = b.maxHp = 1e6; });
  s3.phase = 2; s3.data.dye = 'white'; run(tm, 0.3);
  assert(Math.abs(tm.damage(g3, 10, i3) - 10 * G) < 1e-9, 'teammate not shielded');
  assert.strictEqual(tm.damage(i3, 10, g3), 10, 'enemy shielded');
  CONFIG.battle.contactDamage = 5;
  t.status.blind = 1;
  let miss = 0;
  for (let i = 0; i < 4000; i++) if (bt.aim(t, 0, 0).miss) miss++;
  const want = CONFIG.status.blindMissChance;
  assert(Math.abs(miss / 4000 - want) < 0.04, 'miss rate ' + miss / 4000 + ' vs ' + want);
});
test('긋기 장전 + 염색 효과가 같은 접촉에서 둘 다 적용', () => {
  const { bt, s, t } = dyeSetup('red');
  s.data.armed = true;
  bt.contact(s, t, 0, 0);
  assert(!s.data.armed);
  assert.strictEqual(t.status.bleedStacks, 1);
  assert(t.status.burn > 0);
});
test('접촉 데미지 0.5초 쿨다운', () => {
  const bt = new Battle(['baton', 'ibi']);
  const [a, b] = bt.balls;
  bt.contact(a, b, 0, 0); bt.time += 0.3; bt.contact(a, b, 0, 0);
  assert.strictEqual(b.maxHp - b.hp, 5);
  bt.time += 0.3; bt.contact(a, b, 0, 0);
  assert.strictEqual(b.maxHp - b.hp, 10);
});

test('CH 배앰: 개수 제한 없음, 적에게 닿으면 사라짐', () => {
  const bt = new Battle(['ch', 'baton']);
  const [c, t] = bt.balls;
  t.speed = 0; t.vx = t.vy = 0; t.x = 540; t.y = 1000;
  const snakes = [];
  for (let i = 0; i < 6; i++) snakes.push(bt.add(new Ents.Snake(bt, c, CONFIG.chars.ch.snake, { x: 200, y: 600 + i * 20 })));
  assert.strictEqual(bt.ents.filter(e => e instanceof Ents.Snake && !e.dead).length, 6, 'snake cap still applied');
  const sn = snakes[0]; sn.x = t.x; sn.y = t.y; sn.update(0.001);
  assert(sn.dead, 'snake should vanish on hit');
  sn.update(0.001); snakes[1].update(0.001);
  assert.strictEqual(count(bt, 'snakeHit'), 1);
});
test('CH 배앰: 규순이(여성)에게 2배 데미지', () => {
  const bt = new Battle(['ch', 'ibi']);
  const [c, ibi] = bt.balls;
  ibi.speed = 0; ibi.vx = ibi.vy = 0; ibi.x = 540; ibi.y = 1000;
  const s1 = bt.add(new Ents.Snake(bt, c, CONFIG.chars.ch.snake, { x: ibi.x, y: ibi.y }));
  s1.update(0.001);
  ibi.data.gyusuni = true;
  const s2 = bt.add(new Ents.Snake(bt, c, CONFIG.chars.ch.snake, { x: ibi.x, y: ibi.y }));
  s2.update(0.001);
  const hits = bt.log.filter(e => e.type === 'snakeHit');
  assert.strictEqual(hits.length, 2);
  assert.strictEqual(hits[0].amt, CONFIG.chars.ch.snake.damage);
  assert.strictEqual(hits[1].amt, CONFIG.chars.ch.snake.damage * 2);
  assert(hits[1].female);
});
test('CH 텐트치기: 페이즈 2에서 돌며 적 타격, 뱀에 닿으면 길어지고 빨라짐', () => {
  const bt = new Battle(['ch', 'baton']);
  const [c, t] = bt.balls;
  run(bt, 0.5);
  assert.strictEqual(c.data.tentAng, 0, 'tent active in phase 1');
  toPhase2(bt, c);
  const len0 = c.data.tentLen, spin0 = c.data.tentSpin;
  // 뱀을 돌기 바로 앞에 둔다
  const sn = bt.add(new Ents.Snake(bt, c, CONFIG.chars.ch.snake));
  c.data.tentAng = 0; c.speed = 0; c.vx = c.vy = 0;
  sn.c = Object.assign({}, sn.c, { speed: 0 });
  sn.x = c.x + c.r + 30; sn.y = c.y; sn.pts.forEach(p => { p.x = sn.x; p.y = sn.y; });
  CHARACTERS.ch.update(bt, c, 0.001);
  assert(c.data.tentLen > len0 && c.data.tentSpin > spin0, 'tent did not grow');
  // 적을 돌기 끝에 둔다
  t.x = c.x + c.r + 40; t.y = c.y; t.speed = 0; t.vx = t.vy = 0;
  bt.time += 5; CHARACTERS.ch.update(bt, c, 0.001);
  assert.strictEqual(count(bt, 'tentHit'), 1);
});

// ---------- 팀전 / 시너지 ----------
function team(list) { return list.map(([id, t]) => ({ id, team: t })); }
test('팀전: 팀원끼리는 데미지 없음, 한 팀만 남으면 승리', () => {
  const bt = new Battle(team([['baton', 0], ['ibi', 0], ['samsik', 1]]), 'team');
  const [a, b, c] = bt.balls;
  assert.strictEqual(bt.damage(b, 50, a), 0);
  bt.contact(a, b, 0, 0);
  bt.collide();
  assert.strictEqual(b.hp, b.maxHp, 'ally took damage');
  assert(bt.enemies(a).every(o => o.team !== a.team));
  bt.damage(c, 9999, a);
  bt.checkEnd();
  assert(bt.over && bt.winnerTeam === 0);
});
test('개인전/팀전 인원 무제한: 캐릭터 수+2명 개인전, 4팀 12명 팀전 끝까지 진행', () => {
  const ids = Object.keys(CHARACTERS);
  const ffa = new Battle(Array.from({ length: ids.length + 2 }, (_, i) => ids[i % ids.length]));
  runToEnd(ffa); assert(ffa.over);
  assert(ffa.balls.some(b => /\d$/.test(b.name)), 'duplicate names not numbered');
  const tm = new Battle(Array.from({ length: 12 }, (_, i) => ({ id: ids[i % ids.length], team: i % 4 })), 'team');
  runToEnd(tm); assert(tm.over);
});
test('초대받지 못한 손님: 팀에 바통 혼자면 모든 스탯 3배', () => {
  const U = CONFIG.synergy.uninvited;
  const bt = new Battle(team([['baton', 0], ['ibi', 1], ['ch', 1]]), 'team');
  const b = bt.balls[0];
  assert(bt.hasSynergy('uninvited', 0));
  assert.strictEqual(b.maxHp, CONFIG.chars.baton.hp * U.hp);
  assert.strictEqual(b.speed, CONFIG.chars.baton.speed * U.speed);
  assert.strictEqual(bt.damage(bt.balls[1], 10, b), 10 * U.damage);
  const bt2 = new Battle(team([['baton', 0], ['ibi', 0], ['ch', 1]]), 'team');
  assert(!bt2.hasSynergy('uninvited', 0));
  const bt3 = new Battle(['baton', 'ibi']);   // 개인전에는 없음
  assert.strictEqual(bt3.synergies.length, 0);
});
test('초대받지 못한 손님: 끼야아아악은 피해 배율 없이 확정 2연타', () => {
  for (let k = 0; k < 10; k++) {
    const bt = new Battle(team([['baton', 0], ['ibi', 1]]), 'team');
    const [b, t] = bt.balls;
    t.hp = t.maxHp = 1e6;
    b.action = CHARACTERS.baton.skills[1].start(bt, b);
    for (let i = 0; i < 120 && b.action; i++) bt.update(DT);
    const hits = bt.log.filter(e => e.type === 'damage' && e.src === 'baton' && e.who === 'ibi' && e.kind !== 'contact');
    assert.strictEqual(count(bt, 'screamHit'), 2, 'not double');
    hits.forEach(h => assert.strictEqual(h.amt, CONFIG.chars.baton.scream.damage));
  }
});
test('IZK 1기: 네 명 한 팀이면 피해 +20%, 긴급소집 추가 효과', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(team([['ibi', 0], ['samsik', 0], ['ch', 0], ['hxpwm', 0], ['baton', 1]]), 'team');
  assert(bt.hasSynergy('izk', 0));
  const [ibi, sam, ch, hx, bat] = bt.balls;
  bat.hp = bat.maxHp = 1e6;
  assert(Math.abs(bt.damage(bat, 10, ch) - 12) < 1e-9);
  const snakes0 = bt.ents.filter(e => e instanceof Ents.Snake).length;
  hx.action = CHARACTERS.hxpwm.skills[1].start(bt, hx);
  assert.strictEqual(count(bt, 'izkCall'), 1);
  assert.strictEqual(bt.ents.filter(e => e instanceof Ents.Snake && e.owner === ch).length - snakes0, 3, 'CH 3 snakes');
  const md = bt.log.find(e => e.type === 'multiDye');
  assert(md && (md.dyes.join() === 'black,white' || md.dyes.join() === 'red,blue,yellow,shaved'), 'samsik multi dye');
  assert.deepStrictEqual(sam.data.dyes, md.dyes);
  run(bt, 12);
  const picks = bt.log.filter(e => e.type === 'awakenPick' && e.combo).map(e => e.pick);
  assert.strictEqual(picks.join(), 'birds,lucha,toka');
  // 다른 팀 구성에선 추가 효과 없음
  const bt2 = new Battle(team([['ibi', 0], ['samsik', 0], ['hxpwm', 0], ['ch', 1]]), 'team');
  assert(!bt2.hasSynergy('izk', 0));
  bt2.balls[2].action = CHARACTERS.hxpwm.skills[1].start(bt2, bt2.balls[2]);
  assert.strictEqual(count(bt2, 'izkCall'), 0);
  CONFIG.battle.contactDamage = 5;
});
test('IZK 삼식이 복합 염색: 네 가지 색 효과가 한 번에 적용', () => {
  const bt = new Battle(['samsik', 'ibi']);
  const [s, t] = bt.balls;
  s.data.dyes = ['red', 'blue', 'yellow', 'shaved']; s.data.dye = 'red';
  bt.contact(s, t, 0, 0);
  assert(t.status.burn > 0 && t.status.freeze > 0 && t.status.stun > 0, 'not all effects');
  assert.strictEqual(count(bt, 'quake'), 1);
  const bt2 = new Battle(['samsik', 'ibi', 'baton']);
  const s2 = bt2.balls[0];
  s2.data.dyes = ['black', 'white']; s2.data.dye = 'black';
  run(bt2, 0.2);
  assert(bt2.guardMult(s2) < 1, 'white passive');
  bt2.contact(s2, bt2.balls[1], 0, 0);
  assert(s2.hidden, 'black vanish');
});

// ---------- hxpwm ----------
test('hxpwm 주뱃: 충전기 생성, 적이 먹으면 초음파 확정 피해, 본인이 먹으면 해피', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['hxpwm', 'baton']);
  const [h, b] = bt.balls;
  [h, b].forEach(x => { x.speed = 0; x.vx = x.vy = 0; });
  h.x = 200; h.y = 600; b.x = 800; b.y = 1400;
  const c1 = bt.add(new Ents.Charger(bt, h, { x: b.x, y: b.y }));
  run(bt, 0.5);
  assert(c1.dead, 'enemy did not eat');
  b.status.blind = 5;   // 실명이어도 확정
  run(bt, 0.4);
  assert.strictEqual(count(bt, 'ultrasound'), 1);
  assert.strictEqual(b.maxHp - b.hp, CONFIG.chars.hxpwm.charger.ultraDamage * (b.def.name === '유재후' ? CONFIG.chars.hxpwm.antiYoo : 1));   // 유재후면 hxpwm 패시브 1.5배
  bt.add(new Ents.Charger(bt, h, { x: h.x, y: h.y }));
  run(bt, 0.5);
  assert.strictEqual(count(bt, 'happy'), 1);
  assert.strictEqual(h.takenMult, CONFIG.chars.hxpwm.charger.happyTaken);
  assert.strictEqual(h.slow, CONFIG.chars.hxpwm.charger.happySpeed);
  const hp = h.hp; bt.damage(h, 20, b);
  assert.strictEqual(hp - h.hp, 20 * CONFIG.chars.hxpwm.charger.happyTaken);
  run(bt, CONFIG.chars.hxpwm.charger.happyTime + 0.2);
  assert.strictEqual(h.takenMult, 1);
  // 자동 생성 + 최대 개수
  const bt2 = new Battle(['hxpwm', 'baton']);
  bt2.balls.forEach(x => { x.hp = x.maxHp = 1e6; x.speed = 0; x.vx = x.vy = 0; });
  bt2.balls[0].x = 100; bt2.balls[0].y = 450; bt2.balls[1].x = 980; bt2.balls[1].y = 450;
  run(bt2, 20);
  const n = bt2.ents.filter(e => e instanceof Ents.Charger && !e.dead).length;
  assert(n >= 1 && n <= CONFIG.chars.hxpwm.charger.maxChargers, 'chargers ' + n);
  // 팀원은 못 먹음
  const bt3 = new Battle(team([['hxpwm', 0], ['ibi', 0], ['baton', 1]]), 'team');
  const ally = bt3.balls[1]; ally.speed = 0; ally.vx = ally.vy = 0;
  const c3 = bt3.add(new Ents.Charger(bt3, bt3.balls[0], { x: ally.x, y: ally.y }));
  for (let i = 0; i < 40; i++) c3.update(1 / 60);
  assert(!c3.dead, 'ally ate charger');
  CONFIG.battle.contactDamage = 5;
});
test('hxpwm 긴급소집: 2초간 멈춰서 가장자리에서 뱀·돌·칼이 날아옴', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['hxpwm', 'baton']);
  const [h, b] = bt.balls;
  b.hp = b.maxHp = 1e6; h.hp = h.maxHp = 1e6;
  b.speed = 0; b.vx = b.vy = 0;   // 맞는지 보는 테스트라 목표는 고정
  h.skills[0].cd = 99;
  h.action = CHARACTERS.hxpwm.skills[1].start(bt, h);
  const x0 = h.x, y0 = h.y;
  run(bt, 1.0);
  assert(Math.hypot(h.x - x0, h.y - y0) < 1, 'hxpwm moved during call');
  for (let i = 0; i < 300 && h.action; i++) bt.update(DT);   // 히트스톱만큼 프레임이 더 걸림
  assert(!h.action && !h.data.calling, 'call did not end');
  assert(bt.time < 2.3, 'call lasted ' + bt.time);
  const C = CONFIG.chars.hxpwm.call;
  const shots = bt.log.filter(e => e.type === 'callShot');
  assert.strictEqual(shots.length, Math.ceil(C.duration / C.interval));
  assert.strictEqual([...new Set(shots.map(e => e.kind))].sort().join(), 'knife,snake,stone');
  run(bt, 3);
  assert(count(bt, 'stoneHit') + count(bt, 'snakeHit') + count(bt, 'knifeHit') >= 2, 'call shots rarely hit');
  CONFIG.battle.contactDamage = 5;
});

// ---------- 이름 / 신규 캐릭터 ----------
test('이름은 실명, 부제는 "OO의 모습"', () => {
  const want = { baton: ['유재후', '바통의 모습'], ibi: ['한규성', '이비의 모습'], samsik: ['김선율', '삼식이의 모습'], ch: ['조우연', 'CH의 모습'],
    hxpwm: ['조하람', 'hxpwm의 모습'], dev: ['문남휘', '개발자의 모습'], rock: ['유재운', '락사모의 모습'], gym: ['진형권', '헬스장의 모습'] };
  for (const id in want) assert.strictEqual(CHARACTERS[id].name + '/' + CHARACTERS[id].sub, want[id].join('/'));
});
test('문남휘 밸런스 패치: 닿을 때마다 상대 -5%, 본인 +5%, 최대 15회 (1초 내부 쿨다운)', () => {
  const bt = new Battle(['dev', 'ibi']);
  const [d, t] = bt.balls, r = CONFIG.chars.dev.patch.rate;
  const T0 = { hp: t.maxHp, sp: t.speed, dm: t.dmgMult }, D0 = { hp: d.maxHp, sp: d.speed, dm: d.dmgMult };
  bt.contact(d, t, 0, 0);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert(near(t.maxHp, T0.hp * (1 - r)) && near(t.speed, T0.sp * (1 - r)) && near(t.dmgMult, T0.dm * (1 - r)), 'target not nerfed');
  assert(near(d.maxHp, D0.hp * (1 + r)) && near(d.speed, D0.sp * (1 + r)) && near(d.dmgMult, D0.dm * (1 + r)), 'self not buffed');
  bt.time += 0.5; bt.contact(d, t, 0, 0);
  assert.strictEqual(count(bt, 'patch'), 1, 'internal cooldown');
  t.hp = 1e6;   // 끝까지 살아 있게
  for (let i = 0; i < 40; i++) { bt.time += 1.1; bt.contact(d, t, 0, 0); }
  const M = CONFIG.chars.dev.patch.maxStacks;
  assert.strictEqual(d.data.patches, M, 'stacks ' + d.data.patches);
  assert(Math.abs(d.data.patchF - Math.pow(1 + r, M)) < 1e-9 && Math.abs(t.data.patchF - Math.pow(1 - r, M)) < 1e-9, 'stack limit');
});
test('문남휘 치트: 레이저가 일직선상의 적을 관통', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['dev', 'ibi', 'baton']);
  const [d, a, b] = bt.balls;
  bt.balls.forEach(x => { x.speed = 0; x.vx = x.vy = 0; x.hp = x.maxHp = 1e6; });
  d.x = 200; d.y = 1000; a.x = 500; a.y = 1000; b.x = 900; b.y = 1600;
  d.skills[0].cd = 99;
  d.action = CHARACTERS.dev.skills[1].start(bt, d);
  for (let i = 0; i < 200 && d.action; i++) bt.update(DT);
  const hits = bt.log.filter(e => e.type === 'laserHit').map(e => e.who);
  assert.strictEqual(hits.join(), 'ibi', 'hit ' + hits.join());
  assert.strictEqual(a.maxHp - a.hp, CONFIG.chars.dev.cheat.damage);
  CONFIG.battle.contactDamage = 5;
});
test('유재운 들린다고: 2명을 맞혀도 쿨타임 감소는 한 번', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['rock', 'ibi', 'baton']);
  const [r, a, b] = bt.balls, C = CONFIG.chars.rock.bass;
  bt.balls.forEach(x => { x.speed = 0; x.vx = x.vy = 0; x.hp = x.maxHp = 1e6; });
  r.x = 540; r.y = 1000; a.x = 700; a.y = 1000; b.x = 540; b.y = 1200;
  r.skills[0].cd = 0.001;
  bt.update(DT);
  for (let i = 0; i < 30; i++) bt.update(DT);
  assert.strictEqual(count(bt, 'bassHit'), 2);
  assert.strictEqual(count(bt, 'bassRefund'), 1, 'refund should apply once per cast');
  assert(r.skills[0].cd < C.cd - C.refund + 0.1 && r.skills[0].cd > C.cd - 2 * C.refund, 'cooldown ' + r.skills[0].cd);
  CONFIG.battle.contactDamage = 5;
});
test('유재운 발냄새: 페이즈 2에서 영역 생성, 가까울수록 피해 큼', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['rock', 'ibi', 'baton']);
  const [r, a, b] = bt.balls, R = CONFIG.chars.rock.stink.radius;
  bt.balls.forEach(x => { x.speed = 0; x.vx = x.vy = 0; });
  r.skills[0].cd = 99;
  toPhase2(bt, r); r.hp = r.maxHp = 1e6; a.hp = a.maxHp = 1e6; b.hp = b.maxHp = 1e6;
  assert(bt.ents.some(e => e instanceof Ents.StinkZone), 'no zone');
  r.x = 540; r.y = 1000; a.x = 540 + r.r + a.r + 5; a.y = 1000; b.x = 540; b.y = 1000 + R - 20;
  run(bt, 2.1);
  const dmg = who => bt.log.filter(e => e.type === 'stinkHit' && e.who === who).reduce((s, e) => s + e.amt, 0);
  assert(dmg('ibi') > dmg('baton') * 1.3 && dmg('baton') > 0, `near ${dmg('ibi')} far ${dmg('baton')}`);
  const c = new Battle(['rock', 'baton']).balls[0];
  CONFIG.battle.contactDamage = 5;
});
test('진형권: 기본 체력이 가장 많음', () => {
  for (const id in CONFIG.chars) if (id !== 'gym') assert(CONFIG.chars.gym.hp > CONFIG.chars[id].hp, id);
});
test('진형권 벌크업/단백질: 본인과 타인 효과', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['gym', 'ibi']);
  const [g, t] = bt.balls, D = CONFIG.chars.gym.dumbbell, P = CONFIG.chars.gym.protein;
  bt.balls.forEach(x => { x.speed = 0; x.vx = x.vy = 0; });
  g.x = 200; g.y = 600; t.x = 800; t.y = 1500;
  const hp0 = g.maxHp, dm0 = g.dmgMult, r0 = g.r;
  bt.add(new Ents.Pickup(bt, g, { x: g.x, y: g.y }, 'dumbbell'));
  run(bt, 0.5);
  assert.strictEqual(g.maxHp, hp0 + D.hp); assert(Math.abs(g.dmgMult - dm0 * D.atk) < 1e-9); assert(g.r > r0);
  bt.add(new Ents.Pickup(bt, g, { x: t.x, y: t.y }, 'dumbbell'));
  run(bt, 0.5);
  assert(t.status.slow > 0 && t.status.slowMul === D.slowMul, 'enemy not slowed');
  g.hp -= 50; t.hp -= 50;
  bt.add(new Ents.Pickup(bt, g, { x: g.x, y: g.y }, 'protein'));
  bt.add(new Ents.Pickup(bt, g, { x: t.x, y: t.y }, 'protein'));
  run(bt, 0.5);
  assert(g.status.haste > 0, 'no haste');
  const heals = bt.log.filter(e => e.type === 'heal');
  assert(heals.some(e => e.who === 'gym' && e.amt === P.heal) && heals.some(e => e.who === 'ibi' && e.amt === P.otherHeal), JSON.stringify(heals));
  CONFIG.battle.contactDamage = 5;
});
test('진형권: 페이즈 2에서 뱀 피해 절반, 초대받지 못한 손님에게 2배 (개인전 포함)', () => {
  const bt = new Battle(['ch', 'gym']);
  const [c, g] = bt.balls;
  g.speed = 0; g.vx = g.vy = 0; g.x = 540; g.y = 1000;
  toPhase2(bt, g);
  bt.add(new Ents.Snake(bt, c, CONFIG.chars.ch.snake, { x: g.x, y: g.y })).update(0.001);
  assert.strictEqual(bt.log.find(e => e.type === 'snakeHit').amt, CONFIG.chars.ch.snake.damage * CONFIG.chars.gym.snakeTaken);
  const ffa = new Battle(['gym', 'baton', 'ibi']);
  assert.strictEqual(ffa.damage(ffa.balls[1], 10, ffa.balls[0]), 10 * CONFIG.chars.gym.antiUninvited);
  assert.strictEqual(ffa.damage(ffa.balls[2], 10, ffa.balls[0]), 10);
  const tm = new Battle(team([['gym', 0], ['baton', 1], ['ibi', 1]]), 'team');   // 시너지 없는 바통
  assert.strictEqual(tm.damage(tm.balls[1], 10, tm.balls[0]), 10);
  const tm2 = new Battle(team([['gym', 0], ['ibi', 0], ['baton', 1]]), 'team');  // 혼자인 바통
  assert.strictEqual(tm2.damage(tm2.balls[2], 10, tm2.balls[0]), 10 * CONFIG.chars.gym.antiUninvited);
});

// ---------- 리플리 / 싸방 / 넉백 ----------
test('들린다고: 맞아도 넉백 없음', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['rock', 'ibi']);
  const [r, a] = bt.balls;
  bt.balls.forEach(x => { x.speed = 0; x.vx = x.vy = 0; x.hp = x.maxHp = 1e6; });
  r.x = 540; r.y = 1000; a.x = 760; a.y = 1000;
  r.skills[0].cd = 0.001;
  for (let i = 0; i < 40; i++) bt.update(DT);
  assert.strictEqual(count(bt, 'bassHit'), 1);
  assert(Math.hypot(a.vx, a.vy) < 1 && Math.abs(a.x - 760) < 1, 'knocked back ' + a.vx);
  CONFIG.battle.contactDamage = 5;
});
test('???(리플리): 주기적으로 다른 캐릭터로 변신해 그 스킬을 사용', () => {
  CONFIG.battle.contactDamage = 0;
  const R = CONFIG.chars.ripley;
  const bt = new Battle(['ripley', 'baton']);
  const [rp, bat] = bt.balls;
  bt.balls.forEach(x => { x.hp = x.maxHp = 1e6; });
  assert.strictEqual(rp.name, '???');
  run(bt, R.firstChange + 0.2);
  const first = bt.log.filter(e => e.type === 'ripley');
  assert.strictEqual(first.length, 1, 'no first transform');
  const as = first[0].as;
  assert(as !== 'ripley' && rp.def.imgId === as && rp.def.id === 'ripley');
  assert.strictEqual(rp.skills[0].def, CHARACTERS[as].skills[0], 'skills not copied');
  assert.strictEqual(rp.maxHp, 1e6); assert.strictEqual(rp.speed, R.speed, 'own stats kept');
  run(bt, R.interval * 3 + 3);   // 히트스톱 여유
  const all = bt.log.filter(e => e.type === 'ripley').map(e => e.as);
  assert(all.length >= 4, 'transforms ' + all.length);
  for (let i = 1; i < all.length; i++) assert.notStrictEqual(all[i], all[i - 1], 'same form twice in a row');
  assert(bt.log.some(e => e.type === 'skill' && e.who === 'ripley' && e.skill !== 'ripley'), 'never used a copied skill');
  CONFIG.battle.contactDamage = 5;
});
test('???(리플리) 중증: 페이즈 2면 변신한 캐릭터의 2페이즈 상태, 전용 오브젝트 정리', () => {
  CONFIG.battle.contactDamage = 0;
  const bt = new Battle(['ripley', 'baton']);
  const [rp] = bt.balls;
  bt.balls.forEach(x => { x.hp = x.maxHp = 1e6; });
  toPhase2(bt, rp); rp.hp = rp.maxHp = 1e6;
  Ents.Ripley.transform(bt, rp, 'rock');
  assert.strictEqual(rp.def.portrait(rp), 'p2', 'not phase-2 look');
  assert(bt.ents.some(e => e instanceof Ents.StinkZone), 'phase-2 passive of copied char missing');
  Ents.Ripley.transform(bt, rp, 'samsik');
  run(bt, 0.1);
  assert(!bt.ents.some(e => e instanceof Ents.StinkZone && !e.dead), 'old StinkZone left behind');
  assert.strictEqual(count(bt, 'dye'), 1, 'samsik phase-2 first dye');
  // 여러 판 돌려도 에러 없음
  const ids = Object.keys(CHARACTERS).filter(i => i !== 'ripley');
  CONFIG.battle.contactDamage = 5;
  for (let n = 0; n < 16; n++) { const b2 = new Battle(['ripley', ids[n % ids.length], 'ripley']); runToEnd(b2); assert(b2.over); }
});
test('싸방: 문남휘+진형권+한규성+유재운 한 팀이면 체력·속도 +20% (팀원 전원)', () => {
  const S = CONFIG.synergy.ssabang;
  const bt = new Battle(team([['dev', 0], ['gym', 0], ['ibi', 0], ['rock', 0], ['baton', 0], ['ch', 1]]), 'team');
  assert(bt.hasSynergy('ssabang', 0) && !bt.hasSynergy('ssabang', 1));
  bt.balls.filter(b => b.team === 0).forEach(b => {
    assert(Math.abs(b.maxHp - CONFIG.chars[b.def.id].hp * S.hp) < 1e-9, b.def.id + ' hp');
    assert(Math.abs(b.speed - CONFIG.chars[b.def.id].speed * S.speed) < 1e-9, b.def.id + ' speed');
  });
  const bt2 = new Battle(team([['dev', 0], ['gym', 0], ['ibi', 0], ['ch', 1]]), 'team');
  assert(!bt2.hasSynergy('ssabang', 0));
});
test('시너지/패시브 목록: 모든 시너지 멤버가 실제 캐릭터, 설명 문자열 생성', () => {
  SYNERGIES.forEach(q => {
    (q.solo || q.members()).forEach(n => assert(Object.values(CHARACTERS).some(c => c.name === n), q.key + ' ' + n));   // 시너지는 이름 기준
    assert(typeof q.desc() === 'string' && q.desc().length > 5);
  });
  Object.keys(CHARACTERS).forEach(id => (CHARACTERS[id].passives || []).forEach(p => {
    const d = typeof p.desc === 'function' ? p.desc() : p.desc;
    assert(typeof d === 'string' && d.length > 3, id);
  }));
});

test('???도 팀에 혼자면 초대받지 못한 손님', () => {
  const U = CONFIG.synergy.uninvited;
  const bt = new Battle(team([['ripley', 0], ['ibi', 1], ['ch', 1]]), 'team');
  assert(bt.hasSynergy('uninvited', 0));
  assert.strictEqual(bt.balls[0].maxHp, CONFIG.chars.ripley.hp * U.hp);
  assert(bt.isUninvited(bt.balls[0]), 'gym passive target');
  const bt2 = new Battle(team([['ripley', 0], ['baton', 0], ['ch', 1]]), 'team');
  assert(!bt2.hasSynergy('uninvited', 0));
  // 유재후로 변신해도 끼야아아악 확정 2연타 규칙 적용
  bt.balls.forEach(x => { x.hp = x.maxHp = 1e6; });
  Ents.Ripley.transform(bt, bt.balls[0], 'baton');
  bt.balls[0].action = bt.balls[0].skills[1].def.start(bt, bt.balls[0]);
  for (let i = 0; i < 120 && bt.balls[0].action; i++) bt.update(DT);
  assert.strictEqual(count(bt, 'screamHit'), 4, 'two blasts x two enemies');
});
test('전투 기록: 준 피해 / 받은 피해 / 회복량 집계 (오버킬 제외, 도트는 건 사람 몫)', () => {
  const bt = new Battle(['samsik', 'baton', 'gym']);
  const [s, b, g] = bt.balls;
  bt.damage(b, 30, s);
  assert.strictEqual(s.stats.dealt, 30); assert.strictEqual(b.stats.taken, 30);
  b.hp = 10; bt.damage(b, 50, s);
  assert.strictEqual(s.stats.dealt, 40, 'overkill counted'); assert.strictEqual(b.stats.taken, 40);
  g.hp -= 20; bt.heal(g, 15);
  assert.strictEqual(g.stats.healed, 15);
  s.data.dye = 'red';
  bt.time += 5; bt.contact(s, g, 0, 0);
  const before = s.stats.dealt;
  for (let i = 0; i < 70; i++) bt.updateBall(g, DT);
  assert(s.stats.dealt - before >= CONFIG.chars.samsik.dye.red.burnDps - 0.01, 'burn not credited');
  // 전투 한 판: 받은 피해 합 >= 준 피해 합 (주인 없는 피해가 있을 수 있으므로)
  const bt2 = new Battle(['ibi', 'rock', 'dev', 'ch']); runToEnd(bt2);
  const dealt = bt2.balls.reduce((a, x) => a + x.stats.dealt, 0), taken = bt2.balls.reduce((a, x) => a + x.stats.taken, 0);
  assert(dealt > 0 && taken >= dealt - 1e-6, `dealt ${dealt} taken ${taken}`);
});
test('전투 시간 180초', () => { assert.strictEqual(CONFIG.battle.maxTime, 180); });

// ---------- 이윤빈 ----------
test('이윤빈 전담: 못 찾으면 스탯 증가, 찾으면 초기화', () => {
  CONFIG.battle.contactDamage = 0;
  const V = CONFIG.chars.chino.vape;
  const bt = new Battle(['chino', 'baton']);
  const [c, b] = bt.balls;
  c.speed = 0; c.vx = c.vy = 0; b.hp = b.maxHp = 1e6;
  c.x = 150; c.y = 500;
  const hp0 = c.maxHp, sp0 = c.speed, dm0 = c.dmgMult;
  run(bt, V.growEvery * 3 + 0.5);
  assert(c.data.vapeF > 1.15, 'did not grow: ' + c.data.vapeF);
  assert(bt.ents.some(e => e instanceof Ents.Vape && !e.dead), 'no vape on map');
  assert(Math.abs(c.maxHp - hp0 * c.data.vapeF) < 1e-6);
  const v = bt.ents.find(e => e instanceof Ents.Vape && !e.dead);
  v.x = c.x; v.y = c.y; v.t = 1;
  bt.update(DT);
  assert.strictEqual(count(bt, 'vapeFound'), 1);
  assert(Math.abs(c.maxHp - hp0) < 1e-6 && Math.abs(c.dmgMult - dm0) < 1e-9, 'stats not reset');
  // 다른 사람은 못 주움
  const v2 = bt.add(new Ents.Vape(bt, c, { x: b.x, y: b.y })); v2.t = 1; b.speed = 0; b.vx = b.vy = 0;
  v2.update(DT);
  assert(!v2.dead, 'someone else picked up the vape');
  CONFIG.battle.contactDamage = 5;
});
test('이윤빈 기억력 감퇴: 페이즈 2에서 쿨마다 피해 무효화, 전담 초기화도 따로 무시', () => {
  const F = CONFIG.chars.chino.forget;
  const bt = new Battle(['chino', 'baton']);
  const [c, b] = bt.balls;
  assert.strictEqual(bt.damage(c, 10, b) > 0, true, 'phase 1 should not absorb');
  toPhase2(bt, c); c.hp = c.maxHp = 1e6;
  assert.strictEqual(bt.damage(c, 30, b), 0, 'first hit absorbed');
  assert(bt.damage(c, 30, b) > 0, 'second hit within cooldown should land');
  bt.time += F.hitCd + 0.1;
  assert.strictEqual(bt.damage(c, 30, b), 0, 'absorbed again after cooldown');
  // 전담: 찾아도 초기화 안 됨 (따로 쿨)
  c.data.vapeF = 1.5; const mh = c.maxHp;
  bt.add(new Ents.Vape(bt, c, { x: c.x, y: c.y })).t = 1; c.speed = 0; c.vx = c.vy = 0;
  bt.ents[bt.ents.length - 1].update(DT);
  assert.strictEqual(count(bt, 'forgetVape'), 1); assert.strictEqual(c.maxHp, mh, 'reset despite forgetting');
  bt.add(new Ents.Vape(bt, c, { x: c.x, y: c.y })).t = 1;
  bt.ents[bt.ents.length - 1].update(DT);
  assert.strictEqual(count(bt, 'vapeFound'), 1, 'second find within vape cooldown should reset');
  assert(Math.abs(c.data.vapeF - 1) < 1e-9);
});

// ---------- 이격 / 이름 기준 시너지 ----------
test('시너지는 이름 기준: 이격도 같은 사람으로 침', () => {
  const izk = new Battle(team([['ibi', 0], ['sy', 0], ['ch', 0], ['hxpwm', 0], ['baton', 1]]), 'team');
  assert(izk.hasSynergy('izk', 0), '김선율(김선율의 모습)도 IZK');
  const ss = new Battle(team([['chief', 0], ['gym', 0], ['ibi', 0], ['rock', 0], ['baton', 1]]), 'team');
  assert(ss.hasSynergy('ssabang', 0), '문남휘(이장님)도 싸방');
  const un = new Battle(team([['nogwang', 0], ['ibi', 1], ['ch', 1]]), 'team');
  assert(un.hasSynergy('uninvited', 0), '유재후(노광석)도 초대받지 못한 손님');
  assert(un.isUninvited(un.balls[0]));
  const ffa = new Battle(['gym', 'nogwang']);
  assert(ffa.isUninvited(ffa.balls[1]), '개인전 진형권 패시브 대상');
});

// ---------- 서리 ----------
test('서리: 침 웅덩이는 느리게 + 지속 피해, 유재후에겐 피해 절반', () => {
  const bt = new Battle(['seori', 'ibi']);
  const [s, e] = bt.balls;
  s.speed = 0; s.vx = s.vy = 0; e.speed = 0; e.vx = e.vy = 0;
  s.x = 200; s.y = 600; e.x = 700; e.y = 1000;
  const d = bt.ents.find(x => x instanceof Ents.Drool);
  assert(d, 'no drool ent');
  d.add(e.x, e.y, 60, 3);
  const hp = e.hp;
  run(bt, 1.1);
  assert(e.hp < hp, 'no drool damage'); assert(e.status.slow > 0 && e.status.slowMul < 1, 'no slow');
  const b2 = new Battle(['seori', 'baton', 'nogwang', 'ibi']);
  const [s2, bt0, ng, ib] = b2.balls;
  assert.strictEqual(b2.damage(bt0, 10, s2), 10 * CONFIG.chars.seori.batonDeal);
  assert.strictEqual(b2.damage(ng, 10, s2), 10 * CONFIG.chars.seori.batonDeal, '노광석 유재후도 절반');
  assert.strictEqual(b2.damage(ib, 10, s2), 10);
});
test('서리 물기: 돌격해서 물고 늘어짐 (연속 피해 + 큰 침)', () => {
  const bt = new Battle(['seori', 'gym']);
  const [s, g] = bt.balls;
  g.hp = g.maxHp = 1e6; g.speed = 0; g.vx = g.vy = 0;
  s.x = g.x - 300; s.y = g.y;
  s.action = s.skills[1].def.start(bt, s);
  for (let i = 0; i < 180 && s.action; i++) bt.update(DT);
  assert.strictEqual(count(bt, 'bite'), 1, 'did not bite');
  assert(bt.log.some(e => e.type === 'damage' && e.who === 'seori' && e.src === 'gym' && e.kind === 'contact'), '물 때 서리도 박치기 피해를 받아야 함');
  assert(count(bt, 'bigDrool') >= 3, 'big drool ' + count(bt, 'bigDrool'));
});

// ---------- 차승민 ----------
test('차승민: 닿으면 한 번 더 (1.5배), 강펀치는 받은 피해만큼 강해짐', () => {
  const bt = new Battle(['seyu', 'gym']);
  const [s, g] = bt.balls;
  g.hp = g.maxHp = 1e6;
  bt.time = 5; bt.contact(s, g, 0, 0);
  run(bt, 0.5);
  const hits = bt.log.filter(e => e.type === 'damage' && e.who === 'gym' && e.src === 'seyu');
  assert(hits.some(h => h.kind === 'set' && Math.abs(h.amt - CONFIG.chars.seyu.contactDamage * 1.5) < 1e-9), 'no 1.5x second hit');
  const P = CONFIG.chars.seyu.punch;
  s.data.takenSince = 0; s.hp = s.maxHp = 1e6;
  bt.damage(s, 30, g);
  assert(s.data.takenSince >= 30, 'taken not tracked');
  s.x = 300; s.y = 900; g.x = 550; g.y = 900; g.speed = 0; g.vx = g.vy = 0;
  const before = g.hp;
  s.action = s.skills[1].def.start(bt, s);
  run(bt, 0.6);
  const dealt = before - g.hp;
  assert(dealt >= P.base + 25 * P.perTaken, 'punch too weak: ' + dealt);
  assert.strictEqual(s.data.takenSince, 0, 'not reset after punch');
});

// ---------- 최휘 ----------
test('최휘 계좌: 알바비 / 많으면 약해짐 / MAX면 사고로 절반 / 파산 박치기', () => {
  const A = CONFIG.chars.hau.account;
  const bt = new Battle(['hau', 'gym']);
  const [h, g] = bt.balls;
  g.hp = g.maxHp = 1e6; h.hp = h.maxHp = 1e6;
  h.skills[0].cd = 1e9;
  const b0 = h.data.bal;
  h.data.payT = A.pay - 0.01; bt.updateBall(h, DT);
  assert.strictEqual(h.data.bal, b0 + A.payAmt, 'pay');
  h.data.bal = A.max; assert(Math.abs(bt.damage(g, 10, h) - 10 * A.richMul) < 1e-9, 'rich should deal less');
  h.data.bal = 0; assert(Math.abs(bt.damage(g, 10, h) - 10 * A.poorMul) < 1e-9, 'poor should deal more');
  // max → 사고
  h.data.bal = A.max - 1; h.data.crashT = -1;
  h.data.payT = A.pay - 0.01; bt.updateBall(h, DT);
  assert(h.data.crashT > 0, 'crash timer not started');
  for (let i = 0; i < (A.crashDelay + 0.2) * 60; i++) bt.updateBall(h, DT);
  assert(Math.abs(h.data.bal - A.max / 2) < A.payAmt + 1e-9, 'not halved: ' + h.data.bal);
  // 파산 → 부딪히면 큰 피해 + 본인 피해 + 절반 복구
  h.data.bal = 10; h.data.broke = false;
  h.data.bal = 0; h.data.broke = true;
  const hs = h.hp, gs = g.hp;
  bt.time += 5; bt.contact(h, g, 0, 0);
  assert.strictEqual(count(bt, 'hauBankrupt'), 1);
  assert(gs - g.hp >= A.bankrupt, 'bankrupt damage');
  assert(hs - h.hp >= A.selfDamage, 'self damage');
  assert.strictEqual(h.data.bal, A.max / 2);
});
test('최휘 주식: 떨어지면 범위 공격, 급락 구간은 2배로 떨어짐', () => {
  const bt = new Battle(['hau', 'gym']);
  const [h, g] = bt.balls;
  g.hp = g.maxHp = 1e6; g.x = h.x + 150; g.y = h.y;
  h.data.bal = 60;
  const r = Math.random; ctx.Math.random = () => 0.99;   // 하락
  h.skills[0].def.start(bt, h);
  assert.strictEqual(h.data.bal, 60 - CONFIG.chars.hau.stock.step);
  assert.strictEqual(count(bt, 'stockHit'), 1);
  h.skills[1].def.start(bt, h);
  assert.strictEqual(h.data.bal, 60 - CONFIG.chars.hau.stock.step * 3);
  ctx.Math.random = r;
});

// ---------- 유재후 (노광석) ----------
test('노광석 핫식스: 같은 팀은 공격력·이속 증가, 적은 공격력 감소 / 포코는 IZK에게 1.5배', () => {
  const H = CONFIG.chars.nogwang.hot6, P = CONFIG.chars.nogwang.poco;
  const bt = new Battle(['nogwang', 'baton']);
  const [n, b] = bt.balls;
  const sp = n.speed;
  bt.add(new Ents.Hot6(bt, n, { x: n.x, y: n.y })).t = 1; bt.ents[bt.ents.length - 1].update(DT);
  assert(Math.abs(n.dmgMult - H.allyAtk) < 1e-9 && Math.abs(n.speed - sp * H.allySpeed) < 1e-9, 'self buff');
  bt.add(new Ents.Hot6(bt, n, { x: b.x, y: b.y })).t = 1; bt.ents[bt.ents.length - 1].update(DT);
  assert(Math.abs(b.dmgMult - H.enemyAtk) < 1e-9, 'enemy debuff');
  const b2 = new Battle(['nogwang', 'ch', 'baton']);
  const [n2, c2, x2] = b2.balls;
  [c2, x2].forEach(o => { o.hp = o.maxHp = 1e6; o.speed = 0; o.vx = o.vy = 0; o.y = n2.y; });
  c2.x = n2.x + 200; x2.x = n2.x + 260; x2.y = n2.y + 10;
  n2.vx = 100; n2.vy = 0;
  const w = b2.add(new Ents.GuitarWave(b2, n2, 0, P));
  for (let i = 0; i < 60 && !w.dead; i++) w.update(DT);
  const hz = b2.log.filter(e => e.type === 'damage' && e.src === 'nogwang');
  assert(hz.some(e => e.who === 'ch' && Math.abs(e.amt - P.damage * P.izkMul) < 1e-9), 'izk 1.5x');
  assert(hz.some(e => e.who === 'baton' && Math.abs(e.amt - P.damage) < 1e-9), 'normal damage');
});

// ---------- 김선율 (김선율의 모습) ----------
test('김선율: 체력 절반에선 페이즈 2 안 됨, 0이 되면 구석에서 부활해 드립 난사, 두 번째엔 탈락', () => {
  const Y = CONFIG.chars.sy.yeopo;
  const bt = new Battle(['sy', 'gym']);
  const [s, g] = bt.balls;
  g.hp = g.maxHp = 1e6; g.speed = 0; g.vx = g.vy = 0;
  bt.damage(s, s.maxHp * 0.6, g);
  assert.strictEqual(s.phase, 1, 'phase 2 at half hp');
  bt.damage(s, 9999, g);
  assert(s.alive && s.invuln, 'should survive first lethal');
  assert.strictEqual(bt.damage(s, 50, g), 0, 'invulnerable during cutscene');
  run(bt, Y.cutscene + 1.5);
  assert.strictEqual(s.phase, 2); assert(!s.invuln);
  const A = CONFIG.arena;
  assert(Math.min(s.x - A.x, A.x + A.w - s.x) < s.r + 30 && Math.min(s.y - A.y, A.y + A.h - s.y) < s.r + 30, 'not in a corner');
  const cx = s.x, cy = s.y;
  run(bt, 2);
  assert(count(bt, 'joke') >= 4, 'jokes ' + count(bt, 'joke'));
  assert(Math.hypot(s.x - cx, s.y - cy) < 5, 'moved from corner');
  bt.damage(s, 9999, g);
  assert(!s.alive, 'second lethal should kill');
});
test('김선율 드립: 이름이 나온 상대는 1.5배', () => {
  const Y = CONFIG.chars.sy.yeopo;
  const bt = new Battle(['sy', 'ibi', 'gym']);
  const [s, i, g] = bt.balls;
  s.phase = 2;   // 드립은 페이즈 2 기술
  [i, g].forEach(o => { o.hp = o.maxHp = 1e6; o.x = 500; o.y = 900; });
  const j = bt.add(new Ents.Joke(bt, s, 0, Y)); j.x = 500; j.y = 900; j.text = '한규성 말고 두규성~';
  j.boom();
  const d = bt.log.filter(e => e.type === 'damage');
  assert(d.some(e => e.who === 'ibi' && Math.abs(e.amt - Y.damage * Y.relatedMul) < 1e-9), 'related 1.5x');
  assert(d.some(e => e.who === 'gym' && Math.abs(e.amt - Y.damage) < 1e-9), 'unrelated 1x');
});

// ---------- 문남휘 (이장님) ----------
test('이장님: 개인전 받는 피해 3배, 한규성에게 맞으면 즉사, 팀 지속 회복 / 대청소 지속 피해', () => {
  const C = CONFIG.chars.chief;
  const f = new Battle(['chief', 'gym']);
  assert.strictEqual(f.damage(f.balls[0], 5, f.balls[1]), 5 * C.ffaTaken * 1);
  const t = new Battle(team([['chief', 0], ['gym', 0], ['ibi', 1]]), 'team');
  const [c, g, ib] = t.balls;
  assert.strictEqual(t.damage(c, 5, null), 5, 'team mode normal damage');
  g.hp = g.maxHp - 20;
  for (let k = 0; k < 120; k++) t.updateBall(c, DT);
  assert(g.hp > g.maxHp - 20, 'ally not healed');
  ib.hp = ib.maxHp = 1e6;
  toPhase2(t, c); c.hp = c.maxHp;
  const before = ib.hp;
  for (let k = 0; k < 120; k++) t.updateBall(c, DT);
  assert(ib.hp < before, 'no clean dot');
  t.damage(c, 1, ib);
  assert(c.alive && count(t, 'ddakbam') === 0, '팀전에선 즉사 없음');
  const f2 = new Battle(['chief', 'ibi']);
  f2.damage(f2.balls[0], 1, f2.balls[1]);
  assert(!f2.balls[0].alive && count(f2, 'ddakbam') === 1, '개인전 한규성 공격은 즉사');
});
test('배속 설정 0.5 / 1 / 1.5 / 2 / 3', () => { assert.strictEqual(CONFIG.speeds.join(), '0.5,1,1.5,2,3'); });
test('새 캐릭터 전원 1:1 · 팀전 끝까지 진행', () => {
  const NEW = ['seori', 'seyu', 'hau', 'nogwang', 'sy', 'chief'], ids = Object.keys(CHARACTERS);
  NEW.forEach((n, k) => { const bt = new Battle([n, ids[(k * 3) % ids.length]]); runToEnd(bt); assert(bt.over, n); });
  const tm = new Battle(NEW.map((id, i) => ({ id, team: i % 2 })), 'team'); runToEnd(tm); assert(tm.over);
});

test('삼식이: 페이즈 2 이동속도 소폭 증가, 번개(노랑)면 추가 증가', () => {
  const C = CONFIG.chars.samsik, bt = new Battle(['samsik', 'gym']), s = bt.balls[0];
  assert.strictEqual(s.def.speedMul(bt, s), 1);
  s.phase = 2; s.data.dyes = ['red'];
  assert(Math.abs(s.def.speedMul(bt, s) - C.phase2Speed) < 1e-9);
  s.data.dyes = ['yellow'];
  assert(Math.abs(s.def.speedMul(bt, s) - C.phase2Speed * C.dye.yellow.speedMul) < 1e-9);
});
test('김선율 페이즈 1: 모든 피해 1, 낯가림은 적 바로 앞에서 등장', () => {
  const bt = new Battle(['sy', 'gym']);
  const [s, g] = bt.balls;
  g.hp = g.maxHp = 1e6;
  s.dmgMult = 3;
  assert(Math.abs(bt.damage(g, 25, s) - 1) < 1e-9, 'phase 1 damage not 1');
  bt.time = 5; const h = g.hp; bt.contact(s, g, 0, 0);
  assert(Math.abs(h - g.hp - 1) < 1e-9, 'contact damage not 1');
  g.speed = 0; g.vx = 300; g.vy = 0; g.x = 500; g.y = 1000;
  s.x = 900; s.y = 500;
  s.action = s.skills[0].def.start(bt, s);
  for (let i = 0; i < 120 && s.action; i++) { g.vx = 300; g.vy = 0; bt.updateBall(s, DT); }
  assert(Math.hypot(s.x - g.x, s.y - g.y) < g.r + s.r + 20, 'not next to enemy');
  assert(s.x > g.x, 'not in front of the enemy');
  s.phase = 2;
  assert.strictEqual(bt.damage(g, 25, s), 75, 'phase 2 should deal full damage');
});
test('IZK 이동속도 +10%, 팀전 테두리는 팀 색, 개인전 같은 캐릭터는 번호·색으로 구분', () => {
  const z = CONFIG.synergy.izk;
  const bt = new Battle(team([['ibi', 0], ['samsik', 0], ['ch', 0], ['hxpwm', 0], ['baton', 1]]), 'team');
  const ibi = bt.balls[0];
  assert(Math.abs(ibi.speed - CONFIG.chars.ibi.speed * z.speed) < 1e-9, 'izk speed');
  assert.strictEqual(bt.rimColor(ibi), Battle.TEAMS[0].color);
  assert.strictEqual(bt.rimColor(bt.balls[4]), Battle.TEAMS[1].color);
  const f = new Battle(['baton', 'baton', 'ibi']);
  assert.strictEqual(f.balls[0].dupNo, 1); assert.strictEqual(f.balls[1].dupNo, 2); assert(!f.balls[2].dupNo);
  assert.notStrictEqual(f.rimColor(f.balls[0]), f.rimColor(f.balls[1]));
});
test('김선율: 여성에게 주는 피해 절반 (이윤빈 제외)', () => {
  const bt = new Battle(['sy', 'ibi', 'chino']);
  const [s, i, c] = bt.balls;
  s.phase = 2; i.hp = i.maxHp = c.hp = c.maxHp = 1e6;
  i.data.gyusuni = true;   // 규순이 = 여성
  assert.strictEqual(bt.damage(i, 20, s), 20 * CONFIG.chars.sy.femaleDeal);
  assert.strictEqual(bt.damage(c, 20, s), 20, '이윤빈은 예외');
});
test('포식자: 박치기 8.8 고정, 스킬은 여성 보너스 없음, 벽·상대에 비타민, 포식 흡혈', () => {
  const P = CONFIG.chars.predator;
  const bt = new Battle(['predator', 'gym', 'chino']);
  const [p, g, c] = bt.balls;
  [g, c].forEach(o => { o.hp = o.maxHp = 1e6; });
  p.dmgMult = 2.5;
  bt.time = 5; let h = g.hp; bt.contact(p, g, 0, 0);
  assert(Math.abs(h - g.hp - P.baseHit) < 1e-9, 'contact not fixed 8.8: ' + (h - g.hp));
  assert.strictEqual(count(bt, 'vitaminPlant', e => e.n === 1), 1);
  p.dmgMult = 1;
  assert(Math.abs(bt.damage(c, 10, p, { kind: 'vitamin' }) - 10) < 1e-9, 'no female bonus anymore');
  bt.time = 10; bt.contact(p, c, 0, 0);
  assert.strictEqual(count(bt, 'vitaminPlant', e => e.n === 3), 1, 'female contact plants 3');
  // 벽
  const A = CONFIG.arena; p.x = A.x + p.r; p.data.wallCd = 0; p.def.update(bt, p, DT);
  assert.strictEqual(count(bt, 'vitaminPlant'), 3, 'wall plant');
  // 껍질이 터지면 탄막
  for (let i = 0; i < 600 && !count(bt, 'vitaminBoom'); i++) bt.update(DT);   // 히트스톱 동안은 시간이 멈추므로 프레임 여유
  assert(count(bt, 'vitaminBoom') >= 1, 'no boom');
  // 포식: 절반 흡혈 / 여성은 전부
  const b2 = new Battle(['predator', 'gym', 'chino']);
  const [p2, g2, c2] = b2.balls;
  [g2, c2].forEach(o => { o.hp = o.maxHp = 1e6; });
  p2.phase = 2; p2.maxHp = 1e6; p2.hp = 1000;
  p2.data.armed = true; b2.time = 5; b2.contact(p2, g2, 0, 0);
  let f = b2.log.find(e => e.type === 'feast');
  assert(f && Math.abs(f.healed - f.dealt * P.feast.lifesteal) < 1e-9, 'half lifesteal');
  assert(!p2.data.armed, 'not disarmed');
  p2.data.armed = true; b2.time = 10; b2.contact(p2, c2, 0, 0);
  f = b2.log.filter(e => e.type === 'feast')[1];
  assert(f.female && f.dealt === 0 && Math.abs(f.healed - P.feast.damage) < 1e-9, 'female: heal only, no damage');
  assert(!b2.log.some(e => e.type === 'damage' && e.kind === 'feast' && e.who === 'chino'), 'female took feast damage');
  // 부딪혀 심은 껍질은 상대에게 붙어서 같이 움직이고, 방울은 그 상대를 비켜감
  const b3 = new Battle(['predator', 'gym']);
  const [p3, g3] = b3.balls;
  g3.hp = g3.maxHp = 1e6; g3.speed = 0; g3.vx = g3.vy = 0;
  b3.time = 5; b3.contact(p3, g3, (p3.x + g3.x) / 2, (p3.y + g3.y) / 2);
  const sh = b3.ents.find(e => e instanceof Ents.VitaminShell);
  assert(sh && sh.host === g3, 'shell not stuck to enemy');
  g3.x += 200; sh.update(DT);
  assert(Math.hypot(sh.x - g3.x, sh.y - g3.y) <= g3.r + 1, 'shell did not move with enemy');
  const hp3 = g3.hp; sh.t = P.vitamin.fuse; sh.update(DT);
  assert(Math.abs(hp3 - g3.hp - P.vitamin.stickDamage) < 1e-9, 'stuck splash damage');
  for (let k = 0; k < 30; k++) b3.ents.filter(e => e instanceof Ents.VitaminBullet).forEach(e => e.update(DT));
  assert(Math.abs(hp3 - g3.hp - P.vitamin.stickDamage) < 1e-9, 'bullets hit the host');
  // 여성에게 다가가면 +30%
  const b4 = new Battle(['predator', 'chino']);
  const [p4, c4] = b4.balls;
  p4.x = 300; p4.y = 900; c4.x = 800; c4.y = 900; p4.vx = 400; p4.vy = 0;
  assert(Math.abs(p4.def.speedMul(b4, p4) - P.femaleChase) < 1e-9, 'female chase');
  p4.vx = -400;
  assert.strictEqual(p4.def.speedMul(b4, p4), 1);
});
test('새 시너지: 화정듀오 / 정발산(IZK 수치 꺼짐, 피해 보너스 감소) / 서울방송고 / 개와 주인', () => {
  const S = CONFIG.synergy, near = (a, b) => Math.abs(a - b) < 1e-6;
  // 화정듀오: 한규성은 포식자만
  const h1 = new Battle(team([['baton', 0], ['predator', 0], ['gym', 1]]), 'team');
  assert(h1.hasSynergy('hwajeong', 0));
  assert(near(h1.balls[0].maxHp, CONFIG.chars.baton.hp * S.hwajeong.hp) && near(h1.balls[1].dmgMult, S.hwajeong.damage));
  assert(!new Battle(team([['baton', 0], ['ibi', 0], ['gym', 1]]), 'team').hasSynergy('hwajeong', 0), '이비 한규성은 화정듀오 아님');
  // 정발산
  const j = new Battle(team([['ibi', 0], ['samsik', 0], ['ch', 0], ['hxpwm', 0], ['baton', 0], ['gym', 1]]), 'team');
  assert(j.hasSynergy('jeongbalsan', 0) && j.hasSynergy('izk', 0), 'izk still listed for 긴급소집');
  const ib = j.balls[0], g = j.balls[5]; g.hp = g.maxHp = 1e6;
  assert(near(ib.speed, CONFIG.chars.ibi.speed * S.jeongbalsan.speed), 'speed: no izk speed, only 정발산');
  assert(near(ib.dmgMult, 1), 'izk damage should be off');
  assert(near(j.damage(g, 10, ib), 10 * S.jeongbalsan.decayDamage), 'full bonus at start');
  j.time = S.jeongbalsan.decayTime / 2;
  assert(near(j.damage(g, 10, ib), 10 * (1 + (S.jeongbalsan.decayDamage - 1) / 2)), 'half bonus');
  j.time = S.jeongbalsan.decayTime + 5;
  assert(near(j.damage(g, 10, ib), 10), 'bonus gone');
  // 서울방송고
  const sb = new Battle(team([['hau', 0], ['dev', 0], ['rock', 0], ['seyu', 0], ['gym', 1]]), 'team');
  const [hau, dev, rock, , g2] = sb.balls; g2.hp = g2.maxHp = 1e6;
  assert(sb.hasSynergy('seoulbc', 0));
  assert(near(rock.speed, CONFIG.chars.rock.speed * S.seoulbc.speed));
  assert(near(sb.damage(rock, 10, g2), 10), 'no extra damage taken');
  rock.hp = rock.maxHp - 50; assert(near(sb.heal(rock, 10), 10 * S.seoulbc.heal), 'heal +20%');
  assert(near(dev.dmgMult, S.seoulbc.per['문남휘'].damage) && near(hau.dmgMult, S.seoulbc.per['최휘'].damage));
  // 개와 주인
  const d = new Battle(team([['baton', 0], ['seori', 0], ['gym', 1]]), 'team');
  assert(d.hasSynergy('dogowner', 0));
  assert(near(d.balls[1].speed, CONFIG.chars.seori.speed * 1.3) && near(d.balls[1].dmgMult, 1.1) && near(d.balls[0].speed, CONFIG.chars.baton.speed * 0.8));
});
test('hxpwm: 유재후에게 주는 피해 1.5배', () => {
  const bt = new Battle(['hxpwm', 'baton', 'nogwang', 'ibi']);
  const [h, b, n, i] = bt.balls;
  assert.strictEqual(bt.damage(b, 10, h), 15); assert.strictEqual(bt.damage(n, 10, h), 15); assert.strictEqual(bt.damage(i, 10, h), 10);
});
test('강펀치: 준비 후 범위에 들어와야 발동, 가운데가 가장자리보다 셈', () => {
  const C = CONFIG.chars.seyu.punch;
  const bt = new Battle(['seyu', 'gym', 'ibi']);
  const [s, g, i] = bt.balls;
  [g, i].forEach(o => { o.hp = o.maxHp = 1e6; o.speed = 0; o.vx = o.vy = 0; });
  s.hp = s.maxHp = 1e6; s.speed = 0; s.vx = s.vy = 0;
  s.x = 200; s.y = 900; g.x = 900; g.y = 1500; i.x = 900; i.y = 500;
  s.skills[1].def.start(bt, s);
  run(bt, 0.5);
  assert.strictEqual(count(bt, 'punch'), 0, 'fired with nobody in range');
  g.x = 500; g.y = 900;
  run(bt, 0.8);
  assert.strictEqual(count(bt, 'punch'), 1, 'did not fire when in range');
  const hit = bt.log.find(e => e.type === 'punchHit');
  assert(hit && hit.center && Math.abs(hit.amt - C.base * C.centerMul) < 1e-6, 'center hit ' + JSON.stringify(hit));
  // 가장자리
  const b2 = new Battle(['seyu', 'gym']); const [s2, g2] = b2.balls;
  g2.hp = g2.maxHp = 1e6; s2.x = 200; s2.y = 900; g2.x = 600; g2.y = 900 + C.far * 0.45;
  const pu = b2.add(new Ents.Punch(b2, s2, 0, C.base, 1, C));
  for (let k = 0; k < 40; k++) pu.update(DT);
  const e2 = b2.log.find(e => e.type === 'punchHit');
  assert(e2 && !e2.center && e2.amt < C.base, 'edge should be weaker ' + JSON.stringify(e2));
});
test('개와 주인: 서리 침 더 자주 / 서리는 여성', () => {
  const run2 = (bt) => { const s = bt.balls.find(b => b.def.id === 'seori'); s.hp = s.maxHp = 1e6; s.speed = 0; s.vx = s.vy = 0; const d = bt.ents.find(e => e instanceof Ents.Drool); for (let i = 0; i < 120; i++) d.update(DT); return d.pools.length; };
  const a = run2(new Battle(team([['baton', 0], ['seori', 0], ['gym', 1]]), 'team'));
  const b = run2(new Battle(team([['ibi', 0], ['seori', 0], ['gym', 1]]), 'team'));
  assert(a >= b * 1.4, `drool ${a} vs ${b}`);
  const bt = new Battle(['seori', 'ch']);
  assert(bt.balls[0].def.female(bt.balls[0]), '서리는 여성');
});
test('복합 염색: 검정+하양 확률 30%, 사진은 색 조각 전부', () => {
  const bt = new Battle(['samsik', 'gym']); const s = bt.balls[0];
  let bw = 0;
  for (let i = 0; i < 4000; i++) { ctx.samsikMultiDye(bt, s); if (s.data.dyes.join() === 'black,white') bw++; }
  assert(Math.abs(bw / 4000 - CONFIG.chars.samsik.dye.multiBW) < 0.03, 'bw rate ' + bw / 4000);
  s.data.dyes = ['red', 'blue', 'yellow', 'shaved'];
  assert.strictEqual(s.def.portrait(s), 'multi:red,blue,yellow,shaved');
  s.data.dyes = ['red']; s.data.dye = 'red';
  assert.strictEqual(s.def.portrait(s), 'red');
});
test('통계: 1:1 승패 / 팀전 승패 / 토너먼트 우승·준우승, 같은 판은 한 번만', () => {
  const R = ctx.Records; R.reset();
  const d = new Battle(['baton', 'ibi']); d.damage(d.balls[1], 9999, d.balls[0]); d.checkEnd();
  R.battle(d); R.battle(d);
  assert.strictEqual(R.get('baton').duelW, 1); assert.strictEqual(R.get('ibi').duelL, 1);
  const three = new Battle(['baton', 'ibi', 'ch']); three.over = true; three.winner = three.balls[0]; R.battle(three);
  assert.strictEqual(R.get('baton').duelW, 1, '3인 개인전은 1:1이 아님'); assert.strictEqual(R.get('baton').ffaW, 1);
  const t = new Battle(team([['gym', 0], ['dev', 0], ['rock', 1]]), 'team'); t.damage(t.balls[2], 9999, t.balls[0]); t.checkEnd(); R.battle(t);
  assert.strictEqual(R.get('gym').teamW, 1); assert.strictEqual(R.get('dev').teamW, 1); assert.strictEqual(R.get('rock').teamL, 1);
  R.tournament('seyu', 'hau');
  assert.strictEqual(R.get('seyu').champ, 1); assert.strictEqual(R.get('hau').runner, 1);
  R.reset(); assert.strictEqual(R.get('baton').duelW, 0);
});
test('통계: 3인 이상 개인전은 1등만 승', () => {
  const R = ctx.Records; R.reset();
  const b = new Battle(['baton', 'ibi', 'ch']); b.over = true; b.winner = b.balls[1]; R.battle(b);
  assert.strictEqual(R.get('ibi').ffaW, 1); assert.strictEqual(R.get('baton').ffaL, 1); assert.strictEqual(R.get('ch').ffaL, 1);
  assert.strictEqual(R.get('ibi').duelW, 0);
  R.reset();
});
test('밸런스 참고: 3인 개인전 200판', () => {
  const wins = {}, lens = [];
  for (let i = 0; i < 200; i++) {
    const bt = new Battle(['baton', 'ibi', 'samsik']);
    run(bt, 100);
    const w = bt.winner ? bt.winner.def.id : 'draw';
    wins[w] = (wins[w] || 0) + 1; lens.push(bt.time);
  }
  lens.sort((a, b) => a - b);
  console.log('    승리', JSON.stringify(wins), '· 전투 길이 중앙값', lens[100].toFixed(1) + 's');
});

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
