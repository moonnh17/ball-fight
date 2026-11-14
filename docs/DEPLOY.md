# 배포: Cloudflare

빌드가 필요 없는 웹 게임이라 폴더를 그대로 올리면 된다. 깃허브 저장소를 Cloudflare에 연결해 두면, 깃허브에 올릴(push) 때마다 자동으로 새 버전이 배포된다.

## 1. 깃허브 저장소 만들기 (한 번)

1. https://github.com/new 에서 새 저장소를 만든다.
   - 이름 예: `ball-fight`
   - **Private(비공개)** 로 만들어도 된다 (Cloudflare는 비공개 저장소도 무료로 배포한다).
   - README·.gitignore·라이선스는 **추가하지 않는다** (이 폴더에 이미 있다).
2. 만든 저장소 주소(예: `https://github.com/아이디/ball-fight.git`)를 복사한다.
3. 이 폴더에서 연결하고 올린다:

```bash
git remote add origin https://github.com/아이디/ball-fight.git
git push -u origin main
```

처음 올릴 때 깃허브 로그인 창이 뜬다(윈도우 Git Credential Manager).

## 2. Cloudflare 연결 (한 번)

1. https://dash.cloudflare.com 에 로그인한다.
2. **Workers & Pages → 만들기(Create) → Pages → Git에 연결(Connect to Git)**.
3. 깃허브 계정을 연결하고 위 저장소를 고른다.
4. 빌드 설정:

| 항목 | 값 |
| --- | --- |
| 프레임워크 프리셋 | 없음(None) |
| 빌드 명령 | (비워 둠) |
| 빌드 출력 디렉터리 | `/` |
| 프로덕션 브랜치 | `main` |

5. **저장 후 배포**. 1~2분 뒤 `https://프로젝트이름.pages.dev` 주소가 생긴다.

### Workers 화면이 나올 때

Cloudflare가 Pages 대신 Workers 만들기 화면을 보여 주면 그대로 써도 된다. 저장소의 `wrangler.jsonc`가 이 폴더를 정적 사이트로 올리게 되어 있다 (`.assetsignore`에 적힌 tests·docs 등은 빠진다).

| 항목 | 값 |
| --- | --- |
| 빌드 명령 | (비워 둠) |
| 배포 명령 | `npx wrangler deploy` |

주소는 `https://ball-fight.계정이름.workers.dev` 형태가 된다.

## 3. 이후 업데이트

코드를 고치고 `git push` 하면 자동으로 다시 배포된다.

## 알아둘 것

- **사이트 주소는 누구나 열 수 있다.** 저장소가 비공개여도 배포된 사이트의 사진·이름은 주소를 아는 사람에게 보인다. 아는 사람만 보게 하려면 Cloudflare Zero Trust → Access에서 이메일 로그인을 걸 수 있다.
- 원본 사진 폴더(바통(유재후) 등)는 `.gitignore`로 빠져 있어 올라가지 않는다. 게임은 `assets/`에 잘라 둔 사본만 쓴다. **새 원본 폴더를 만들면 `.gitignore`에도 추가할 것.**
- 통계(전적)는 브라우저마다 따로 남는다(localStorage). 기기 사이에 이어지지 않는다.
- 캐시 규칙은 `_headers`: 페이지와 코드는 매번 새로 확인하고, 사진만 하루 캐시한다. 그래도 옛 화면이 보이면 Ctrl+F5(모바일은 새로고침).
