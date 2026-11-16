// 누적 전적: 캐릭터별 1:1 승패, 3인 이상 개인전 1등/참가, 토너먼트 우승/준우승, 팀전 승패. 브라우저 localStorage에 저장 (없으면 메모리에만)
var Records = {
  KEY: 'ballfight.records.v1',
  data: null,
  load: function () {
    var d = null;
    try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; }
    this.data = d && d.chars ? d : { chars: {} };
    return this.data;
  },
  save: function () { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 저장 불가(사생활 모드 등): 이번 실행 동안만 유지 */ } },
  get: function (id) {
    if (!this.data) this.load();
    var c = this.data.chars[id];
    if (!c) c = this.data.chars[id] = { duelW: 0, duelL: 0, ffaW: 0, ffaL: 0, champ: 0, runner: 0, teamW: 0, teamL: 0 };
    if (c.ffaW == null) { c.ffaW = 0; c.ffaL = 0; }   // 예전 기록에 없던 칸
    return c;
  },
  // 전투 한 판 결과 (같은 Battle은 한 번만): 2명 개인전(토너먼트 경기 포함) → 1:1, 3명 이상 개인전 → 1등만 승, 팀전 → 팀전 승패
  battle: function (bt) {
    if (!bt || !bt.over || bt.recorded) return;
    bt.recorded = true;
    if (bt.bossMode) return;   // 보스전은 전적에 안 넣음
    var self = this, base = function (b) { return b.baseId || b.def.id; };
    if (bt.mode === 'team') {
      if (bt.winnerTeam == null) return;
      bt.balls.forEach(function (b) { var c = self.get(base(b)); if (b.team === bt.winnerTeam) c.teamW++; else c.teamL++; });
    } else if (bt.balls.length === 2 && bt.winner) {
      bt.balls.forEach(function (b) { var c = self.get(base(b)); if (b === bt.winner) c.duelW++; else c.duelL++; });
    } else if (bt.balls.length >= 3 && bt.winner) {
      bt.balls.forEach(function (b) { var c = self.get(base(b)); if (b === bt.winner) c.ffaW++; else c.ffaL++; });
    } else return;
    this.save();
  },
  tournament: function (champId, runnerId) {
    if (champId) this.get(champId).champ++;
    if (runnerId) this.get(runnerId).runner++;
    this.save();
  },
  reset: function () { this.data = { chars: {} }; this.save(); },
};
