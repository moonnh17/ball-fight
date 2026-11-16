// 씬 관리: 타이틀 → 캐릭터 선택(개인전/팀전) → 전투 → 결과
(function () {
  var W = CONFIG.W, H = CONFIG.H;
  var canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
  }
  window.addEventListener('resize', fit); fit();
  Assets.load();
  if (typeof FxImg !== 'undefined') FxImg.preload();   // 보스전 픽셀 이펙트 시트

  var IDS = Object.keys(CHARACTERS), TEAMS = Battle.TEAMS;
  // 이름이 같은 캐릭터(이격)는 한 그룹: 선택창에선 카드 하나 + 모습 탭
  var GROUPS = [];
  IDS.forEach(function (id) {
    var n = CHARACTERS[id].name, g = GROUPS.filter(function (q) { return q.name === n; })[0];
    if (!g) GROUPS.push(g = { name: n, ids: [] });
    g.ids.push(id);
  });
  function groupOf(id) { return GROUPS.filter(function (q) { return q.ids.indexOf(id) >= 0; })[0]; }
  function shortSub(id) { return CHARACTERS[id].sub.replace(/의 모습$/, ''); }
  function idOfName(n) { var g = GROUPS.filter(function (q) { return q.name === n; })[0]; return g ? g.ids[0] : null; }
  var G = window.Game = {
    scene: 'title', record: false, mode: 'ffa', pick: {}, bossId: 'heroBaton', bossDiff: 'easy', speedIdx: CONFIG.speeds.indexOf(1), roster: [], curTeam: 0, tourSeed: 'manual', mapSel: 'none', swapSel: null, tour: null, focus: IDS[0], battle: null,
    phase: '', pt: 0, time: 0, fps: 60, hits: [], titleBalls: [],
  };
  var roundRect = Battle.roundRect, outlined = FX.outlined;

  // ---------- 입력 ----------
  // G.hitClip: 스크롤 영역 안에서 그릴 때 (dy만큼 밀고, 보이는 부분만 누를 수 있게)
  function hit(x, y, w, h, fn) {
    var c = G.hitClip;
    if (c) {
      y += c.dy;
      var y0 = Math.max(y, c.top), y1 = Math.min(y + h, c.bottom);
      if (y1 <= y0) return;
      y = y0; h = y1 - y0;
    }
    G.hits.push({ x: x, y: y, w: w, h: h, fn: fn });
  }
  function button(x, y, w, h, label, fn, o) {
    o = o || {};
    if (G.record) return;   // 녹화 모드에선 버튼 숨김
    var enabled = o.enabled !== false, col = o.color || '#ff2bd6';
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.35;
    ctx.shadowColor = col; ctx.shadowBlur = enabled ? 25 : 0;
    var g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, col); g.addColorStop(1, o.color2 || '#7a5cff');
    ctx.fillStyle = g; roundRect(ctx, x, y, w, h, Math.min(36, h / 2)); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    outlined(ctx, label, x + w / 2, y + h / 2 + 2, o.size || 50, '#ffffff');
    ctx.restore();
    if (enabled) hit(x, y, w, h, function () { FX.sfx('click'); fn(); });
  }
  function scrolly() { return G.scene === 'dex' || G.scene === 'records' || G.scene === 'bossLobby'; }   // 끌어서/휠로 스크롤하는 화면
  // 클릭은 손을 뗄 때 판정 (도감에서 끌어서 스크롤한 경우는 클릭 아님)
  function toGame(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  var drag = null;
  canvas.addEventListener('pointerdown', function (e) {
    FX.initAudio(); bgmUnlock();
    var p = toGame(e);
    var R = G.descRect, inDesc = G.scene === 'select' && R && p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h;
    drag = { x: p.x, y: p.y, s: G.dexScroll || 0, ds: G.descScroll || 0, ms: G.mapScroll || 0, inDesc: inDesc && !G.mapPick, inMap: G.scene === 'select' && !!G.mapPick, moved: false };
    if (canvas.setPointerCapture) try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = toGame(e);
    if (Math.abs(p.y - drag.y) > 18) drag.moved = true;
    if (drag.moved && scrolly()) G.dexScroll = drag.s - (p.y - drag.y);
    if (drag.moved && drag.inDesc) G.descScroll = drag.ds - (p.y - drag.y);
    if (drag.moved && drag.inMap) G.mapScroll = drag.ms - (p.y - drag.y);
  });
  canvas.addEventListener('pointerup', function () {
    var d = drag; drag = null;
    if (!d || (d.moved && (scrolly() || d.inDesc || d.inMap))) return;
    for (var i = G.hits.length - 1; i >= 0; i--) {
      var h = G.hits[i];
      if (d.x >= h.x && d.x <= h.x + h.w && d.y >= h.y && d.y <= h.y + h.h) { h.fn(); return; }
    }
  });
  canvas.addEventListener('pointercancel', function () { drag = null; });
  canvas.addEventListener('wheel', function (e) {
    var dyw = e.deltaY * (e.deltaMode === 1 ? 40 : 1) * 1.5;
    if (G.scene === 'select') {   // 선택 화면: 설명 패널 위에서만 (맵 고르기 창이 열려 있으면 그 창)
      if (G.mapPick) { e.preventDefault(); G.mapScroll = (G.mapScroll || 0) + dyw; return; }
      var p = toGame(e), R = G.descRect;
      if (R && p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h) { e.preventDefault(); G.descScroll = (G.descScroll || 0) + dyw; }
      return;
    }
    if (!scrolly()) return;
    e.preventDefault();
    G.dexScroll = (G.dexScroll || 0) + dyw;
  }, { passive: false });
  window.addEventListener('keydown', function (e) {
    FX.initAudio(); bgmUnlock();
    var k = e.key.toLowerCase();
    if (k === 'h') G.record = !G.record;
    else if (k === 'm') FX.setMuted(!FX.muted);
    else if (k.length === 1 && k >= '1' && k <= String(CONFIG.speeds.length)) G.speedIdx = +k - 1;
    else if (k === 'r') {
      if ((G.scene === 'battle' || G.scene === 'result') && canStart()) startBattle();
      else if (G.scene !== 'select' && G.scene !== 'bracket') go('title');
    }
    else if (scrolly() && (k === 'arrowdown' || k === 'arrowup' || k === 'pagedown' || k === 'pageup')) {
      e.preventDefault();
      G.dexScroll = (G.dexScroll || 0) + ({ arrowdown: 120, arrowup: -120, pagedown: 1200, pageup: -1200 })[k];
    }
    else if ((k === ' ' || k === 'enter') && G.mode === 'tour') {
      e.preventDefault();
      if (G.scene === 'bracket' && !G.tour.champion) startMatch(tourNext());
      else if ((G.scene === 'result' || G.scene === 'stats') && G.tour && G.tour.cur) tourAdvance();
    }
  });

  function go(scene) { G.scene = scene; FX.reset(); }
  function speed() { return CONFIG.speeds[G.speedIdx] || 1; }
  var BATTLE_STEP = 1 / 60;   // 전투 고정 단계 (테스트·시뮬레이션과 같은 값)
  function speedLabel() { return 'x' + speed(); }

  function teamsInRoster() {
    var t = [];
    G.roster.forEach(function (e) { if (t.indexOf(e.team) < 0) t.push(e.team); });
    return t.sort();
  }
  function canStart() {
    return G.mode === 'team' ? teamsInRoster().length >= 2 : G.mode === 'boss' ? G.roster.length >= 1 : G.roster.length >= 2;
  }
  function startBattle() {
    if (G.mode === 'tour') {   // 토너먼트: 진행 중인 경기가 있으면 그 경기 재시작, 아니면 새 대진
      if (G.tour && G.tour.cur && (G.scene === 'battle' || G.scene === 'result' || G.scene === 'stats')) return startMatch(G.tour.cur);
      return startTournament();
    }
    if (!canStart()) return;
    FX.reset();
    if (G.mode === 'boss') G.roster = G.roster.slice(0, CONFIG.boss.maxPlayers);
    G.battle = G.mode === 'boss'
      ? new Battle(G.roster.map(function (e) { return e.id; }), 'boss', { boss: G.bossId, difficulty: G.bossDiff })
      : new Battle(G.roster.map(function (e) { return { id: e.id, team: e.team }; }), G.mode, { map: pickMap() });
    G.scene = 'battle'; G.phase = 'intro'; G.pt = 0; G.lastCount = -1;
    mapBanner(G.battle);
    G.battle.synergies.forEach(function (s, i) {
      FX.banner(s.name, { color: s.color || '#ffe14d', sub: TEAMS[s.team % TEAMS.length].label + '팀 시너지', size: 100, life: 2.2, y: 560 + i * 170 });
    });
  }
  G.start = startBattle;   // 콘솔 디버그용: Game.roster=[{id:'baton',team:0},{id:'ibi',team:1}]; Game.start()

  // ---------- 공통 배경 ----------
  function background() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120a2a'); g.addColorStop(1, '#05030c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---------- 타이틀 ----------
  function initTitleBalls() {
    G.titleBalls = IDS.concat(IDS).map(function (id, i) {
      var a = Math.random() * Math.PI * 2;
      return { def: CHARACTERS[id], x: 150 + Math.random() * 780, y: 300 + Math.random() * 1300, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
        r: 70 + (i % 3) * 25, rot: 0 };
    });
  }
  initTitleBalls();
  function titleScene(dt) {
    background();
    G.titleBalls.forEach(function (b) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vx * dt / b.r * 0.3;
      if (b.x < b.r || b.x > W - b.r) b.vx *= -1;
      if (b.y < b.r || b.y > H - b.r) b.vy *= -1;
      var col = CONFIG.chars[b.def.id].color;
      ctx.save(); ctx.globalAlpha = 0.35; ctx.shadowColor = col; ctx.shadowBlur = 40;
      Assets.drawBall(ctx, b.def, 'base', b.x, b.y, b.r, b.rot, col);
      ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });
    ctx.fillStyle = 'rgba(5,3,12,0.45)'; ctx.fillRect(0, 0, W, H);
    var s = 1 + Math.sin(G.time * 3) * 0.03;
    ctx.save(); ctx.translate(W / 2, 640); ctx.scale(s, s); ctx.rotate(-0.06);
    outlined(ctx, '볼 파이트', 0, 0, 190, '#ffd400', '#ff2bd6');
    outlined(ctx, 'WEAPON BALL FIGHT', 0, 150, 64, '#00f0ff', '#00f0ff');
    ctx.restore();
    var names = GROUPS.map(function (q) { return q.name; }), half = Math.ceil(names.length / 2);
    outlined(ctx, names.slice(0, half).join(' · '), W / 2, 940, 42, '#ffffff');
    if (names.length > half) outlined(ctx, names.slice(half).join(' · '), W / 2, 1010, 42, '#ffffff');
    button(W / 2 - 260, 1170, 520, 150, '시작', function () { if (G.mode === 'boss') G.mode = 'ffa'; go('select'); }, { size: 72 });
    // 보스전 입구: 붉은 금테 버튼이 맥동
    var bp = 0.5 + Math.sin(G.time * 4) * 0.5;
    ctx.save(); ctx.shadowColor = '#ff2b3b'; ctx.shadowBlur = 30 + bp * 40; ctx.fillStyle = 'rgba(255,43,59,' + (0.25 + bp * 0.2) + ')';
    roundRect(ctx, W / 2 - 300, 1340, 600, 140, 40); ctx.fill(); ctx.restore();
    button(W / 2 - 290, 1350, 580, 120, '👑 보스전', openBossLobby, { size: 60, color: '#ff2b3b', color2: '#ffb000' });
    button(W / 2 - 420, 1520, 400, 110, '📖 도감', function () { openDex(IDS[0]); }, { size: 50, color: '#7a5cff', color2: '#2f9bff' });
    button(W / 2 + 20, 1520, 400, 110, '📊 통계', openRecords, { size: 50, color: '#ffb000', color2: '#ff2b6a' });
    hint();
  }

  // ---------- 선택 ----------
  function chip(x, y, w, h, label, active, color, fn) {
    ctx.save();
    ctx.fillStyle = active ? color : 'rgba(255,255,255,0.08)';
    ctx.shadowColor = color; ctx.shadowBlur = active ? 25 : 0;
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = active ? '#ffffff' : color; ctx.stroke();
    outlined(ctx, label, x + w / 2, y + h / 2 + 2, Math.round(h * 0.5), active ? '#ffffff' : color);
    ctx.restore();
    hit(x, y, w, h, function () { FX.sfx('click'); fn(); });
  }
  var synCache = { key: '', list: [] };
  function previewSynergies() {
    if ((G.mode !== 'team' && G.mode !== 'boss') || !G.roster.length) return [];
    var key = G.mode + JSON.stringify(G.roster);
    if (synCache.key !== key) {
      synCache.key = key;
      synCache.list = G.mode === 'boss'   // 보스전: 도전자 전원이 한 팀
        ? new Battle(G.roster.map(function (e) { return e.id; }), 'boss', { boss: G.bossId, difficulty: G.bossDiff }).synergies.filter(function (s) { return s.team === 1; })
        : new Battle(G.roster, 'team').synergies;
    }
    return synCache.list;
  }

  function selectScene() {
    background();
    if (G.mode === 'boss') {   // 보스전 도전자 고르기 (보스전 로비에서 들어옴)
      outlined(ctx, '보스전 · 도전자 선택', W / 2, 74, 70, '#ffd400', '#ff2b3b');
      button(40, 128, 1000, 76, '👑 ' + BOSSES[G.bossId].name + ' 정보 · 난이도 바꾸기', openBossLobby, { size: 34, color: '#ff2b3b', color2: '#7a1020' });
    } else {
      outlined(ctx, '캐릭터 선택', W / 2, 74, 76, '#ffffff', '#ff2bd6');
      // 모드
      chip(40, 128, 320, 76, '개인전', G.mode === 'ffa', '#00c2ff', function () { G.mode = 'ffa'; G.swapSel = null; });
      chip(380, 128, 320, 76, '팀전', G.mode === 'team', '#ff2b6a', function () { G.mode = 'team'; G.swapSel = null; });
      chip(720, 128, 320, 76, '토너먼트', G.mode === 'tour', '#ffd400', function () { G.mode = 'tour'; G.swapSel = null; });
    }

    // 캐릭터 카드(사람 단위): 누를 때마다 지금 보이는 모습으로 참가자 추가 (중복 가능)
    // 이격이 있으면 카드 아래 모습 탭으로 바꿈
    var n = GROUPS.length, rows = n > 5 ? 2 : 1, per = Math.ceil(n / rows), gap = 12;
    var cw = (W - 60 - gap * (per - 1)) / per, ch = (415 - gap * (rows - 1)) / rows, cy0 = 226, tall = rows === 1;
    var pr = Math.min(84, cw * 0.38, ch * (tall ? 0.3 : 0.25)), ns = Math.min(44, cw * 0.2);
    GROUPS.forEach(function (g, i) {
      var id = G.pick[g.name] || g.ids[0], def = CHARACTERS[id], c = CONFIG.chars[id];
      var x = 30 + (i % per) * (cw + gap), y = cy0 + Math.floor(i / per) * (ch + gap), mx = x + cw / 2, multi = g.ids.length > 1;
      var cnt = G.roster.filter(function (e) { return g.ids.indexOf(e.id) >= 0; }).length, foc = g.ids.indexOf(G.focus) >= 0;
      ctx.save();
      ctx.shadowColor = c.color; ctx.shadowBlur = cnt ? 35 : 0;
      ctx.fillStyle = cnt ? 'rgba(40,24,70,0.95)' : 'rgba(22,14,42,0.9)';
      roundRect(ctx, x, y, cw, ch, 22); ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = foc ? 6 : 3; ctx.strokeStyle = foc || cnt ? c.color : 'rgba(255,255,255,0.25)'; ctx.stroke();
      ctx.restore();
      Assets.drawBall(ctx, def, 'base', mx, y + 20 + pr, pr, 0, c.color);
      ctx.lineWidth = 6; ctx.strokeStyle = c.color; ctx.beginPath(); ctx.arc(mx, y + 20 + pr, pr, 0, Math.PI * 2); ctx.stroke();
      var ty0 = y + 30 + pr * 2;
      if (tall) {
        ty0 += 14;
        outlined(ctx, def.name, mx, ty0 + ns * 0.5, ns, c.color);
        outlined(ctx, def.sub, mx, ty0 + ns + 22, 19, '#dddddd');
        outlined(ctx, '❤ ' + c.hp, mx, ty0 + ns + 60, 28, '#ff6b8a');
      } else {
        outlined(ctx, def.name, mx, ty0 + 8, Math.min(32, cw * 0.16), c.color);
        if (!multi) outlined(ctx, shortSub(id) + ' · ❤' + c.hp, mx, ty0 + 34, Math.min(17, cw * 0.12), '#dddddd');
      }
      if (cnt) {
        ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(x + cw - 24, y + 24, 22, 0, Math.PI * 2); ctx.fill();
        outlined(ctx, 'x' + cnt, x + cw - 24, y + 26, 22, '#ffffff');
      }
      if (multi) outlined(ctx, '이격', x + 30, y + 22, 16, '#ffe14d');
      hit(x, y, cw, ch, function () {
        FX.sfx('click'); G.focus = id;
        if (G.mode === 'boss' && G.roster.length >= CONFIG.boss.maxPlayers) { FX.sfx('click'); G.fullMsg = G.time; return; }   // 보스전 도전자 최대 인원
        G.roster.push({ id: id, team: G.mode === 'team' ? G.curTeam : 0 });
      });
      if (multi) {   // 모습 탭: 누르면 모습만 바꿈 (추가 안 함)
        var tw = (cw - 12) / g.ids.length, th = 30, tyy = y + ch - th - 8;
        g.ids.forEach(function (vid, k) {
          var on = vid === id, vc = CONFIG.chars[vid].color, tx = x + 6 + k * tw;
          ctx.fillStyle = on ? vc : 'rgba(255,255,255,0.08)'; roundRect(ctx, tx + 2, tyy, tw - 4, th, th / 2); ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = vc; ctx.stroke();
          ctx.font = '700 ' + Math.round(Math.min(16, tw * 0.17)) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = on ? '#111' : vc; ctx.fillText(shortSub(vid), tx + tw / 2, tyy + th / 2 + 1, tw - 8);
          hit(tx, tyy - 4, tw, th + 8, function () { FX.sfx('click'); G.pick[g.name] = vid; G.focus = vid; });
        });
      }
    });

    // 팀 고르기 / 안내
    var ty = 665;
    if (G.mode === 'team') {
      outlined(ctx, '추가할 팀', 130, ty + 36, 32, '#ffffff');
      TEAMS.forEach(function (T, i) {
        chip(240 + i * 205, ty, 185, 70, T.label + '팀', G.curTeam === i, T.color, function () { G.curTeam = i; });
      });
    } else if (G.mode === 'boss') {
      // 보스 · 난이도
      var bd = BOSSES[G.bossId], bcol = CONFIG.bosses[G.bossId].color;
      Assets.drawBall(ctx, bd, 'base', 76, ty + 35, 34, 0, bcol);
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffd400'; ctx.beginPath(); ctx.arc(76, ty + 35, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'left'; ctx.font = '700 30px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffd400'; ctx.fillText(bd.name, 122, ty + 46);
      chip(560, ty, 230, 70, '이지', G.bossDiff === 'easy', '#39c46a', function () { G.bossDiff = 'easy'; });
      chip(810, ty, 230, 70, '하드', G.bossDiff === 'hard', '#ff2b3b', function () { G.bossDiff = 'hard'; });
    } else if (G.mode === 'tour') {
      outlined(ctx, '대진', 110, ty + 36, 32, '#ffffff');
      chip(190, ty, 280, 70, '직접 배치', G.tourSeed === 'manual', '#ffd400', function () { G.tourSeed = 'manual'; });
      chip(490, ty, 280, 70, '랜덤 배치', G.tourSeed === 'random', '#ff8c42', function () { G.tourSeed = 'random'; G.swapSel = null; });
      outlined(ctx, G.tourSeed === 'manual' ? '두 명 눌러 자리 바꾸기' : '시작할 때 섞음', 910, ty + 36, 22, '#bbbbbb');
    } else {
      outlined(ctx, '카드를 누를 때마다 참가자 추가 (같은 캐릭터 중복 가능, 인원 무제한)', W / 2, ty + 36, 27, '#bbbbbb');
    }

    // 참가자 명단: 누르면 제외
    var py = 753, ph = 300;
    ctx.fillStyle = 'rgba(18,10,36,0.95)'; roundRect(ctx, 30, py, W - 60, ph, 24); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 28px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff';
    var modeTxt = G.mode === 'team' ? '팀전 · ' + teamsInRoster().length + '팀' : G.mode === 'tour' ? '토너먼트 1:1' : G.mode === 'boss' ? '보스전 도전자 (최대 ' + CONFIG.boss.maxPlayers + '명)' + (G.fullMsg && G.time - G.fullMsg < 1.5 ? ' · 가득 찼어요!' : '') : '개인전';
    var helpTxt = G.mode === 'tour' && G.tourSeed === 'manual' ? '(같은 사람 두 번 누르면 제외)' : '(누르면 제외)';
    ctx.fillText('참가자 ' + G.roster.length + '명 · ' + modeTxt + '   ' + helpTxt, 60, py + 44);
    function portrait(e, idx, x, y, r) {
      var c = CONFIG.chars[e.id];
      Assets.drawBall(ctx, CHARACTERS[e.id], 'base', x, y, r, 0, c.color);
      ctx.lineWidth = 4; ctx.strokeStyle = G.mode === 'team' ? TEAMS[e.team].color : c.color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      hit(x - r, y - r, r * 2, r * 2, function () { FX.sfx('click'); G.roster.splice(idx, 1); });
    }
    if (G.mode === 'tour') {
      // 1라운드 대진: 순서대로 두 명씩. 직접 배치에선 두 명을 눌러 자리 교체
      var pairs = Math.max(1, Math.ceil(G.roster.length / 2)), cols = 3, pcw = (W - 100) / cols;
      var prow = Math.ceil(pairs / cols), prh = Math.min(84, 220 / prow), pr = Math.min(30, prh * 0.38);
      for (var q = 0; q < pairs && G.roster.length; q++) {
        var pcx = 50 + pcw * (q % cols) + pcw / 2, pcy = py + 104 + Math.floor(q / cols) * prh;
        outlined(ctx, String(q + 1), pcx - pcw / 2 + 22, pcy, 22, '#888888');
        [0, 1].forEach(function (side) {
          var idx = q * 2 + side, x = pcx + (side ? 52 : -52), e = G.roster[idx];
          if (!e) { outlined(ctx, '부전승', x, pcy, 20, '#777777'); return; }
          var c = CONFIG.chars[e.id];
          Assets.drawBall(ctx, CHARACTERS[e.id], 'base', x, pcy, pr, 0, c.color);
          ctx.lineWidth = G.swapSel === idx ? 7 : 4; ctx.strokeStyle = G.swapSel === idx ? '#ffffff' : c.color;
          ctx.beginPath(); ctx.arc(x, pcy, pr + (G.swapSel === idx ? 3 : 0), 0, Math.PI * 2); ctx.stroke();
          hit(x - pr, pcy - pr, pr * 2, pr * 2, function () { FX.sfx('click'); tourTap(idx); });
        });
        outlined(ctx, 'vs', pcx, pcy, 22, '#ffd400');
      }
    } else if (G.mode === 'team') {
      var rowH = 58;
      TEAMS.forEach(function (T, t) {
        var ry = py + 66 + t * rowH, mem = [];
        G.roster.forEach(function (e, idx) { if (e.team === t) mem.push([e, idx]); });
        ctx.fillStyle = t === G.curTeam ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0)';
        roundRect(ctx, 46, ry, W - 92, rowH - 8, 16); ctx.fill();
        outlined(ctx, T.label, 82, ry + rowH / 2 - 2, 40, T.color);
        var step = Math.min(66, (W - 220) / Math.max(1, mem.length)), r = Math.min(28, step / 2 - 2);
        mem.forEach(function (m, k) { portrait(m[0], m[1], 150 + k * step, ry + rowH / 2 - 4, r); });
      });
    } else {
      var per = 10, step = (W - 120) / per, cnt = G.roster.length, r = 36;
      if (cnt > per * 3) { per = Math.ceil(cnt / 3); step = (W - 120) / per; r = Math.min(40, step / 2 - 2); }
      G.roster.forEach(function (e, idx) {
        portrait(e, idx, 60 + step / 2 + (idx % per) * step, py + 106 + Math.floor(idx / per) * 84, r);
      });
    }

    // 시너지 미리보기
    var syn = previewSynergies();
    if (G.mode === 'boss') {
      outlined(ctx, syn.length ? '✦ 도전자 시너지: ' + syn.map(function (s) { return s.name; }).join('  ✦ ') : '같은 팀 시너지가 보스전에도 적용돼요 (조건은 도감 → 시너지)', W / 2, py + ph + 34, syn.length ? 30 : 22, syn.length ? '#ffe14d' : '#999999');
    } else if (G.mode === 'team') {
      var st = syn.length ? '✦ ' + syn.map(function (s) { return TEAMS[s.team].label + '팀 ' + s.name; }).join('  ✦ ') : '시너지 ' + SYNERGIES.length + '종 · 조건은 도감 → 시너지 (이격 포함)';
      outlined(ctx, st, W / 2, py + ph + 34, syn.length ? 30 : 22, syn.length ? '#ffe14d' : '#999999');
    }

    // 캐릭터 설명 (마지막으로 누른 카드): 소개 · 스킬 · 패시브 · 시너지
    var f = CHARACTERS[G.focus], fc = CONFIG.chars[G.focus], dy = 1105, dh = 505;
    ctx.fillStyle = 'rgba(18,10,36,0.95)'; roundRect(ctx, 30, dy, W - 60, dh, 24); ctx.fill();
    ctx.strokeStyle = fc.color; ctx.lineWidth = 4; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 32px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = fc.color;
    ctx.fillText(f.name + ' (' + f.sub + ')  ·  체력 ' + fc.hp + ' · ' + f.blurb, 56, dy + 46);
    // 설명은 패널 안에서 스크롤 (휠·드래그). 다른 캐릭터를 누르면 맨 위부터
    var top = dy + 60, bot = dy + dh - 10;
    G.descRect = { x: 30, y: top, w: W - 60, h: bot - top };
    if (G.descFor !== G.focus) { G.descFor = G.focus; G.descScroll = 0; G.descEnd = 0; }
    var maxS = Math.max(0, (G.descEnd || 0) - bot + 20);
    G.descScroll = Math.max(0, Math.min(maxS, G.descScroll || 0));
    ctx.save(); ctx.beginPath(); ctx.rect(30, top, W - 60, bot - top); ctx.clip(); ctx.translate(0, -G.descScroll);
    G.descEnd = drawDetail(G.focus, 56, dy + 86, W - 112, 0.82);
    ctx.restore();
    if (maxS > 0) {
      var th = (bot - top) * (bot - top) / (bot - top + maxS), sy = top + (bot - top - th) * G.descScroll / maxS;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, W - 50, top, 8, bot - top, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; roundRect(ctx, W - 50, sy, 8, th, 4); ctx.fill();
      if (G.descScroll < maxS - 5) outlined(ctx, '▼ 스크롤해서 더 보기', W / 2, bot - 4, 20, 'rgba(255,255,255,0.7)');
    }

    var synOk = G.mode === 'team' || G.mode === 'boss';
    button(40, 1625, 230, 120, '랜덤', randomRoster, { color: '#00c2ff', color2: '#7a5cff' });
    button(285, 1625, 250, 120, '✦ 시너지', function () { G.synPick = true; }, { color: '#9cff57', color2: '#00a37a', size: 42, enabled: synOk });
    button(550, 1625, 190, 120, '비우기', function () { G.roster = []; }, { color: '#555577', color2: '#333355', enabled: G.roster.length > 0, size: 40 });
    button(755, 1625, 285, 120, G.mode === 'tour' ? '토너먼트 시작' : '전투 시작', startBattle, { enabled: canStart(), color: '#ff2b6a', color2: '#ffb000', size: G.mode === 'tour' ? 38 : 46 });
    button(40, 1780, 200, 90, '◀ 뒤로', function () { if (G.mode === 'boss') openBossLobby(); else go('title'); }, { size: 36, color: '#555577', color2: '#333355' });
    button(260, 1780, 220, 90, '📖 도감', function () { openDex(G.focus); }, { size: 36, color: '#7a5cff', color2: '#333355' });
    button(500, 1780, 220, 90, '📊 통계', openRecords, { size: 36, color: '#ffb000', color2: '#333355' });
    var mapOk = G.mode !== 'boss';
    button(740, 1780, 300, 90, mapOk ? '🗺 ' + mapLabel(G.mapSel) : '🗺 보스전 전용', function () { G.mapPick = true; G.mapScroll = 0; }, { size: 32, color: G.mapSel === 'none' ? '#3a6a5a' : (MAPS[G.mapSel] || { color: '#ff8c42' }).color, color2: '#223344', enabled: mapOk });
    hint();
    if (G.synPick && synOk) synPickOverlay(); else G.synPick = false;
    if (G.mapPick && mapOk) mapPickOverlay(); else G.mapPick = false;
  }
  // ---------- 맵 ----------
  function mapLabel(id) { return id === 'random' ? '랜덤 맵' : MAPS[id] ? MAPS[id].name : '기본 경기장'; }
  function pickMap() { return G.mapSel === 'random' ? MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] : MAPS[G.mapSel] ? G.mapSel : null; }   // 랜덤은 전투마다 새로
  function mapBanner(bt) { if (bt.map) FX.banner('MAP ' + bt.map.def.no + ' · ' + bt.map.def.name, { color: bt.map.def.color, size: 90, life: 2.2, y: CONFIG.screen.y + 160 }); }
  function mapPickOverlay() {
    ctx.fillStyle = 'rgba(4,0,12,0.86)'; ctx.fillRect(0, 0, W, H);
    hit(0, 0, W, H, function () { G.mapPick = false; });
    ctx.font = '500 24px "Malgun Gothic",sans-serif';
    var tw0 = W - 80 - 20 - 190 - 26 - 20;   // 설명 칸 너비 (줄 수만큼 카드 높이)
    var opts = [{ id: 'none', h: 120 }].concat(MAP_IDS.map(function (id) {
      var n = MAPS[id].lines.reduce(function (a, l) { return a + Math.ceil(ctx.measureText('· ' + l).width / tw0); }, 0);
      return { id: id, h: 100 + n * 30 + MAPS[id].lines.length * 16 };
    }), [{ id: 'random', h: 120 }]);
    var gap = 18, tot = opts.reduce(function (a, o) { return a + o.h + gap; }, 0), y = Math.max(160, (H - tot - 110) / 2 + 40);
    // 끌거나 휠로 스크롤 (내용 높이 = 카드들 + 닫기 버튼)
    var maxS = Math.max(0, y + tot + 120 - H);
    G.mapScroll = Math.max(0, Math.min(maxS, G.mapScroll || 0));
    ctx.save(); ctx.translate(0, -G.mapScroll); G.hitClip = { dy: -G.mapScroll, top: 0, bottom: H };
    outlined(ctx, '🗺 맵 고르기', W / 2, y - 70, 60, '#ffffff', '#00e5ff');
    opts.forEach(function (o) {
      var m = MAPS[o.id], col = m ? m.color : o.id === 'random' ? '#ff8c42' : '#7a5cff', sel = G.mapSel === o.id, x = 40, w = W - 80;
      ctx.save(); ctx.fillStyle = 'rgba(22,14,42,0.97)'; roundRect(ctx, x, y, w, o.h, 22); ctx.fill();
      ctx.lineWidth = sel ? 8 : 3; ctx.strokeStyle = sel ? '#ffffff' : col; ctx.stroke(); ctx.restore();
      var px = x + 20, pw = m ? 190 : 120, ph = o.h - 40;
      ctx.save(); roundRect(ctx, px, y + 20, pw, ph, 14); ctx.clip();
      if (m) drawMapPreview(ctx, o.id, px, y + 20, pw, ph, G.time);
      else { ctx.fillStyle = o.id === 'random' ? '#2a1a10' : '#0c0a1d'; ctx.fillRect(px, y + 20, pw, ph); ctx.font = '54px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.id === 'random' ? '🎲' : '⬛', px + pw / 2, y + 20 + ph / 2); }
      ctx.restore();
      var tx = px + pw + 26, tw = x + w - tx - 20;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '700 44px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = col;
      ctx.fillText(m ? 'MAP ' + m.no + '. ' + m.name : mapLabel(o.id), tx, y + 62);
      if (sel) { ctx.font = '700 26px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText('✔ 선택됨', x + w - 150, y + 52); }
      ctx.font = '500 24px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#d8d0ee';
      if (m) { var ly = y + 108; m.lines.forEach(function (l) { ly = wrap('· ' + l, tx, ly, tw, 30) + 16; }); }
      else ctx.fillText(o.id === 'random' ? '전투를 시작할 때마다 맵 하나를 무작위로' : '특별한 효과 없는 원래 경기장', tx, y + 100);
      hit(x, y, w, o.h, function () { FX.sfx('click'); G.mapSel = o.id; G.mapPick = false; });
      y += o.h + gap;
    });
    button(W / 2 - 150, y + 4, 300, 90, '닫기', function () { G.mapPick = false; }, { size: 38, color: '#555577', color2: '#333355' });
    G.hitClip = null; ctx.restore();
    if (maxS > 0) {   // 스크롤바
      var th = H * H / (H + maxS), ty = (H - th) * G.mapScroll / maxS;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, W - 18, 0, 10, H, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; roundRect(ctx, W - 18, ty, 10, th, 5); ctx.fill();
      if (G.mapScroll < maxS - 5) outlined(ctx, '▼ 스크롤해서 더 보기', W / 2, H - 20, 24, 'rgba(255,255,255,0.75)');
    }
  }
  // 시너지 멤버의 캐릭터 id: 모습 조건(needIds)이 있으면 그 모습, 아니면 지금 고른 모습
  function synMemberId(q, nm) {
    var g = GROUPS.filter(function (x) { return x.name === nm; })[0], need = q.needIds ? q.needIds() : [];
    if (!g) return null;
    var nid = g.ids.filter(function (id) { return need.indexOf(id) >= 0 || (q.fillIds || []).indexOf(id) >= 0; })[0];
    return nid || G.pick[nm] || g.ids[0];
  }
  // 시너지별 채우기 — 팀전: 지금 고른 팀을 그 멤버로 바꿈 / 보스전: 없는 멤버만 도전자에 추가 (최대 인원까지)
  function synFill(q) {
    var mem = q.solo ? [q.solo[0]] : q.members();
    var ids = mem.map(function (nm) { return synMemberId(q, nm); }).filter(Boolean);
    if (G.mode === 'team') {
      G.roster = G.roster.filter(function (e) { return e.team !== G.curTeam; })
        .concat(ids.map(function (id) { return { id: id, team: G.curTeam }; }));
    } else {
      var need = q.needIds ? q.needIds() : [];
      ids.forEach(function (id) {
        var g = groupOf(id), has = G.roster.some(function (e) { return need.indexOf(id) >= 0 ? e.id === id : g.ids.indexOf(e.id) >= 0; });
        if (!has && G.roster.length < CONFIG.boss.maxPlayers) G.roster.push({ id: id, team: 0 });
      });
    }
    G.swapSel = null; if (ids.length) G.focus = ids[0];
  }
  function synPickOverlay() {
    // 뒤를 막는 판 (누르면 닫힘) — 나중에 등록한 hit이 먼저 받음
    ctx.fillStyle = 'rgba(4,0,12,0.82)'; ctx.fillRect(0, 0, W, H);
    hit(0, 0, W, H, function () { G.synPick = false; });
    var list = SYNERGIES, cols = 2, gap = 16, cw = (W - 80 - gap) / cols, chh = 150, rows = Math.ceil(list.length / cols);
    var py = Math.max(260, H / 2 - (rows * (chh + gap)) / 2 - 40);
    outlined(ctx, '✦ 시너지별 채우기', W / 2, py - 90, 60, '#9cff57', '#00a37a');
    outlined(ctx, G.mode === 'team' ? TEAMS[G.curTeam].label + '팀을 이 멤버로 바꿔요' : '없는 멤버만 도전자에 더해요 (최대 ' + CONFIG.boss.maxPlayers + '명)', W / 2, py - 36, 28, '#dddddd');
    list.forEach(function (q, i) {
      var x = 40 + (i % cols) * (cw + gap), y = py + Math.floor(i / cols) * (chh + gap), col = q.color || '#ffe14d';
      var mem = q.solo ? [q.solo[0]] : q.members();
      ctx.save(); ctx.fillStyle = 'rgba(22,14,42,0.97)'; roundRect(ctx, x, y, cw, chh, 22); ctx.fill();
      var gr = ctx.createLinearGradient(x, y, x + cw, y + chh); gr.addColorStop(0, col); gr.addColorStop(1, Battle.shiftHue(col, 50));
      ctx.lineWidth = 4; ctx.strokeStyle = gr; ctx.stroke(); ctx.restore();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '700 36px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = col;
      ctx.fillText(q.name + (q.solo ? ' (혼자)' : ''), x + 22, y + 46, cw - 40);
      var step = Math.min(70, (cw - 40) / mem.length), r = Math.min(30, step / 2 - 3);
      mem.forEach(function (nm, k) {
        var id = synMemberId(q, nm); if (!id) return;
        var c = CONFIG.chars[id], cx = x + 22 + r + k * step, cy = y + 98;
        Assets.drawBall(ctx, CHARACTERS[id], 'base', cx, cy, r, 0, c.color);
        ctx.lineWidth = 3; ctx.strokeStyle = c.color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      });
      hit(x, y, cw, chh, function () { FX.sfx('click'); synFill(q); G.synPick = false; });
    });
    var by = py + rows * (chh + gap) + 10;
    button(W / 2 - 150, by, 300, 90, '닫기', function () { G.synPick = false; }, { size: 38, color: '#555577', color2: '#333355' });
  }
  function tourTap(idx) {
    if (G.tourSeed !== 'manual') { G.roster.splice(idx, 1); return; }
    if (G.swapSel === null) { G.swapSel = idx; return; }
    if (G.swapSel === idx) { G.roster.splice(idx, 1); G.swapSel = null; return; }
    var t = G.roster[idx]; G.roster[idx] = G.roster[G.swapSel]; G.roster[G.swapSel] = t; G.swapSel = null;
  }

  // ---------- 토너먼트 (싱글 엘리미네이션 1:1) ----------
  // rounds[0] = 1라운드 자리(빈 자리는 null = 부전승), rounds[r+1][i] = rounds[r]의 (2i, 2i+1) 경기 승자 (undefined = 아직)
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function startTournament() {
    if (G.roster.length < 2) return;
    var counts = {}, seen = {};
    G.roster.forEach(function (e) { counts[e.id] = (counts[e.id] || 0) + 1; });
    var entries = G.roster.map(function (e) {
      var name = CHARACTERS[e.id].name;
      if (counts[e.id] > 1) { seen[e.id] = (seen[e.id] || 0) + 1; name += seen[e.id]; }
      return { id: e.id, name: name };
    });
    if (G.tourSeed === 'random') shuffle(entries);
    var size = 2;
    while (size < entries.length) size *= 2;
    while (entries.length < size) entries.push(null);
    G.tour = { rounds: [entries], cur: null, champion: null };
    tourResolve();
    FX.reset(); G.scene = 'bracket'; G.pt = 0;
  }
  function tourResolve() {
    var R = G.tour.rounds;
    for (var r = 0; R[r].length > 1; r++) {
      if (!R[r + 1]) R[r + 1] = new Array(R[r].length / 2);
      for (var i = 0; i < R[r + 1].length; i++) {
        var a = R[r][2 * i], b = R[r][2 * i + 1];
        if (R[r + 1][i] !== undefined || a === undefined || b === undefined) continue;
        if (a === null) R[r + 1][i] = b;        // 부전승 (둘 다 빈 자리면 빈 자리)
        else if (b === null) R[r + 1][i] = a;
      }
    }
    var last = R[R.length - 1][0];
    G.tour.champion = last || null;
  }
  function tourNext() {
    var R = G.tour.rounds;
    for (var r = 0; r < R.length - 1; r++)
      for (var i = 0; i < R[r + 1].length; i++)
        if (R[r + 1][i] === undefined && R[r][2 * i] && R[r][2 * i + 1]) return { r: r, i: i };
    return null;
  }
  function roundName(r) { var n = G.tour.rounds[r].length; return n === 2 ? '결승' : n === 4 ? '준결승' : n + '강'; }
  function startMatch(m) {
    if (!m) return;
    var R = G.tour.rounds, a = R[m.r][2 * m.i], b = R[m.r][2 * m.i + 1];
    G.tour.cur = m;
    FX.reset();
    G.battle = new Battle([a.id, b.id], 'ffa', { map: pickMap() });
    mapBanner(G.battle);
    G.battle.balls[0].name = a.name; G.battle.balls[1].name = b.name;
    G.battle.balls.forEach(function (x) { var m = /(\d+)$/.exec(x.name); if (x.dupNo && m) x.dupNo = +m[1]; });   // 번호 배지를 대진표 이름과 맞춤
    G.battle.tourEntries = [a, b];
    G.scene = 'battle'; G.phase = 'intro'; G.pt = 0; G.lastCount = -1;
    FX.banner(roundName(m.r), { color: '#ffd400', sub: a.name + ' vs ' + b.name, size: 130, life: 2.0, y: 560 });
  }
  // 무승부(동시 탈락)면 같은 대진으로 재경기
  function tourRematch() {
    var m = G.tour.cur, R = G.tour.rounds, a = R[m.r][2 * m.i], b = R[m.r][2 * m.i + 1];
    startMatch(m);
    FX.banner('무승부 · 재경기', { color: '#00f0ff', sub: a.name + ' vs ' + b.name, size: 110, life: 2.2, y: 760 });
  }
  function tourAdvance() {
    var bt = G.battle, m = G.tour.cur;
    if (!bt.winner) return tourRematch();
    var w = bt.tourEntries[bt.winner.id];
    G.tour.rounds[m.r + 1][m.i] = w;
    G.tour.cur = null;
    tourResolve();
    FX.reset(); G.scene = 'bracket'; G.pt = 0;
    if (G.tour.champion) {
      if (!G.tour.recorded) {   // 우승 = 결승 승자, 준우승 = 결승 상대 (부전승으로 결승이 없으면 없음)
        G.tour.recorded = true;
        var fin = G.tour.rounds[G.tour.rounds.length - 2] || [], ch = G.tour.champion;
        var ru = fin.filter(function (e) { return e && e !== ch; })[0];
        Records.tournament(ch.id, ru ? ru.id : null);
      }
    }
  }
  G.tourState = function () { return G.tour; };   // 디버그용

  function bracketScene(dt) {
    var T = G.tour, R = T.rounds, cols = R.length, next = T.champion ? null : tourNext();
    G.pt += dt;
    background();
    outlined(ctx, '토너먼트', W / 2, 74, 76, '#ffd400', '#ff2bd6');
    var sub = T.champion ? '🏆 우승: ' + T.champion.name
      : next ? '다음: ' + roundName(next.r) + ' · ' + R[next.r][2 * next.i].name + ' vs ' + R[next.r][2 * next.i + 1].name : '';
    outlined(ctx, sub, W / 2, 140, 34, T.champion ? '#ffd400' : '#ffffff');
    // 대진표: 왼쪽부터 라운드, 오른쪽 끝이 우승자
    var top = 190, bottom = 1720, colW = (W - 80) / cols;
    var posOf = function (r, j) { var n = R[r].length, sp = (bottom - top) / n; return { x: 40 + colW * r + colW / 2, y: top + sp * (j + 0.5), sp: sp }; };
    ctx.lineWidth = 4;
    for (var r = 0; r < cols - 1; r++) {
      for (var i = 0; i < R[r + 1].length; i++) {
        var a = posOf(r, 2 * i), b = posOf(r, 2 * i + 1), c = posOf(r + 1, i), mx = (a.x + c.x) / 2;
        var live = next && next.r === r && next.i === i;
        ctx.strokeStyle = live ? '#ffd400' : R[r + 1][i] ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mx, a.y); ctx.lineTo(mx, b.y); ctx.lineTo(b.x, b.y);
        ctx.moveTo(mx, c.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
    }
    for (var r2 = 0; r2 < cols; r2++) {
      if (r2 < cols - 1) outlined(ctx, roundName(r2), 40 + colW * r2 + colW / 2, top - 10, 22, '#aaaaaa');
      R[r2].forEach(function (e, j) {
        var p = posOf(r2, j), rad = Math.min(r2 === cols - 1 ? 90 : 46, p.sp * 0.36, colW * 0.36);
        if (e === undefined) {
          ctx.save(); ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
          outlined(ctx, '?', p.x, p.y, rad, '#666666');
          return;
        }
        if (e === null) { outlined(ctx, '부전승', p.x, p.y, Math.min(22, rad * 0.6), '#555555'); return; }
        var parent = r2 < cols - 1 ? R[r2 + 1][Math.floor(j / 2)] : e, lost = parent && parent !== e;
        var live = next && next.r === r2 && Math.floor(j / 2) === next.i, col = CONFIG.chars[e.id].color;
        ctx.save(); ctx.globalAlpha = lost ? 0.3 : 1;
        if (r2 === cols - 1) { ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 50; }
        Assets.drawBall(ctx, CHARACTERS[e.id], 'base', p.x, p.y, rad, 0, col);
        ctx.shadowBlur = 0;
        ctx.lineWidth = live ? 6 + Math.sin(G.time * 8) * 2 : 4; ctx.strokeStyle = live ? '#ffd400' : r2 === cols - 1 ? '#ffd400' : col;
        ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.stroke();
        if (p.sp > 70) outlined(ctx, e.name, p.x, p.y + rad + 16, Math.min(22, rad * 0.5), lost ? '#888888' : '#ffffff');
        ctx.restore();
        if (r2 === cols - 1) outlined(ctx, '👑', p.x, p.y - rad - 30, 60, '#ffd400');
      });
    }
    if (T.champion && Math.random() < dt * 40) {
      var cs = ['#ffd400', '#ff2bd6', '#00f0ff', '#ffffff'];
      FX.particle({ x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 200, vy: 200 + Math.random() * 300, g: 200, life: 4, size: 16, color: cs[Math.floor(Math.random() * cs.length)], shape: 'square', vr: 8, drag: 0.99 });
    }
    FX.drawWorld(ctx);
    if (T.champion) {
      button(40, 1760, 480, 120, '새 토너먼트', startTournament, { color: '#ff2b6a', color2: '#ffb000', size: 44 });
      button(560, 1760, 480, 120, '캐릭터 다시 고르기', function () { go('select'); }, { color: '#00c2ff', color2: '#7a5cff', size: 36 });
    } else {
      button(40, 1760, 300, 120, '◀ 선택', function () { go('select'); }, { color: '#555577', color2: '#333355', size: 40 });
      button(360, 1760, 680, 120, '▶ ' + (next ? roundName(next.r) + ' 시작' : '다음 경기'), function () { startMatch(next); }, { color: '#ffd400', color2: '#ff2b6a', size: 48 });
    }
    hint();
  }

  function randomRoster() {
    var n = 2 + Math.floor(Math.random() * 5), pick = function () { return IDS[Math.floor(Math.random() * IDS.length)]; };
    if (G.mode === 'tour') n = [4, 8][Math.floor(Math.random() * 2)];
    if (G.mode === 'boss') n = 3 + Math.floor(Math.random() * 3);
    G.roster = []; G.swapSel = null;
    for (var i = 0; i < n; i++) G.roster.push({ id: pick(), team: G.mode === 'team' ? i % 2 : 0 });
    G.focus = G.roster[0].id;
  }

  // ---------- 통계 (누적 전적) ----------
  function openRecords() { G.recBack = G.scene; G.dexScroll = 0; G.recSort = G.recSort || 'base'; G.recReset = 0; Records.load(); go('records'); }
  function pctOf(w, l) { return w + l ? w / (w + l) : -1; }
  function recordsScene() {
    background();
    outlined(ctx, '통계', W / 2, 74, 80, '#ffffff', '#ffb000');
    outlined(ctx, '기록을 시작한 뒤의 누적 전적 · 이 브라우저에 저장', W / 2, 138, 24, '#999999');
    var sorts = [['base', '기본'], ['duel', '1:1'], ['ffa', '개인전'], ['champ', '우승'], ['team', '팀전']];
    sorts.forEach(function (s, i) {
      chip(36 + i * 204, 168, 192, 62, s[1], G.recSort === s[0], '#ffb000', function () { G.recSort = s[0]; G.dexScroll = 0; });
    });
    // 표 머리
    var hy = 270;
    ctx.font = '700 22px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#bbbbbb'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('캐릭터', 150, hy); ctx.fillText('1:1', 383, hy); ctx.fillText('개인전 (3인+)', 578, hy); ctx.fillText('토너먼트', 750, hy); ctx.fillText('팀전', 928, hy);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(30, hy + 12, W - 60, 2);
    // 정렬
    var order = [].concat.apply([], GROUPS.map(function (q) { return q.ids; }));
    var rows = order.map(function (id, i) { return { id: id, i: i, r: Records.get(id) }; });
    var key = {
      duel: function (x) { return pctOf(x.r.duelW, x.r.duelL) * 1e4 + x.r.duelW; },
      ffa: function (x) { return pctOf(x.r.ffaW, x.r.ffaL) * 1e4 + x.r.ffaW; },
      champ: function (x) { return x.r.champ * 1e4 + x.r.runner; },
      team: function (x) { return pctOf(x.r.teamW, x.r.teamL) * 1e4 + x.r.teamW; },
    }[G.recSort];
    if (key) rows.sort(function (a, b) { return key(b) - key(a) || a.i - b.i; });
    // 스크롤 영역
    var top = hy + 20, bot = 1770, rh = 118, maxS = Math.max(0, top + rows.length * rh - bot + 10);
    G.dexScroll = Math.max(0, Math.min(maxS, G.dexScroll || 0));
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, bot - top); ctx.clip(); ctx.translate(0, -G.dexScroll);
    rows.forEach(function (row, k) {
      var id = row.id, r = row.r, def = CHARACTERS[id], c = CONFIG.chars[id], y = top + k * rh, cy = y + rh / 2;
      if (y + rh < top + G.dexScroll || y > bot + G.dexScroll) return;
      ctx.fillStyle = k % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)'; roundRect(ctx, 30, y + 6, W - 60, rh - 12, 18); ctx.fill();
      Assets.drawBall(ctx, def, 'base', 92, cy, 40, 0, c.color);
      ctx.lineWidth = 5; ctx.strokeStyle = c.color; ctx.beginPath(); ctx.arc(92, cy, 40, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = '700 28px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = c.color; ctx.fillText(def.name, 148, cy - 4);
      ctx.font = '500 19px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#aaaaaa'; ctx.fillText(shortSub(id), 148, cy + 26);
      // 1:1 / 팀전: 승패 + 승률 막대
      // 개인전(3인+)은 1등 횟수 / 참가 판수
      [[r.duelW, r.duelL, 300, '#00c2ff', 0], [r.ffaW, r.ffaL, 492, '#7dff9a', 1], [r.teamW, r.teamL, 842, '#ff2b6a', 0]].forEach(function (q) {
        var w = q[0], l = q[1], p = pctOf(w, l), x = q[2], bw = 172;
        ctx.textAlign = 'left'; ctx.font = '700 21px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff';
        ctx.fillText(q[4] ? '1등 ' + w + '/' + (w + l) + '판' : w + '승 ' + l + '패', x, cy - 8);
        ctx.textAlign = 'right'; ctx.fillStyle = p < 0 ? '#666666' : q[3];
        ctx.fillText(p < 0 ? '-' : Math.round(p * 100) + '%', x + bw, cy - 8);
        ctx.fillStyle = '#1b1530'; roundRect(ctx, x, cy + 6, bw, 14, 7); ctx.fill();
        if (p > 0) { ctx.fillStyle = q[3]; roundRect(ctx, x, cy + 6, bw * p, 14, 7); ctx.fill(); }
      });
      // 토너먼트
      ctx.textAlign = 'center'; ctx.font = '700 28px "Malgun Gothic",sans-serif';
      ctx.fillStyle = r.champ ? '#ffd400' : '#666666'; ctx.fillText('🏆 ' + r.champ, 712, cy + 10);
      ctx.fillStyle = r.runner ? '#dddddd' : '#666666'; ctx.fillText('🥈 ' + r.runner, 795, cy + 10);
    });
    ctx.restore();
    if (maxS > 0) {
      var th = (bot - top) * (bot - top) / (bot - top + maxS), sy = top + (bot - top - th) * G.dexScroll / maxS;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, W - 22, top, 10, bot - top, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; roundRect(ctx, W - 22, sy, 10, th, 5); ctx.fill();
    }
    button(40, 1800, 220, 90, '◀ 뒤로', function () { go(G.recBack && G.recBack !== 'records' ? G.recBack : 'title'); }, { size: 36, color: '#555577', color2: '#333355' });
    // 초기화: 두 번 눌러야 지워짐 (3초 안에)
    var arm = G.recReset && G.time - G.recReset < 3;
    button(W - 380, 1800, 340, 90, arm ? '정말 지울까요? 한 번 더' : '기록 초기화', function () {
      if (arm) { Records.reset(); G.recReset = 0; FX.sfx('ko'); } else G.recReset = G.time;
    }, { size: arm ? 26 : 34, color: arm ? '#ff2b2b' : '#555577', color2: '#333355' });
    hint();
  }

  // ---------- 보스전 로비 ----------
  function openBossLobby() { G.dexScroll = 0; G.pt = 0; go('bossLobby'); }
  function drawSheetFrame(name, x, y, s, t, alpha) {   // pixelfx 시트 한 프레임 (화면용)
    var img = FxImg.get(name), m = FX_SHEETS[name]; if (!img) return;
    var f = Math.floor(t * m.fps) % m.n;
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(img, (f % m.cols) * m.w, Math.floor(f / m.cols) * m.h, m.w, m.h, x - m.px * s, y - m.py * s, m.w * s, m.h * s);
    ctx.restore();
  }
  function bossLobbyScene(dt) {
    var bd = BOSSES[G.bossId], hard = G.bossDiff === 'hard', c = bossConfig(G.bossId, G.bossDiff, 4), col = hard ? '#ff2b3b' : '#ffd400';
    G.pt += dt;
    // 배경: 붉은 기운 + 회전하는 빛줄기 + 올라가는 불티
    ctx.fillStyle = '#0a0306'; ctx.fillRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(W / 2, 420, 60, W / 2, 420, 1100);
    bg.addColorStop(0, hard ? 'rgba(160,20,30,0.75)' : 'rgba(150,90,10,0.7)'); bg.addColorStop(1, 'rgba(10,3,6,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, 420); ctx.rotate(G.time * 0.25);
    for (var i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.fillStyle = i % 2 ? col + '22' : 'rgba(255,255,255,0.04)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-70, -1000); ctx.lineTo(70, -1000); ctx.fill(); }
    ctx.restore();
    if (Math.random() < dt * 30) FX.particle({ x: Math.random() * W, y: H + 10, vx: (Math.random() - 0.5) * 60, vy: -120 - Math.random() * 200, life: 4, size: 6 + Math.random() * 8, color: Math.random() < 0.3 ? '#ffffff' : col, shape: 'square', vr: 4 });
    FX.drawWorld(ctx);
    // 제목
    var s = 1 + Math.sin(G.time * 3) * 0.03;
    ctx.save(); ctx.translate(W / 2, 92); ctx.scale(s, s); outlined(ctx, 'BOSS RAID', 0, 0, 96, col, hard ? '#550000' : '#ff8a00'); ctx.restore();
    outlined(ctx, '보스전', W / 2, 160, 34, '#ffffff');
    // 보스 초상: 발밑 마법진 + 금테 + 왕관
    drawSheetFrame(hard ? 'rune_red' : 'rune_gold', W / 2, 560, 3.2, G.time, 0.9);
    var pr = 175, py = 420;
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 70; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(W / 2, py, pr + 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    Assets.drawBall(ctx, bd, hard ? 'p3' : 'base', W / 2, py, pr, 0, col);
    ctx.lineWidth = 12; ctx.strokeStyle = '#ffd400'; ctx.beginPath(); ctx.arc(W / 2, py, pr, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(W / 2, py - pr - 34); ctx.scale(1.6, 1.6); ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 3; ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.moveTo(-48, 16); ctx.lineTo(-48, -14); ctx.lineTo(-24, 4); ctx.lineTo(0, -22); ctx.lineTo(24, 4); ctx.lineTo(48, -14); ctx.lineTo(48, 16); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    outlined(ctx, bd.name, W / 2, 660, 84, '#ffd400', col);
    outlined(ctx, '「' + bd.title + '」', W / 2, 722, 30, '#ffffff');
    // 난이도
    chip(W / 2 - 400, 760, 380, 84, 'EASY · 이지', !hard, '#39c46a', function () { G.bossDiff = 'easy'; });
    chip(W / 2 + 20, 760, 380, 84, 'HARD · 하드', hard, '#ff2b3b', function () { G.bossDiff = 'hard'; });
    outlined(ctx, hard ? '더 많이 구르고 더 많이 뿌림 · 이전 페이즈 스킬도 섞어 씀 · 노광석의 힘 등장' : (c.synergyBonus ? '이지 보너스: 도전자 시너지 하나당 공격력 +' + Math.round(c.synergyBonus.damage * 100) + '%' : '4명 + 시너지 하나로 도전해 보세요 · 페이즈마다 스킬 두 개'), W / 2, 872, 24, hard ? '#ff8a8a' : '#a8f0b8');
    // 설명 (스크롤)
    var top = 900, bot = 1660, maxS = Math.max(0, (G.lobbyEnd || 0) - bot + 30);
    G.dexScroll = Math.max(0, Math.min(maxS, G.dexScroll || 0));
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, bot - top); ctx.clip(); ctx.translate(0, -G.dexScroll);
    var y = top + 20, x = 60, w = W - 120;
    ctx.fillStyle = 'rgba(20,6,10,0.85)'; Battle.roundRect(ctx, 30, top + 4, W - 60, (G.lobbyEnd || bot) - top, 24); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    y = drawBossInfo(bd, c, x, y, w);
    G.lobbyEnd = y + 10;
    ctx.restore();
    if (maxS > 0) {
      var th = (bot - top) * (bot - top) / (bot - top + maxS), sy = top + (bot - top - th) * G.dexScroll / maxS;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; Battle.roundRect(ctx, W - 22, top, 10, bot - top, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; Battle.roundRect(ctx, W - 22, sy, 10, th, 5); ctx.fill();
      if (G.dexScroll < maxS - 5) outlined(ctx, '▼ 스크롤해서 스킬 보기', W / 2, bot - 8, 22, 'rgba(255,255,255,0.75)');
    }
    button(40, 1700, 260, 120, '◀ 처음으로', function () { go('title'); }, { size: 36, color: '#555577', color2: '#333355' });
    button(330, 1690, 710, 140, '도전자 고르기 ▶', function () { G.mode = 'boss'; G.swapSel = null; go('select'); }, { size: 54, color: hard ? '#ff2b3b' : '#ffd400', color2: '#ff2b6a' });
    hint();
  }
  // 보스 소개 · 패시브 · 페이즈별 스킬 · 하드 전용 (보스전 로비 · 도감 공용). 끝난 y를 돌려줌
  function drawBossInfo(bd, c, x, y, w) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '500 25px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff';
    y = wrap(bd.intro, x, y + 30, w, 36) + 6;
    function head(t, cc) { ctx.font = '700 30px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = cc; ctx.fillText(t, x, y + 26); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y + 38, w, 2); y += 62; }
    function item(name, desc, tagTxt, tagCol) {
      ctx.font = '700 27px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(name, x + 10, y);
      if (tagTxt) {
        var tx = x + 22 + ctx.measureText(name).width; ctx.font = '700 18px "Malgun Gothic",sans-serif';
        var tw = ctx.measureText(tagTxt).width + 18; ctx.fillStyle = tagCol; Battle.roundRect(ctx, tx, y - 22, tw, 28, 14); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillText(tagTxt, tx + 9, y - 2);
      }
      ctx.font = '500 23px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#d8c8c0';
      y = wrap(desc, x + 30, y + 34, w - 30, 32) + 10;
    }
    head('패시브', '#ffd400');
    bd.info.passives.forEach(function (p) { item(p.name, p.desc(c), '패시브', '#c6ff00'); });
    [1, 2, 3].forEach(function (ph) {
      head('페이즈 ' + ['Ⅰ', 'Ⅱ', 'Ⅲ'][ph - 1] + (ph === 1 ? ' (체력 100~66%)' : ph === 2 ? ' (66~33%)' : ' (33% 이하)'), [c.color, c.phase2Color, c.phase3Color][ph - 1]);
      bd.info.skills.filter(function (q) { return q.phase === ph; }).forEach(function (q) { item(q.name, q.desc(c), null); });
    });
    var hc = bossConfig(bd.id || G.bossId, 'hard', 4);
    head('하드 전용', '#ff7ad9');
    item(bd.info.hard.name, bd.info.hard.desc(hc), 'HARD', '#ff2b3b');
    return y;
  }

  // ---------- 캐릭터 상세 (설명창 · 도감 공용) ----------
  function txt(d) { return typeof d === 'function' ? d() : d; }
  function section(label, x, y, w, color) {
    ctx.font = '700 24px "Malgun Gothic",sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'left';
    ctx.fillText(label, x, y);
    var lw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + lw + 12, y - 8, w - lw - 12, 2);
    return y + 36;
  }
  function tag(label, x, y, color) {
    ctx.font = '700 18px "Malgun Gothic",sans-serif';
    var w = ctx.measureText(label).width + 16;
    ctx.fillStyle = color; roundRect(ctx, x, y - 19, w, 26, 13); ctx.fill();
    ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.fillText(label, x + 8, y);
    return x + w + 8;
  }
  // 소개 → 스킬(패시브/페이즈 표시) → 캐릭터 패시브 → 시너지
  // flavor: true면 소개 바로 밑에 플레이버 텍스트(회색 이탤릭) — 도감 전용
  function drawDetail(id, x, y, w, k, flavor) {
    var f = CHARACTERS[id], fc = CONFIG.chars[id], ly = y, lh = Math.round(34 * k);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '500 ' + Math.round(25 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff';
    ly = wrap(f.intro || '', x, ly, w, lh) + 8;
    if (flavor && f.flavor) {
      ctx.font = 'italic 500 ' + Math.round(24 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#9a9aa8';
      ly = wrap(f.flavor, x, ly, w, lh) + 8;
    }
    ly = section('스킬', x, ly, w, '#00f0ff');
    f.skills.forEach(function (sk, n) {
      ctx.font = '700 ' + Math.round(27 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
      var head = (n + 1) + '. ' + sk.name;
      ctx.fillText(head, x, ly);
      var tx = x + ctx.measureText(head).width + 12;
      if (sk.passive) tx = tag('패시브', tx, ly - 2, '#c6ff00');
      tx = tag(n ? 'PHASE 2' : 'PHASE 1', tx, ly - 2, n ? fc.phase2Color : '#bbbbbb');
      var cd = sk.cd(fc);
      if (cd < 999) tag(sk.passive ? cd + '초마다' : '쿨 ' + cd + '초', tx, ly - 2, '#ffd36b');
      ly += lh;
      ctx.font = '500 ' + Math.round(23 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#cfc6e6';
      ly = wrap(sk.desc, x + 20, ly, w - 20, lh - 2) + 4;
    });
    if (id === 'samsik') {
      ctx.font = '700 ' + Math.round(22 * k) + 'px "Malgun Gothic",sans-serif';
      var dx = x + 20;
      Object.keys(DYES).forEach(function (q) {
        var t = DYES[q].label + ' ' + CONFIG.dyeChances[q] + '%';
        ctx.fillStyle = DYES[q].glow || DYES[q].color; ctx.fillText(t, dx, ly); dx += ctx.measureText(t).width + 20;
      });
      ly += lh;
    }
    var sm = CONFIG.maps.nonSmokers.indexOf(f.name) < 0;
    var ps = [sm ? { name: '흡연자 🚬', desc: '산내 금연구역 창문에 닿으면 담배를 피우느라 행동불능 (그동안 받는 피해 2배)' } : { name: '비흡연자 🚭', desc: '정발산 흡연구역의 독 피해 2배' }].concat(f.passives || []);
    if (ps.length) {
      ly = section('특성', x, ly + 4, w, '#c6ff00');
      ps.forEach(function (p) {
        ctx.font = '700 ' + Math.round(23 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff';
        ly = wrap('· ' + p.name + ' — ' + txt(p.desc), x, ly, w, lh - 2) + 2;
      });
    }
    var sy = synergiesOf(id);
    if (sy.length) {
      ly = section('시너지 (팀전)', x, ly + 4, w, '#ffe14d');
      sy.forEach(function (q) {
        var mem = q.solo ? q.solo.join(' 또는 ') + ' 혼자' : q.members().join('+');
        ctx.font = '700 ' + Math.round(23 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffe14d';
        ly = wrap('✦ ' + q.name + '  [' + mem + ']', x, ly, w, lh - 2);
        ctx.font = '500 ' + Math.round(22 * k) + 'px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#e8dfa8';
        ly = wrap(q.desc(), x + 20, ly, w - 20, lh - 4) + 2;
      });
    }
    return ly;
  }

  // ---------- 도감 ----------
  function openDex(id) { G.dexBack = G.scene; G.dexId = id || IDS[0]; G.dexTab = G.dexTab || 'char'; G.dexScroll = 0; go('dex'); }
  function statMax(key) { return Math.max.apply(null, IDS.map(function (id) { return CONFIG.chars[id][key] || CONFIG.battle.contactDamage; })); }
  function dexScene() {
    background();
    outlined(ctx, '도감', W / 2, 74, 80, '#ffffff', '#7a5cff');
    chip(40, 124, 320, 70, '캐릭터', G.dexTab === 'char', '#00c2ff', function () { G.dexTab = 'char'; G.dexScroll = 0; });
    chip(380, 124, 320, 70, '시너지', G.dexTab === 'syn', '#ffe14d', function () { G.dexTab = 'syn'; G.dexScroll = 0; });
    chip(720, 124, 320, 70, '👑 보스', G.dexTab === 'boss', '#ff2b3b', function () { G.dexTab = 'boss'; G.dexScroll = 0; });
    // 스크롤 영역: 탭 아래 ~ 뒤로 버튼 위. 내용 높이는 지난 프레임에 그린 결과로 계산
    var top = 205, bot = 1785, maxS = Math.max(0, (G.dexContentH || 0) - bot + 20);
    G.dexScroll = Math.max(0, Math.min(maxS, G.dexScroll || 0));
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, bot - top); ctx.clip(); ctx.translate(0, -G.dexScroll);
    G.hitClip = { dy: -G.dexScroll, top: top, bottom: bot };
    G.dexContentH = G.dexTab === 'char' ? dexChars() : G.dexTab === 'boss' ? dexBosses() : dexSynergies();
    G.hitClip = null;
    ctx.restore();
    if (maxS > 0) {   // 스크롤바
      var th = (bot - top) * (bot - top) / (bot - top + maxS), ty = top + (bot - top - th) * G.dexScroll / maxS;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, W - 22, top, 10, bot - top, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; roundRect(ctx, W - 22, ty, 10, th, 5); ctx.fill();
      if (G.dexScroll < maxS - 5) outlined(ctx, '▼ 스크롤', W / 2, bot - 8, 22, 'rgba(255,255,255,0.6)');
    }
    button(40, 1800, 220, 90, '◀ 뒤로', function () { go(G.dexBack === 'dex' ? 'title' : G.dexBack || 'title'); }, { size: 36, color: '#555577', color2: '#333355' });
    hint();
  }
  function dexChars() {
    // 캐릭터 고르기
    var order = [].concat.apply([], GROUPS.map(function (q) { return q.ids; }));   // 이격끼리 붙여서
    var per = 5, gx = (W - 80) / per, rr = 50, rowH = 160;
    order.forEach(function (id, i) {
      var c = CONFIG.chars[id], x = 40 + gx * (i % per) + gx / 2, y = 280 + Math.floor(i / per) * rowH, sel = G.dexId === id;
      Assets.drawBall(ctx, CHARACTERS[id], 'base', x, y, rr, 0, c.color);
      ctx.lineWidth = sel ? 7 : 4; ctx.strokeStyle = sel ? '#ffffff' : c.color;
      ctx.beginPath(); ctx.arc(x, y, sel ? rr + 4 : rr, 0, Math.PI * 2); ctx.stroke();
      outlined(ctx, CHARACTERS[id].name, x, y + rr + 22, 24, sel ? '#ffffff' : c.color);
      outlined(ctx, shortSub(id), x, y + rr + 50, 18, sel ? '#ffffff' : '#999999');
      hit(x - gx / 2, y - rr - 6, gx, rowH, function () { FX.sfx('click'); G.dexId = id; });
    });
    // 캐릭터 수만큼 그리드 줄이 늘면 상세 패널도 아래로, 패널 높이는 지난 프레임 설명 길이에 맞춤
    var id = G.dexId, f = CHARACTERS[id], c = CONFIG.chars[id], py = 280 + (Math.ceil(order.length / per) - 1) * rowH + 130;
    var ph = Math.max(900, (G.dexDetailEnd || 0) - py + 30);
    ctx.fillStyle = 'rgba(18,10,36,0.95)'; roundRect(ctx, 30, py, W - 60, ph, 26); ctx.fill();
    ctx.strokeStyle = c.color; ctx.lineWidth = 5; ctx.stroke();
    Assets.drawBall(ctx, f, 'base', 170, py + 150, 115, 0, c.color);
    ctx.lineWidth = 10; ctx.strokeStyle = c.color; ctx.beginPath(); ctx.arc(170, py + 150, 115, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.save(); ctx.textAlign = 'left';
    ctx.font = '700 62px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = c.color; ctx.fillText(f.name, 320, py + 80);
    ctx.font = '700 28px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#dddddd'; ctx.fillText(f.sub + ' · ' + f.blurb, 322, py + 122);
    var sib = groupOf(id).ids.filter(function (q) { return q !== id; });
    if (sib.length) { ctx.font = '700 22px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffe14d'; ctx.fillText('이격: ' + sib.map(function (q) { return CHARACTERS[q].sub; }).join(', '), 322, py + 154); }
    ctx.restore();
    // 스탯 막대
    var stats = [['체력', c.hp, statMax('hp'), '#ff6b8a'], ['이동속도', c.speed, statMax('speed'), '#00f0ff'],
      ['크기', c.radius, statMax('radius'), '#c6ff00'], ['박치기', c.contactDamage || CONFIG.battle.contactDamage, statMax('contactDamage'), '#ffb36b']];
    stats.forEach(function (st, i) {
      var y = py + 172 + i * 40;
      ctx.font = '700 22px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
      ctx.fillText(st[0], 322, y + 18);
      ctx.fillStyle = '#1b1530'; roundRect(ctx, 440, y, 480, 24, 12); ctx.fill();
      ctx.fillStyle = st[3]; roundRect(ctx, 440, y, 480 * st[1] / st[2], 24, 12); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'right'; ctx.fillText(String(st[1]), 1010, y + 19);
    });
    G.dexDetailEnd = drawDetail(id, 60, py + 360, W - 120, 1, true);
    return py + ph;
  }
  // 도감 · 보스: 위에 보스 고르기, 아래 상세 (페이즈 초상 · 기본 수치 · 난이도별 설명)
  function dexBosses() {
    var ids = Object.keys(BOSSES), per = 5, gx = (W - 80) / per, rr = 60, y0 = 300;
    if (ids.indexOf(G.dexBoss) < 0) G.dexBoss = ids[0];
    ids.forEach(function (id, i) {
      var bc = CONFIG.bosses[id], x = 40 + gx * (i % per) + gx / 2, y = y0 + Math.floor(i / per) * 180, sel = G.dexBoss === id;
      Assets.drawBall(ctx, BOSSES[id], 'base', x, y, rr, 0, bc.color);
      ctx.lineWidth = sel ? 8 : 4; ctx.strokeStyle = sel ? '#ffd400' : bc.color; ctx.beginPath(); ctx.arc(x, y, sel ? rr + 4 : rr, 0, Math.PI * 2); ctx.stroke();
      outlined(ctx, BOSSES[id].name, x, y + rr + 30, 26, sel ? '#ffd400' : bc.color);
      hit(x - gx / 2, y - rr - 6, gx, 170, function () { FX.sfx('click'); G.dexBoss = id; });
    });
    var id = G.dexBoss, bd = BOSSES[id], diff = G.dexBossDiff || 'easy', c = bossConfig(id, diff, 4), col = diff === 'hard' ? '#ff2b3b' : '#ffd400';
    var py = y0 + Math.ceil(ids.length / per) * 180 + 10, ph = Math.max(900, (G.dexBossEnd || 0) - py + 30);
    ctx.fillStyle = 'rgba(20,6,10,0.95)'; roundRect(ctx, 30, py, W - 60, ph, 26); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
    // 페이즈 초상 세 장
    var keys = ['base', 'p2', 'p3'], cols = [c.color, c.phase2Color, c.phase3Color];
    keys.forEach(function (k, i) {
      var yy = py + 120, r = i ? 52 : 90, xx = i ? 300 + i * 120 : 160;
      Assets.drawBall(ctx, bd, k, xx, yy + (i ? 40 : 0), r, 0, cols[i]);
      ctx.lineWidth = 6; ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(xx, yy + (i ? 40 : 0), r, 0, Math.PI * 2); ctx.stroke();
      if (i) outlined(ctx, 'PHASE ' + (i + 1), xx, yy + 40 + r + 24, 20, cols[i]);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '700 60px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffd400'; ctx.fillText(bd.name, 290, py + 78);
    ctx.font = '700 26px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText('「' + bd.title + '」', 610, py + 74);
    // 기본 수치 (도전자 4명 기준)
    ctx.font = '700 22px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#d8c8c0';
    ctx.fillText('체력 ' + Math.round(c.hp) + ' (도전자 4명 기준) · 이동속도 ' + c.speed + ' · 크기 ' + c.radius + ' · 박치기 ' + c.contactDamage, 60, py + 296);
    ctx.fillText('주는 피해 x' + (c.dmgMult || 1) + ' · 제한 시간 ' + c.maxTime + '초 · 최대 도전자 ' + CONFIG.boss.maxPlayers + '명', 60, py + 330);
    chip(640, py + 124, 180, 64, '이지', diff === 'easy', '#39c46a', function () { G.dexBossDiff = 'easy'; });
    chip(840, py + 124, 180, 64, '하드', diff === 'hard', '#ff2b3b', function () { G.dexBossDiff = 'hard'; });
    G.dexBossEnd = drawBossInfo(bd, c, 60, py + 346, W - 120);
    return py + ph;
  }
  function dexSynergies() {
    // 카드는 큰 크기 그대로, 넘치면 스크롤
    var y = 230;
    outlined(ctx, '팀전에서만 발동 · 조건이 맞는 팀의 팀원 전체에 적용 · 같은 이름의 이격도 포함', W / 2, y, 24, '#bbbbbb');
    y += 40;
    SYNERGIES.forEach(function (q) {
      var mem = q.solo || q.members(), need = q.needIds ? q.needIds() : [];
      ctx.font = '500 25px "Malgun Gothic",sans-serif';
      var lines = Math.max(1, Math.ceil(ctx.measureText(q.desc()).width / (W - 120)) + 1), ch = 300 + lines * 34;
      ctx.fillStyle = 'rgba(18,10,36,0.95)'; roundRect(ctx, 30, y, W - 60, ch, 24); ctx.fill();
      ctx.strokeStyle = q.color || '#ffe14d'; ctx.lineWidth = 4; ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '700 44px "Do Hyeon","Malgun Gothic",sans-serif'; ctx.fillStyle = q.color || '#ffe14d';
      ctx.fillText('✦ ' + q.name, 60, y + 60);
      ctx.font = '700 20px "Malgun Gothic",sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#999999';
      ctx.fillText('팀전 테두리 색', W - 110, y + 54);
      ctx.fillStyle = q.color || '#ffe14d'; ctx.beginPath(); ctx.arc(W - 80, y + 47, 16, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = '700 24px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#bbbbbb';
      ctx.fillText(q.solo ? '조건: ' + q.solo.join(' 또는 ') + '가 팀에 혼자 (모습 상관없음)'
        : '조건: 아래 ' + mem.length + '명이 모두 같은 팀' + (q.note ? ' (' + q.note + ')' : ' (모습 상관없음)'), 60, y + 100);
      var step = Math.min(150, (W - 160) / mem.length);
      mem.forEach(function (nm, k) {
        var id = need.filter(function (q2) { return CHARACTERS[q2].name === nm; })[0] || idOfName(nm);
        var x = 110 + k * step, c = CONFIG.chars[id], vs = groupOf(id).ids.length;
        Assets.drawBall(ctx, CHARACTERS[id], 'base', x, y + 175, 48, 0, c.color);
        ctx.lineWidth = 5; ctx.strokeStyle = c.color; ctx.beginPath(); ctx.arc(x, y + 175, 48, 0, Math.PI * 2); ctx.stroke();
        outlined(ctx, nm + (vs > 1 && need.indexOf(id) < 0 ? ' (이격 ' + vs + ')' : ''), x, y + 245, 22, c.color);
        hit(x - 50, y + 125, 100, 130, function () { G.dexId = id; G.dexTab = 'char'; G.dexScroll = 0; });
      });
      ctx.textAlign = 'left'; ctx.font = '500 25px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff';
      wrap(q.desc(), 60, y + 300, W - 120, 34);
      y += ch + 20;
    });
    return y;
  }

  function wrap(text, x, y, maxW, lh) {
    var line = '';
    for (var i = 0; i < text.length; i++) {
      var test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = text[i]; y += lh; }
      else line = test;
    }
    ctx.fillText(line, x, y);
    return y + lh;
  }

  // ---------- 전투 ----------
  function introPer(bt) { return Math.min(CONFIG.battle.introPerChar, 3.2 / bt.balls.length); }
  function battleScene(dt) {
    var bt = G.battle, B = CONFIG.battle;
    var introDur = bt.balls.length * introPer(bt);
    if (G.phase === 'intro') {
      G.pt += dt;
      var c = G.pt - introDur;
      if (c >= 0) {
        var n = Math.floor(c);
        if (n !== G.lastCount) {
          G.lastCount = n;
          if (n < B.countdown) { FX.sfx('count'); }
          else { FX.sfx('go'); FX.banner('FIGHT!', { color: '#ff2b6a', size: 190, life: 1.0 }); FX.shake(20); G.phase = 'fight'; }
        }
      }
    } else if (G.phase === 'fight') {
      // 배속: 전투는 언제나 1/60초 고정 단계로 진행하고, 배속이면 한 프레임에 단계를 더 많이 돌림
      // (단계 크기가 배속·화면 주사율에 따라 바뀌면 충돌·확률 판정이 달라져 결과 분포가 바뀜)
      G.acc = (bt === G.accFor ? G.acc : 0) + dt * speed(); G.accFor = bt;
      for (var st = 0; G.acc >= BATTLE_STEP - 1e-9 && !bt.over && st < 24; st++) { bt.update(BATTLE_STEP); G.acc -= BATTLE_STEP; }
      if (st >= 24) G.acc = 0;   // 너무 밀리면 따라잡지 않고 버림 (느린 기기에서 멈춤 방지)
      if (bt.over) { G.phase = 'ko'; G.pt = 0; Records.battle(bt); }
    } else if (G.phase === 'ko') {
      G.pt += dt;
      if (G.pt > 2.0) { G.scene = 'result'; G.pt = 0; if (bt.bossMode && bt.winnerTeam === 0) FX.sfx('lose'); }   // 이기면 winner 곡(배경음악), 보스에게 지면 패배음
    }

    background();
    if (bt.bossMode) {   // 보스전: 붉은 기운이 도는 배경
      var bg = ctx.createRadialGradient(W / 2, H * 0.45, 200, W / 2, H * 0.45, H * 0.8);
      bg.addColorStop(0, 'rgba(60,10,20,0.1)'); bg.addColorStop(1, 'rgba(90,10,25,0.6)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    }
    ctx.save(); ctx.translate(FX.ox, FX.oy);
    bt.draw(ctx, G.time);
    bt.viewBegin(ctx);   // 전투 파티클·숫자도 같은 배율로
    FX.drawWorld(ctx);
    FX.drawNums(ctx);
    bt.viewEnd(ctx);
    ctx.restore();
    bt.drawHUD(ctx, G.time);

    // 남은 시간
    var left = Math.max(0, (bt.maxTime || B.maxTime) - bt.time);
    // 경기장 바로 아래 줄: 버튼들 + 가운데 남은 시간 (보스전은 보스 이름판에 시간)
    var rowY = CONFIG.screen.y + CONFIG.screen.h + 14;
    if (!bt.bossMode) outlined(ctx, Math.ceil(left) + '', W / 2, rowY + 37, 52, left < 10 ? '#ff2b6a' : '#ffffff');

    if (G.phase === 'intro') drawIntro(introDur);
    FX.drawScreen(ctx);
    if (!G.record) {
      button(40, rowY, 170, 70, FX.muted ? '🔇 음소거' : '🔊 소리', function () { FX.setMuted(!FX.muted); }, { size: 28, color: '#444466', color2: '#222244' });
      button(W / 2 + 110, rowY, 180, 70, '⏩ ' + speedLabel(), function () { G.speedIdx = (G.speedIdx + 1) % CONFIG.speeds.length; }, { size: 28, color: speed() === 1 ? '#444466' : '#ff8c42', color2: '#222244' });
      button(W / 2 - 290, rowY, 200, 70, '⌂ 처음으로', function () { go('title'); }, { size: 28, color: '#444466', color2: '#222244' });
      button(W - 210, rowY, 170, 70, '↺ 재시작', startBattle, { size: 28, color: '#444466', color2: '#222244' });
    }
    hint();
  }

  function drawIntro(introDur) {
    var bt = G.battle, B = CONFIG.battle, per = introPer(bt);
    if (G.pt < introDur) {
      var i = Math.floor(G.pt / per), t = (G.pt % per) / per;
      var b = bt.balls[i], col = b.color();
      var slide = t < 0.2 ? (1 - t / 0.2) * W : t > 0.85 ? -(t - 0.85) / 0.15 * W : 0;
      ctx.fillStyle = 'rgba(5,3,12,0.65)'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(slide, 0);
      var band = bt.mode === 'team' ? bt.teamColor(b.team) : col;
      ctx.fillStyle = band; ctx.globalAlpha = 0.9; ctx.fillRect(0, 760, W, 400); ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0612'; ctx.fillRect(0, 775, W, 370);
      Assets.drawBall(ctx, b.def, b.def.portrait(b), 280, 960, 150, 0, col);
      ctx.lineWidth = 10; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(280, 960, 150, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'left';
      outlined(ctx, b.name, 690, 890, 100, col, col);
      outlined(ctx, b.def.sub, 690, 985, 38, '#ffffff');
      outlined(ctx, 'HP ' + Math.round(b.maxHp), 690, 1045, 38, '#ff6b8a');
      if (bt.bossMode) outlined(ctx, b.isBoss ? '👑 BOSS · ' + (bt.difficulty === 'hard' ? 'HARD' : 'EASY') : '도전자', 690, 1105, 40, b.isBoss ? '#ffd400' : '#7dd3ff');
      else if (bt.mode === 'team') outlined(ctx, TEAMS[b.team % TEAMS.length].label + '팀', 690, 1105, 40, band);
      ctx.restore();
      // 해당 공 하이라이트
      FX.ring(b.x, b.y, b.r, b.r * 1.5, 0.15, col, 6);
    } else {
      var c = G.pt - introDur, n = B.countdown - Math.floor(c);
      if (n >= 1) {
        var f = c % 1, s = 1.6 - f * 0.6;
        ctx.save(); ctx.globalAlpha = 1 - f * 0.7; ctx.translate(W / 2, CONFIG.arena.y + CONFIG.arena.h / 2); ctx.scale(s, s);
        outlined(ctx, String(n), 0, 0, 260, '#ffd400', '#ff2bd6'); ctx.restore();
      }
    }
  }

  // ---------- 결과 ----------
  function resultScene(dt) {
    var bt = G.battle, w = bt.winner, team = bt.mode === 'team' && bt.winnerTeam != null;
    G.pt += dt;
    background();
    bt.draw(ctx, G.time);
    ctx.fillStyle = 'rgba(5,3,12,0.78)'; ctx.fillRect(0, 0, W, H);
    var col = team ? bt.teamColor(bt.winnerTeam) : w ? w.color() : '#ffffff', cx = W / 2, cy = 820;
    // 회전 광선
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(G.time * 0.4);
    for (var i = 0; i < 14; i++) {
      ctx.rotate(Math.PI * 2 / 14);
      ctx.fillStyle = i % 2 ? col + '33' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, -1100); ctx.lineTo(90, -1100); ctx.fill();
    }
    ctx.restore();
    if (Math.random() < dt * 40) {
      var cs = ['#ffd400', '#ff2bd6', '#00f0ff', '#ffffff', col];
      FX.particle({ x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 200, vy: 200 + Math.random() * 300, g: 200, life: 4, size: 18, color: cs[Math.floor(Math.random() * cs.length)], shape: 'square', vr: 8, drag: 0.99 });
    }
    FX.drawWorld(ctx);
    var s = Math.min(1, G.pt * 3), pul = 1 + Math.sin(G.time * 5) * 0.04;
    if (w) {
      ctx.save(); ctx.translate(cx, 400); ctx.scale(pul * s, pul * s); ctx.rotate(-0.05);
      var lost = bt.bossMode && bt.winnerTeam === 0;
      outlined(ctx, lost ? 'DEFEAT' : bt.bossMode ? 'CLEAR!' : 'WINNER', 0, 0, 200, lost ? '#ff2b3b' : '#ffd400', lost ? '#550000' : '#ff2bd6'); ctx.restore();
      if (team) {
        // 이긴 팀 전원 (탈락한 팀원은 흐리게)
        var mem = bt.balls.filter(function (b) { return b.team === bt.winnerTeam; });
        var r = Math.min(170, 920 / (mem.length * 2.2)), step = Math.min(r * 2.4, 960 / mem.length);
        mem.forEach(function (b, k) {
          var x = cx + (k - (mem.length - 1) / 2) * step;
          ctx.save(); ctx.globalAlpha = b.alive ? 1 : 0.35;
          Assets.drawBall(ctx, b.def, b.def.portrait(b), x, cy, r * s, 0, b.color());
          ctx.lineWidth = 10; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, cy, r * s, 0, Math.PI * 2); ctx.stroke();
          outlined(ctx, b.name, x, cy + r + 40, Math.min(44, r * 0.5), '#ffffff');
          ctx.restore();
        });
        outlined(ctx, bt.bossMode ? (lost ? bt.boss.name + ' 승리' : '보스 격파!') : TEAMS[bt.winnerTeam % TEAMS.length].label + '팀 승리', cx, 1180, 120, col, col);
      } else {
        ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 80; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(cx, cy, 260 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        Assets.drawBall(ctx, w.def, w.def.portrait(w), cx, cy, 260 * s, 0, col);
        ctx.lineWidth = 16; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, 260 * s, 0, Math.PI * 2); ctx.stroke();
        outlined(ctx, w.name, cx, 1180, 120, col, col);
      }
      outlined(ctx, bt.bossMode ? (bt.difficulty === 'hard' ? 'HARD' : 'EASY') + ' · ' + (bt.timeUp ? '시간 초과' : Math.round(bt.time) + '초') : bt.timeUp ? '시간 종료 · 판정승' : 'K.O. 승리', cx, 1290, 48, '#ffffff');
    } else {
      outlined(ctx, 'DRAW', cx, 700, 200, '#ffffff', '#00f0ff');
      if (G.mode === 'tour' && G.tour && G.tour.cur) outlined(ctx, '토너먼트는 무승부면 같은 대진으로 재경기', cx, 900, 40, '#bff6ff');
    }
    if (G.mode === 'tour' && G.tour && G.tour.cur) button(W / 2 - 330, 1460, 660, 140, w ? '🏆 대진표로' : '🔁 재경기', tourAdvance, { color: w ? '#ffd400' : '#00f0ff', color2: '#ff2b6a', size: 56 });
    else button(W / 2 - 330, 1460, 660, 140, '다시 하기', startBattle, { color: '#ff2b6a', color2: '#ffb000', size: 60 });
    button(W / 2 - 330, 1640, 660, 120, '캐릭터 다시 고르기', function () { go('select'); }, { color: '#00c2ff', color2: '#7a5cff', size: 48 });
    button(W / 2 - 330, 1790, 660, 100, '📊 전투 기록', function () { G.scene = 'stats'; G.pt = 0; }, { color: '#ffb000', color2: '#ff2b6a', size: 42 });
    hint();
  }

  // ---------- 전투 기록: 준 피해 / 받은 피해 / 회복량 ----------
  var STAT_BARS = [['dealt', '준 피해', '#ff4d6d'], ['taken', '받은 피해', '#4dabff'], ['healed', '회복량', '#4dff88']];
  function statsScene(dt) {
    var bt = G.battle;
    G.pt += dt;
    background();
    outlined(ctx, '전투 기록', W / 2, 80, 80, '#ffffff', '#ff2bd6');
    var lx = W / 2 - 330;
    STAT_BARS.forEach(function (sb) {
      ctx.fillStyle = sb[2]; roundRect(ctx, lx, 140, 30, 30, 8); ctx.fill();
      ctx.font = '700 28px "Malgun Gothic",sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(sb[1], lx + 40, 166); lx += 240;
    });
    // 순위: 살아남은 쪽(이긴 팀 먼저, 체력 비율 높은 순) → 늦게 탈락한 순. MVP는 준 피해 1등
    var rows = bt.ranking(), mvp = bt.balls.slice().sort(function (a, b) { return b.stats.dealt - a.stats.dealt; })[0];
    var maxV = 1;
    rows.forEach(function (b) { STAT_BARS.forEach(function (sb) { maxV = Math.max(maxV, b.stats[sb[0]]); }); });
    var top = 200, rh = Math.min(175, (1760 - top) / rows.length), grow = Math.min(1, G.pt * 1.5);
    var bx = 290, bw = 620;
    rows.forEach(function (b, i) {
      var y = top + i * rh, col = b.color(), pr = Math.min(48, rh * 0.3), bh = Math.max(8, Math.min(30, rh * 0.18));
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'; roundRect(ctx, 24, y + 4, W - 48, rh - 8, 18); ctx.fill();
      ctx.save(); ctx.globalAlpha = b.alive ? 1 : 0.5;
      Assets.drawBall(ctx, b.def, b.def.portrait(b), 100, y + rh * 0.42, pr, 0, col);
      ctx.lineWidth = 5; ctx.strokeStyle = bt.mode === 'team' ? bt.teamColor(b.team) : col;
      ctx.beginPath(); ctx.arc(100, y + rh * 0.42, pr, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      outlined(ctx, b.name + (b.alive ? '' : ' ✝'), 100, y + rh * 0.42 + pr + Math.min(26, rh * 0.15), Math.min(28, rh * 0.17), col);
      var medal = ['🥇', '🥈', '🥉'][i] || '', rc = i === 0 ? '#ffd400' : i === 1 ? '#e0e0e0' : i === 2 ? '#e8a060' : '#bbbbbb';
      outlined(ctx, medal + (i + 1) + '위', 215, y + rh * 0.28, Math.min(38, rh * 0.22), rc);
      ctx.font = '700 ' + Math.round(Math.min(20, rh * 0.12)) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = b.alive ? '#7dff9a' : '#ff6b8a';
      ctx.fillText(b.alive ? '생존 ' + Math.round(Math.max(0, b.hp) / b.maxHp * 100) + '%' : '탈락 ' + Math.round(b.deadAt) + '초', 215, y + rh * 0.55);
      if (b === mvp && b.stats.dealt > 0) outlined(ctx, '👑 MVP', 215, y + rh * 0.78, Math.min(22, rh * 0.13), '#ffd400');
      STAT_BARS.forEach(function (sb, k) {
        var v = b.stats[sb[0]], by = y + rh * 0.5 + (k - 1) * (bh + Math.max(4, rh * 0.06)) - bh / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = sb[2]; roundRect(ctx, bx, by, Math.max(bh, bw * v / maxV * grow), bh, bh / 2); ctx.fill();
        ctx.font = '700 ' + Math.round(Math.min(26, bh * 0.95)) + 'px "Malgun Gothic",sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
        ctx.fillText(String(Math.round(v * grow)), bx + bw + 14, by + bh * 0.85);
      });
    });
    button(40, 1790, 300, 100, '◀ 결과', function () { G.scene = 'result'; }, { size: 40, color: '#555577', color2: '#333355' });
    if (G.mode === 'tour' && G.tour && G.tour.cur) button(W - 340, 1790, 300, 100, '대진표로', tourAdvance, { size: 40, color: '#ffd400', color2: '#ff2b6a' });
    else button(W - 340, 1790, 300, 100, '다시 하기', startBattle, { size: 40, color: '#ff2b6a', color2: '#ffb000' });
    hint();
  }

  function hint() {
    if (G.record) return;
    ctx.font = '500 22px "Malgun Gothic",sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('H 녹화모드 · R 재시작 · M 음소거 · 1~' + CONFIG.speeds.length + ' 배속' + (G.mode === 'tour' ? ' · Space 다음 경기' : '') + ' · ' + Math.round(G.fps) + 'fps', W - 20, H - 12);
  }

  // ---------- 메인 루프 ----------
  var last = performance.now();
  // ---------- 배경음악 ----------
  // 화면마다 곡: 보스전 대기(보스 로비 · 보스 도전자 고르기) = 보스 곡, 보스전 전투 = 0713, 맵 전투 = 맵 곡(작업실 0826 · 마인드 006 하우스 · 마을회관), 기본 경기장 전투 = 배그로블마크지메, 승리 결과 · 토너먼트 우승 = winner, 나머지 = 로비 곡
  // HTML <audio>의 loop는 mp3 앞뒤 무음 때문에 이음매가 끊김 → Web Audio로 디코딩해서 무음을 잘라내고 이음매 없이 반복
  var BGM_FILES = { lobby: 'assets/bgm_lobby.mp3', boss: 'assets/bgm_boss.mp3', bossFight: 'assets/bgm_bossfight.mp3', mind: 'assets/bgm_mind.mp3', hall: 'assets/bgm_hall.mp3', work: 'assets/bgm_work.mp3', field: 'assets/bgm_default.mp3', winner: 'assets/bgm_winner.mp3' };
  var bgm = { ctx: null, tracks: {} };
  function bgmPick() {
    if (FX.muted) return null;
    if (G.scene === 'battle') { var bt = G.battle, mid = bt && bt.map && bt.map.id; return !bt ? null : bt.bossMode ? 'bossFight' : mid === 'workroom' ? 'work' : mid ? mid : 'field'; }
    if (G.scene === 'result' && G.battle) {   // 이기면 winner, 보스에게 지면 패배음만 잠깐 뒤 로비 곡, 무승부는 로비 곡
      var rb = G.battle, won = (rb.winner || rb.winnerTeam != null) && !(rb.bossMode && rb.winnerTeam === 0);
      if (won) return 'winner';
      if (rb.bossMode && G.pt < 2.5) return null;
    }
    if (G.scene === 'bracket' && G.tour && G.tour.champion) return 'winner';
    if (G.scene === 'bossLobby' || (G.scene === 'select' && G.mode === 'boss')) return 'boss';
    return 'lobby';
  }
  function bgmLoad(key) {
    var tr = bgm.tracks[key] = { vol: 0, gain: bgm.ctx.createGain() };
    tr.gain.gain.value = 0; tr.gain.connect(bgm.ctx.destination);
    fetch(BGM_FILES[key]).then(function (r) { return r.arrayBuffer(); })
      .then(function (a) { return new Promise(function (res, rej) { bgm.ctx.decodeAudioData(a, res, rej); }); })
      .then(function (buf) {
        var ch = [], th = 0.002, s0 = 0, e0 = buf.length - 1, c;
        for (c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
        function loud(i) { for (var k = 0; k < ch.length; k++) if (Math.abs(ch[k][i]) > th) return true; return false; }
        while (s0 < e0 && !loud(s0)) s0++;
        while (e0 > s0 && !loud(e0)) e0--;
        tr.buf = buf; tr.ls = s0 / buf.sampleRate; tr.le = (e0 + 1) / buf.sampleRate;
        bgmStart(tr);
      })
      .catch(function (err) { console.warn('[볼파이트] 배경음악 로딩 실패: ' + key, err); });
    return tr;
  }
  // 처음부터 재생 (winner는 이길 때마다 처음부터)
  function bgmStart(tr) {
    if (!tr.buf) return;
    if (tr.src) try { tr.src.stop(); } catch (e) {}
    var src = bgm.ctx.createBufferSource();
    src.buffer = tr.buf; src.loop = true; src.loopStart = tr.ls; src.loopEnd = tr.le;
    src.connect(tr.gain); src.start(0, tr.ls); tr.src = src;
  }
  // 브라우저는 사용자가 한 번 누르기 전엔 소리를 못 냄 → 첫 입력 때 만들기
  function bgmUnlock() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!bgm.ctx) bgm.ctx = new AC();
    else if (bgm.ctx.state === 'suspended' && bgmPick()) bgm.ctx.resume();
  }
  // 곡이 바뀌면 서로 교차해서 바뀜. 전부 꺼지면 그 자리에서 멈춤 → 돌아오면 이어서
  function bgmUpdate(dt) {
    if (!bgm.ctx) return;
    var want = bgmPick(), any = false;
    if (want && !bgm.tracks[want]) bgmLoad(want);
    if (want === 'winner' && bgm.prev !== 'winner') { bgmStart(bgm.tracks.winner); bgm.tracks.winner.vol = CONFIG.sound.bgm.winner; }   // 승리하면 처음부터 바로
    bgm.prev = want;
    Object.keys(bgm.tracks).forEach(function (k) {
      var tr = bgm.tracks[k], to = k === want ? CONFIG.sound.bgm[k] : 0;
      tr.vol += Math.max(-dt * 0.8, Math.min(dt * 0.8, to - tr.vol));
      tr.gain.gain.value = tr.vol;
      if (tr.vol > 0.001) any = true;
    });
    if (want && bgm.ctx.state === 'suspended') bgm.ctx.resume();
    else if (!want && !any && bgm.ctx.state === 'running') bgm.ctx.suspend();
  }

  function frame(now) {
    var raw = (now - last) / 1000; last = now;
    var dt = Math.min(0.05, raw);
    G.fps += (1 / Math.max(raw, 1e-3) - G.fps) * 0.05;
    G.time += dt;
    G.hits = [];
    var fxScale = G.scene === 'battle' && G.phase === 'ko' ? 0.35 : G.scene === 'battle' && G.phase === 'fight' ? speed() : 1;
    FX.update(dt * fxScale);
    bgmUpdate(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 화면 하나에서 오류가 나도 게임 전체가 멈추지 않게: 기록만 하고 다음 프레임은 계속 돈다
    try {
      if (G.scene === 'title') titleScene(dt);
      else if (G.scene === 'select') selectScene(dt);
      else if (G.scene === 'battle') battleScene(dt);
      else if (G.scene === 'result') resultScene(dt);
      else if (G.scene === 'dex') dexScene(dt);
      else if (G.scene === 'stats') statsScene(dt);
      else if (G.scene === 'bracket') bracketScene(dt);
      else if (G.scene === 'records') recordsScene(dt);
      else if (G.scene === 'bossLobby') bossLobbyScene(dt);
    } catch (err) {
      if (!G.lastErr || G.time - G.lastErr > 2) { G.lastErr = G.time; console.error('[볼파이트] ' + G.scene + ' 화면 오류:', err); }
      ctx.restore && ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
