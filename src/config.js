// 모든 밸런스/연출 수치는 여기서 조절한다.
// 밸런스 조정(시뮬레이션 기준): 바통 200→180, 이비 150→170, 삼식이 130→190, 긋기 쿨 3→2초, 출혈 초당 4→3 / 지속 3→5초
var CONFIG = {
  W: 1080,
  H: 1920,
  arena: { x: 40, y: 470, w: 1000, h: 1280 },   // 경기장 바로 아래에 버튼 줄이 오도록 아래로
  screen: { x: 40, y: 470, w: 1000, h: 1280 },   // 화면에 그리는 경기장 자리 (보스전은 arena가 더 넓고 축소해서 그림)

  battle: {
    maxTime: 180,           // 최대 전투 시간(초). 끝나면 체력 비율 높은 쪽 승리
    contactDamage: 5,       // 몸통 충돌 데미지
    contactCooldown: 0.5,   // 같은 상대에게 접촉 데미지 쿨다운
    effectCooldown: 1.0,    // 접촉 발동 효과(긋기/염색 등) 같은 상대 내부 쿨다운
    phase2Ratio: 0.5,       // 이 비율 이하로 체력이 떨어지면 페이즈 2
    phaseFreeze: 0.7,       // 페이즈 전환 시 시간 정지(초)
    phase2FirstDelay: 1.0,  // 페이즈 2 진입 후 2스킬 첫 발동까지(초)
    hitstop: 0,             // 일반 타격 히트스톱(초): 매 타격 멈춤이 렉처럼 느껴져서 없앰
    bigHitstop: 0.06,       // 큰 데미지 히트스톱(초)
    hitstopGap: 0.35,       // 한 번 멈춘 뒤 이 시간 안에는 다시 안 멈춤
    bigHitDamage: 18,       // 이 이상이면 큰 히트
    disabledFriction: 2.5,  // 스턴/빙결 중 감속
    introPerChar: 0.8,      // 시작 전 캐릭터 소개 시간(1명당)
    countdown: 3,
  },

  status: {
    blindMissChance: 0.8,   // 실명 중 스킬 빗나갈 확률 (삼식이 하양)
    blindAreaOffset: 420,   // 실명 중 범위 스킬 중심이 어긋나는 거리
  },

  fx: {
    shake: true,            // false면 화면 흔들림 끔
    shakeScale: 1.0,
    hitSparks: true,
  },

  sound: { volume: 0.45, bgm: 0.5 },   // bgm: 로비 배경음악 볼륨 (전투 화면 빼고 전부)

  speeds: [0.5, 1, 1.5, 2, 3],   // 전투 배속 (전투 화면 버튼 / 숫자키 1~5)

  // ---------- 보스전 ----------
  boss: { viewScale: 0.7, maxPlayers: 8 },   // 보스전 화면 배율: 경기장이 1/0.7배 넓어지고 모든 게 0.7배로 보임 / 도전자 최대 인원
  teamViewScale: 0.82,   // 팀전 화면 배율 (보스전보다 조금 크게)

  // ---------- 맵 (개인전·팀전·토너먼트) ----------
  maps: {
    nonSmokers: ['서리', '최휘', '조하람'],   // 특성 비흡연자 (이름 기준, 나머지는 흡연자)
    workroom: { swap: 30 },                   // 작업실: 시작할 때 산내/정발산 중 하나, 그 뒤 30초마다 다시 뽑음
    sannae: {
      notchW: 0.24, notchH: 0.15,             // 오른쪽 위 파인 곳 (경기장 가로 대비)
      window: 170, smokeTime: 3, smokeCd: 6, smokeTaken: 2,   // 금연구역 창문: 닿으면 흡연(행동불능), 그동안 받는 피해 2배
      punk: 0.3, rentEvery: 10, rent: 5, rentCap: 20,         // 조하람 전용: 긴급소집 펑크 확률 / 월세 흡수
      blanket: { every: 9, max: 2, sleepMax: 12 },            // 함정: 수면 (다른 플레이어에게 맞으면 깸, 최대 12초)
      pizza: { every: 12, max: 3, heal: 20 },
    },
    jbs: {
      smokeEvery: 1.1, smokeMax: 9, smokeRadius: 150, poisonDps: 6, poisonTime: 1.2, vent: 10, nonSmokerPoison: 2,
      split: 10,                              // 2층 공간: 10초 분리 · 10초 통합 반복
      chair: { every: 15, max: 2, damage: 20, samsik: 30, speed: 1400 },
      king: { every: 3, max: 4, heal: 15, soju: 0.1, sojuTaken: 0.7, sojuTime: 8, sleep: 8 },
    },
    hall: {
      trashEvery: 14, trashMax: 18, trashR: 34, trashSlow: 0.75, trashSlowTime: 0.8, cleanEvery: 0.7,   // 쓰레기: 밟으면 잠시 이동속도 x0.75
      wellusHeal: 1.3,                                                        // 이장님 웰우스 개방 회복량
      pcTime: 3, yooMul: 2, pcCd: 6, chiefCd: 4, codeBuff: 1.1, stockDown: 0.7, stockSmash: 0.1, seoriSmash: 0.3, brokenTime: 20,
      ow: ['한규성', '유재후', '진형권', '차승민', '이윤빈'], roblox: ['유재운', '김선율', '조하람', '조우연'],
      yuk: { every: 9, max: 2, heal: 10, soup: 20, tick: 0.25, spill: 0.05 }, angerTime: 6, angerMul: 1.3,   // 육개장 국물 쏟으면 문남휘 공격력 x1.3
    },
    mind: {
      spawn: 5, maxUndead: 1, undeadLife: 16, undeadSpeed: 80, orbit: 120, orbitSpeed: 2.4, touch: 3,
      rehearsal: 15, away: 5, poisonDps: 6, poisonTime: 3, slow: 0.6, slowTime: 3, jooRespawn: 20,
      ramen: { every: 9, max: 2, heal: 10, soup: 20, tick: 0.25, spill: 0.05 },   // 편의점 라면: 바로 10 + 국물 0.5초마다 1씩 총 20 (5% 쏟음, 마시다 맞으면 쏟음)
    },
  },
  // 보스 수치: 기본값 위에 easy / hard 값을 덮어씀. 체력 = hpPerPlayer x 도전자 수^hpExp (인원 많으면 광역기가 나눠 맞아서)
  bosses: {
    heroBaton: {   // 히어로 바통
      hpPerPlayer: 180, hpExp: 1.45, speed: 300, radius: 180,   // 넓은 경기장 기준 (화면엔 x0.7: 반지름 약 126)
      color: '#ffd400', phase2Color: '#ff8a00', phase3Color: '#ff2b3b',
      contactDamage: 6, dmgMult: 1, maxTime: 300,
      izkRage: 1.1,              // 패시브 울분: IZK 소속에게 주는 피해 배율
      phases: [0.66, 0.33],      // 이 체력 비율 이하로 페이즈 2, 3
      ccCap: 0.4,                // 스턴·빙결은 최대 이 시간까지만
      cd: 3.2, firstCast: 2.0,   // 스킬 사이 간격, 첫 스킬까지
      phaseCd: [1, 0.82, 0.65],  // 페이즈 1·2·3의 스킬 간격 배율 (갈수록 빨라짐)
      pools: { 1: ['roll', 'hot6'], 2: ['wallet', 'origin'], 3: ['joke', 'roll'] },   // 바지 강림은 페이즈 3 고유 쿨타임 (baccarat.cd)
      cumulative: false,         // true면 이전 페이즈 스킬도 섞어 씀
      scream: { damage: 14 },                                   // 패시브 끼야아아악: 페이즈 바뀔 때 맵 전체
      wash: { time: 3.5, heal: 0.15 },                          // 패시브 일단 씻고 오겠습니다: 페이즈 3에서 최대 체력의 heal만큼 회복
      roll: { rolls: 2, speed: 1500, damage: 18, windup: 0.45, aoe: 130, aoeDamage: 8 },
      hot6: { boxes: 1, size: 1.35, life: 14, damage: 12, bullets: 12, bulletDamage: 4,   // 한 박스 (size: 크기 배율)
              bulletSpeed: 520, buffTime: 6, buffSpeed: 1.4, buffAtk: 1.3 },
      wallet: { coins: 5, speed: 700, heal: 6, stun: 1.5, money: 20 },   // 지폐 (IZK 소속은 무효). money: 최휘 잔고에 들어가는 돈
      origin: { chain: [0.7, 0.3], speed: 1700, damage: 24, knock: 1500, warn: 0.8, out: 0.7 },   // chain: 이동 후 다시 이동할 확률 (차례대로)
      joke: { count: 5, speed: 600, damage: 8, atkMul: 0.75, time: 6 },   // IZK 소속은 무효
      // 바지 강림: 페이즈 3부터 first초 뒤, 이후 cd초마다. 플 = blasts번 원형 폭발(반경 blastRadius, blastGap초 간격) / 뱅 = 추적 번개 (근처는 splash배)
      baccarat: { cd: 7, first: 2, flip: 1.0, tieChance: 0.1, tieDamage: 22, tieBlasts: 10, tieBlastRadius: 160, tieBlastDamage: 12, tieTint: 2.4, blasts: 6, blastRadius: 170, blastDelay: 0.8, blastGap: 0.15, playerDamage: 18, bankerDamage: 45, bankerDelay: 0.8, bankerRadius: 210, splash: 0.6, strikeScale: 2.8 },
      song: { at: 0 },           // 하드 전용 노광석의 힘 (0 = 안 씀)
      synergyBonus: null,        // 도전자 팀 시너지 하나당 도전자 { damage, hp } 상승 (이지 전용)
      easy: { hpPerPlayer: 185, dmgMult: 1.1, cd: 3.3, baccarat: { cd: 9, blasts: 4 } },   // 이지 기준: 4명 + 시너지 하나로 30% 안팎
      hard: {
        hpPerPlayer: 135, dmgMult: 1.1, cd: 3.25, contactDamage: 8, cumulative: true, phaseCd: [1, 0.9, 0.78],   // 하드 기준: 8명 + 시너지 두 개 팀
        scream: { damage: 20 }, wash: { heal: 0.25 },
        roll: { rolls: 3 }, hot6: { bullets: 16 }, wallet: { coins: 8, stun: 2 },
        joke: { count: 8, atkMul: 0.65 }, baccarat: { cd: 5.5, blasts: 10, bankerDamage: 55 },
        // 노광석의 힘: 체력 at 이하에서 한 번, 맵 위 가운데서 time초 동안 every초마다 파장 (gaps개의 틈으로 피할 수 있음)
        song: { at: 0.25, time: 7, every: 0.7, speed: 560, width: 52, gaps: 1, gapDeg: 44, damage: 7 },   // 틈 하나, 좁고 빠르게 (대신 한 번 피해는 작게)
      },
    },
  },

  // 팀전 시너지 (조건은 이름 기준: 같은 이름의 이격도 그 사람으로 침)
  synergy: {
    uninvited: { hp: 3, damage: 3, speed: 3 },                     // 초대받지 못한 손님: 팀에 유재후 또는 ???가 혼자일 때 배율 (2스킬 끼야아아악은 피해 배율 없이 확정 2연타)
    izk: { members: ['한규성', '김선율', '조우연', '조하람'], damage: 1.2, taken: 0.9 }, // IZK 1기: 네 명이 같은 팀이면 주는 피해 +20%, 받는 피해 -10%
    ssabang: { members: ['문남휘', '진형권', '한규성', '유재운'], hp: 1.2, damage: 1.1, cdr: 1.053 }, // 싸방: 문남휘·진형권·한규성·유재운이 같은 팀이면 체력 +20%, 주는 피해 +10%, 스킬 쿨타임 5% 감소
    hwajeong: { members: ['유재후', '한규성'], needIds: ['predator'], damage: 1.2, hp: 1.15 },   // 화정듀오: 유재후 + 한규성(포식자의 모습)
    // 정발산: IZK 넷 + 유재후. 이동속도 x speed, 주는 피해 x decayDamage에서 decayTime초에 걸쳐 1까지 감소. IZK는 긴급소집 효과만 남음
    // nogwangRange/nogwangHeal: 노광석의 모습 유재후의 포코의 불협화음 범위·팀원 회복량 배율
    jeongbalsan: { members: ['한규성', '김선율', '조우연', '조하람', '유재후'], speed: 1.4, decayDamage: 1.3, decayTime: 120, nogwangRange: 1.3, nogwangHeal: 1.6 },
    // 서울방송고: 팀 전체 받는 회복 x heal, 스킬 쿨타임이 cdr배 빨리 돎 / per: 그 사람만 추가
    seoulbc: { members: ['최휘', '문남휘', '유재운', '차승민'], heal: 1.1, cdr: 1.15, per: { '최휘': { damage: 1.2 } } },
    // 디마디영디: 한규성(이비만)·문남휘·유재운·진형권·이윤빈·??? 한 팀. 팀 체력 x hp + 멤버별 고유 효과
    dmdyd: { members: ['한규성', '문남휘', '유재운', '진형권', '이윤빈', '???'], needIds: ['ibi'], hp: 1.1, chiefMul: 1.3, chiefTaken: 1.3, devAlly: 0.02, devAllyMax: 10, gyusuniCd: 1.3, stinkMul: 2, gymSpawn: 0.75, chinoGrow: 0.334, ripleyCall: 10 },
    dogowner: { members: ['유재후', '서리'], droolRate: 1.6, per: { '서리': { speed: 1.3, damage: 1.1 }, '유재후': { speed: 0.8 } } },   // 개와 주인 (droolRate: 서리 침흘리기 빈도 배율)
  },

  // 삼식이 염색 확률 (합계 100)
  dyeChances: { red: 20, yellow: 20, blue: 20, shaved: 20, black: 10, white: 10 },

  chars: {
    baton: {
      hp: 180, speed: 430, radius: 74, color: '#ffd400', phase2Color: '#ff6a00',
      roll: { cd: 4, distance: 600, speed: 1600, damage: 15, shake: 14 },
      scream: { cd: 9, damage: 20, doubleChance: 0.3, doubleDelay: 0.6, shake: 34, missRadius: 520 },
    },
    ibi: {
      hp: 170, speed: 480, radius: 70, color: '#b04dff', phase2Color: '#00f0ff', phase2Ratio: 0.7,   // 한규성: 체력 70%에서 페이즈 2
      stone: { cd: 3, damage: 18, speed: 1400, shake: 9 },
      awaken: { cd: 12, introTime: 0.9, darkness: 0.8, fadeOut: 1.2, weights: { birds: 1, lucha: 1, toka: 1, waterbomb: 1 } },
      waterbomb: { time: 3, shots: 18, spin: 9, minDist: 150, maxDist: 520, damage: 8, puddleR: 70, puddleLife: 2.5, slip: 1.5, slipTime: 1, menhera: { time: 4, slow: 0.6, dps: 4 } },
      birds: { count: 3, damage: 12, life: 4, speed: 640, turn: 5.5, shake: 8 },
      lucha: { riseTime: 0.7, hangTime: 0.25, fallTime: 0.22, radius: 220, damage: 25, knockback: 1100, shake: 30 },
      toka: { jumps: 3, jumpTime: 0.55, waveRadius: 300, waveSpeed: 900, damage: 10, shake: 14 },
    },
    samsik: {
      hp: 190, speed: 540, radius: 66, color: '#ff3355', phase2Color: '#ffffff',
      phase2Speed: 1.08,   // 페이즈 2 이동속도 배율
      slash: { cd: 2, bleedDps: 3, bleedTime: 5, maxStacks: 5, shake: 10 },
      dye: {
        interval: 8, rouletteTime: 0.8,
        multiBW: 0.3,   // 긴급소집 복합 염색에서 검정+하양이 나올 확률 (나머지는 빨강+파랑+노랑+삭발)
        red: { damage: 10, burnDps: 4.5, burnTime: 3 },
        yellow: { damage: 8, stun: 1.8, speedMul: 1.2 },   // speedMul: 노랑(번개)인 동안 추가 이동속도 배율
        blue: { damage: 8, freeze: 2.5, shatterDamage: 25 },
        shaved: { waves: 3, interval: 0.8, radius: 250, damage: 8, shake: 30 },   // interval: 지진 파동 사이 간격(초)
        black: { vanish: 0.8, damage: 20 },
        white: { damage: 8, linger: 0.5, guard: 0.2 },   // 하양 동안 받는 모든 피해 x guard(80% 무시). 팀전은 같은 팀 전원. 색이 바뀌면 linger초 뒤 해제
      },
    },
    ch: {
      hp: 180, speed: 460, radius: 70, color: '#39ff88', phase2Color: '#ff8a00',
      // 1스킬 배앰: 무작위로 돌아다니는 뱀(개수 제한 없음). 적에게 닿으면 데미지를 주고 사라짐
      snake: { cd: 2.8, max: 10, damage: 10, femaleMultiplier: 2, speed: 260, turn: 2.5, segments: 14 },
      // 2스킬 텐트치기(패시브): 몸에서 솟은 부위가 회전하며 닿는 적에게 데미지, 뱀에 닿으면 길어지고 빨라짐
      tent: { length: 60, width: 22, damage: 12, hitCooldown: 0.6, spin: 3.0,
              growLength: 25, growSpin: 0.7, maxLength: 230, maxSpin: 9, snakeCooldown: 1.2 },
    },
    hxpwm: {
      hp: 165, speed: 450, radius: 70, color: '#4d7cff', phase2Color: '#ffe14d',
      antiYoo: 1.5,        // 캐릭터 패시브: 유재후(모든 모습)에게 주는 피해 배율
      // 1스킬 주뱃(패시브): interval초마다 충전기 생성(최대 maxChargers개)
      // 적이 먹으면 초음파 확정 피해, 본인이 먹으면 happyTime초간 이동속도 x happySpeed, 받는 피해 x happyTaken
      charger: { interval: 4, maxChargers: 3, ultraDamage: 14, happyTime: 4, happySpeed: 0.5, happyTaken: 0.5 },
      // 2스킬 긴급소집: duration초간 멈춰서 interval초마다 맵 가장자리에서 뱀/돌/칼이 날아옴
      call: { cd: 15, duration: 2, interval: 0.4, snakeSpeed: 650, knifeSpeed: 1500, knifeDamage: 8 },
    },
    dev: {   // 문남휘
      hp: 165, speed: 420, radius: 70, color: '#c6ff00', phase2Color: '#ff2bd6',
      contactDamage: 5,    // 몸통 박치기 데미지 (기본 5 대신)
      // 1스킬 밸런스 패치(패시브): 닿을 때마다 상대 스탯 x(1-rate), 본인 x(1+rate). 최대 maxStacks회까지 중첩
      patch: { rate: 0.05, bossRate: 0.02, maxStacks: 15 },   // bossRate: 보스에게 주는 스탯 감소
      // 2스킬 치트: charge초 조준 후 fire초 동안 굵은 레이저
      // damage x (1 + perPatch x 패치 횟수): 0회 5 → 15회 약 16 (공격력 배율은 따로)
      cheat: { cd: 9, charge: 0.6, fire: 0.35, width: 70, damage: 5, perPatch: 0.15, shake: 26 },
    },
    rock: {  // 유재운
      hp: 175, speed: 440, radius: 70, color: '#ff8c42', phase2Color: '#9acd32',
      // 1스킬 들린다고: 음파 반경/속도/데미지, 맞은 적 1명당 쿨타임 refund초 감소
      bass: { cd: 3, radius: 520, speed: 900, damage: 17, refund: 1.0, refundMax: 1, shake: 12 },   // refundMax: 한 번 연주에 쿨감 적용 횟수
      // 2스킬 연습 후 발냄새(패시브): 반경 안의 적에게 가장자리 minDps ~ 중심 maxDps
      stink: { radius: 240, minDps: 2, maxDps: 8 },
    },
    gym: {   // 진형권 (기본 체력 최고)
      hp: 290, speed: 400, radius: 80, color: '#9ad0ff', phase2Color: '#ff5e5e',
      contactDamage: 9,    // 몸통 박치기 데미지 (기본 5 대신)
      antiUninvited: 2,    // 캐릭터 패시브: 초대받지 못한 손님에게 주는 피해 배율 (개인전에선 유재후)
      snakeTaken: 0.5,     // 페이즈 2에서 조우연의 뱀에게 받는 피해 배율
      vitaminTaken: 0.5,   // 단백질 먹방: 포식자 비타민에게 받는 피해 배율
      // 1스킬 벌크업(패시브): 아령. 본인: 최대체력+hp, 체력 heal 회복, 공격력 x atk, 크기 x size(최대 maxRadius) / 적: slowTime초 이동속도 x slowMul
      dumbbell: { interval: 5, max: 2, hp: 14, heal: 8, atk: 1.1, size: 1.06, maxRadius: 115, slowTime: 3, slowMul: 0.5 },
      // 2스킬 단백질 먹방(패시브): 프로틴. 본인: heal 회복 + hasteTime초 이동속도 x hasteMul / 다른 사람: otherHeal 회복
      protein: { interval: 6, max: 2, heal: 15, hasteTime: 4, hasteMul: 1.5, otherHeal: 5 },
    },
    psych: {   // 진형권 (심리학자의 모습)
      hp: 240, speed: 420, radius: 76, color: '#7ad1ff', phase2Color: '#ffe680',
      contactDamage: 7, antiUninvited: 2,   // 특성 손님 사냥꾼은 헬스장 진형권과 같음
      // 1스킬: 고정 타겟에게 돌진 (같은 적 marks번 맞히면 표식), turn: 돌진 중 타겟 쪽으로 꺾는 정도(라디안/초)
      pavlov: { cd: 3.5, speed: 1500, distance: 900, damage: 14, marks: 3, turn: 4 },
      pavlov2: { cd: 7 },   // 2스킬: 표식 찍힌 적 전원에게 pavlov.damage
    },
    ripley: {   // ??? (리플리의 모습)
      hp: 175, speed: 460, radius: 70, color: '#5a5a7a', phase2Color: '#ff2bd6',
      firstChange: 1.5,   // 시작 후 첫 변신까지(초)
      interval: 7,        // 변신 주기(초)
      firstCast: 1.0,     // 변신 직후 1스킬 첫 발동까지(초)
      glitchTime: 0.6,    // 변신 글리치 연출 시간(초)
    },
    chino: {  // 이윤빈 (치노의 모습)
      hp: 200, speed: 480, radius: 68, color: '#ff9ecf', phase2Color: '#b6ff00',
      contactDamage: 11,   // 공격 스킬이 없어서 박치기가 셈
      // 1스킬 내 전담 어딨어(패시브): 전담이 맵에 하나 생김. 못 찾는 동안 growEvery초마다 모든 스탯 x(1+growRate) (최대 maxGrow배)
      //   찾으면(닿으면) 스탯 초기화, respawn초 뒤 새 전담
      vape: { respawn: 4, growEvery: 3, growRate: 0.08, maxGrow: 2.5 },
      // 2스킬 기억력 감퇴(패시브, 페이즈 2): 맞은 걸 까먹고 피해 무효화 (hitCd초 쿨타임)
      //   전담을 찾아도 까먹어서 초기화 안 됨 (vapeCd초 쿨타임, 따로 돎)
      forget: { hitCd: 4, vapeCd: 12 },
    },
    seori: {  // 서리 (애완견의 모습)
      hp: 200, speed: 500, radius: 62, color: '#e8b46a', phase2Color: '#ff7ab6',
      contactDamage: 8,
      batonDeal: 0.5,      // 캐릭터 패시브: 유재후에게 주는 피해 배율
      // 1스킬 침흘리기(패시브): every초마다 지나간 자리에 침 웅덩이(반경 r, life초). 밟은 적: 초당 dps 피해 + 이동속도 x slowMul
      drool: { every: 0.18, r: 46, life: 3.5, dps: 5, slowMul: 0.6 },
      // 2스킬 물기: 가까운 적에게 돌격(dashSpeed, 최대 dashTime초) → 물면 hold초 동안 매달림
      //   물 때 damage, 매달린 동안 tick초마다 tickDamage + 큰 침(bigR) 퍼뜨림
      bite: { cd: 3, dashSpeed: 1500, dashTime: 0.45, damage: 15, hold: 1.0, tick: 0.25, tickDamage: 5, bigR: 95, holdSlow: 0.25 },
    },
    seyu: {   // 차승민 (세유의 모습)
      hp: 180, speed: 430, radius: 70, color: '#ffcc00', phase2Color: '#ff3030',
      contactDamage: 8,
      chase: 1.9,          // 캐릭터 패시브: 상대에게 다가갈 때 이동속도 배율
      // 1스킬 정신나간 세트(패시브): 닿으면 delay초 뒤 한 번 더 때림 (박치기 데미지 x mult)
      set: { delay: 0.22, mult: 1.5 },
      // 2스킬 강펀치: 쿨이 차면 준비 → 상대가 범위에 들어오면 charge초 기 모으고 타격. 위력 = base + 받은 피해 x perTaken (최대 max)
      //   가운데일수록 x centerMul, 가장자리일수록 x edgeMul. center: 정타 줄 폭(비율)
      punch: { cd: 8.5, base: 18, perTaken: 1.0, max: 70, length: 420, near: 130, far: 400, grow: 0.6, charge: 0.35, fade: 0.4, centerMul: 1.35, edgeMul: 0.6, center: 0.3 },
    },
    hau: {    // 최휘 (사랑하우의 모습)
      hp: 190, speed: 450, radius: 70, color: '#57d36b', contactDamage: 7, phase2Color: '#ff3b3b',
      // 캐릭터 패시브 계좌: 잔고 0~max. pay초마다 알바비 +payAmt
      //   잔고 많을수록 주는 피해·이동속도 x richMul, 적을수록 x poorMul (사이 직선 보간)
      //   잔고가 max면 crashDelay초 뒤 사고로 절반 / 잔고 0에서 적과 부딪히면 bankrupt 피해(본인 selfDamage) 후 절반으로 복구
      account: { max: 100, start: 50, pay: 3, payAmt: 6, richMul: 0.8, poorMul: 1.4, crashDelay: 3, bankrupt: 32, selfDamage: 12 },
      // 1스킬 급등주: 주식 한 칸. upChance 확률로 +step, 아니면 -step 하고 반경 radius 범위 공격 damage
      stock: { cd: 2, upChance: 0.3, step: 10, radius: 420, damage: 11 },
      // 2스킬 급락 구간: 주식이 2배로 떨어짐 (잔고 -step*2, 범위·피해 x crashMul)
      plunge: { cd: 7, crashMul: 1.6 },
    },
    nogwang: {  // 유재후 (노광석의 모습)
      hp: 175, speed: 440, radius: 72, color: '#9b5cff', phase2Color: '#ff2b6a',
      // 1스킬 핫식스 쟁여놓기(패시브): interval초마다 핫식스 포도맛 생성(최대 max개)
      //   적이 먹으면 공격력 영구 x enemyAtk / 같은 팀·본인이 먹으면 공격력 x allyAtk, 이동속도 x allySpeed (영구)
      hot6: { interval: 5.5, max: 3, enemyAtk: 0.88, allyAtk: 1.12, allySpeed: 1.06, maxStacks: 6 },   // maxStacks: 한 사람당 효과 최대 횟수
      // 2스킬 포코의 불협화음: 진행 방향 부채꼴(반경 radius, 반각 angle도) 기타 파동. IZK 멤버에겐 x izkMul
      poco: { cd: 4.5, radius: 680, angle: 55, damage: 16, knock: 2300, allyHeal: 10, allyKnock: 900,   // allyHeal/allyKnock: 같은 팀에게
              izkMul: 1.5, shake: 18 },
    },
    sy: {     // 김선율 (김선율의 모습) — 기본 체력 적음
      hp: 50, speed: 470, radius: 64, color: '#ff8fb1', phase2Color: '#00e5ff',
      // 1스킬 낯가림: 맵 밖으로 vanish초 사라졌다가 등장하며 가장 가까운 적 단일 공격
      femaleDeal: 0.5,     // 캐릭터 패시브: 여성 캐릭터에게 주는 피해 배율 (이윤빈 제외)
      shy: { cd: 4, vanish: 1.0, damage: 1 },
      // 2스킬 방구석 여포: 체력 0이 되면 구석으로 가서 키보드(cutscene초) → 체력 reviveHp로 부활, 구석 고정
      //   every초마다 드립을 무작위 방향으로 난사: 폭발 반경 radius, damage (드립에 이름이 나오는 상대는 x relatedMul)
      yeopo: { cutscene: 1.4, reviveHp: 20, every: 0.12, speed: 720, radius: 105, damage: 11, relatedMul: 1.5, shake: 9 },
    },
    chief: {  // 문남휘 (이장님의 모습) — 팀전 버프형
      hp: 150, speed: 350, radius: 70, color: '#f0e6a0', phase2Color: '#8b5a2b',
      ffaTaken: 3,         // 캐릭터 패시브: 개인전(토너먼트 포함)에서 받는 피해 배율
      // 1스킬 웰우스 개방(패시브): 시작부터 같은 팀(본인 포함) 초당 hps 회복
      wellus: { hps: 1.4 },
      // 2스킬 웰우스 대청소(패시브, 페이즈 2): 모든 적 초당 dps 지속 피해
      clean: { dps: 2 },
    },
    predator: {  // 한규성 (포식자의 모습)
      hp: 180, speed: 470, radius: 70, color: '#ff5a36', phase2Color: '#ffffff', phase2Ratio: 0.7,
      contactDamage: 8.8,  // 도감 표시용. 실제로는 baseHit 고정
      baseHit: 8.8,        // 캐릭터 패시브: 몸통 박치기 고정 피해 (공격력 증감 무시)
      femaleChase: 1.3,    // 캐릭터 패시브: 여성 캐릭터에게 다가갈 때 이동속도 배율
      // 1스킬 작업실 비타민의 주인(패시브): 벽(wallCd초마다)·상대와 부딪히면 껍질 심기(여성이면 3개, 최대 max개)
      //   fuse초 뒤 하얗게 터지며 bullets발 탄막(속도 speed, 1발 damage)
      vitamin: { fuse: 2.6, bullets: 6, speed: 650, damage: 4, max: 12, wallCd: 0.6, stickDamage: 4 },   // stickDamage: 상대 몸에 붙은 껍질이 터질 때 그 상대가 받는 피해
      // 2스킬 포식: 쿨타임이 차면 장전 → 다음 박치기에 damage + 그 lifesteal만큼 흡혈 (여성은 피해 없이 damage만큼 회복)
      feast: { cd: 4, damage: 32, lifesteal: 0.5 },
    },
  },
};
