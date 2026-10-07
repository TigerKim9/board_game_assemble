# 보드게임 모음 — 개발 가이드

React 19 + TypeScript + Vite 웹앱(PWA). 폰/PC 브라우저에서 동작. UI 문구는 모두 한국어.

## 명령어
- `npm run dev` — 개발 서버
- `npm test` — vitest (게임 로직 단위 테스트, `src/**/*.test.ts`)
- `npm run build` — 타입체크(`tsc -b`) + 빌드
- `node scripts/smoke.mjs http://localhost:4173/` — `npx vite preview --port 4173` 실행 후 모든 게임 화면을 헤드리스 크롬으로 열어 콘솔 에러 확인 (`ONLY=yacht,ladder`로 일부만)

## 구조
- `src/games/<id>/meta.ts` — `export const meta: GameMeta` (id, name, emoji, category, players, solo, description, rules[], `load: () => import('./index')`). `src/games/registry.ts`가 glob으로 자동 등록하므로 레지스트리 수정 불필요.
- `src/games/<id>/index.tsx` — `export default function` 게임 컴포넌트 (props 없음). 헤더/규칙 모달은 `GameShell`이 감싸줌.
- `src/games/<id>/logic.ts` (+ `logic.test.ts`) — 순수 게임 규칙·AI. UI와 분리해 테스트.
- `src/games/<id>/<id>.css` — 게임 전용 스타일 (클래스명은 게임 id 접두사로 충돌 방지).
- 공통: `src/lib/` (random: shuffle/rollDie/mulberry32/sleep, storage: useStored/useBestScore, types), `src/components/` (PlayerSetup, Die, Result, Modal), `src/index.css`의 공통 클래스(`.btn .primary .accent .ghost .small .big`, `.card-panel`, `.felt`, `.status`, `.players-bar .player-chip`, `.segmented`, CSS 변수 `--p1..--p6` 플레이어 색).

## 규칙
- 혼자서 가능한 게임은 AI 상대 또는 기록 도전 제공. 여러 명은 한 기기 번갈아하기(핫시트) + AI 좌석.
- 숨겨진 정보가 있는 게임(카드 패)을 핫시트로 할 때는 차례 넘김 화면("○○님 차례 — 화면을 넘겨주세요")으로 가리기.
- 베팅 게임은 가상 칩만. 실제 돈/결제 없음.
- 상용 게임 모작은 이름·아트를 바꿈 (예: 더 마인드 → 텔레파시). 상표명(Yahtzee 등) 사용 금지.
- 모바일 우선: 360px 폭에서 가로 스크롤 없이, 터치 타깃 40px 이상. 다크 모드는 CSS 변수로 자동.
- 외부 이미지/폰트 없이 SVG·CSS·이모지로 그림.

## 온라인 대전 (`SERVER.md` 참고)
- 서버(`server/`)는 `src/online/games/*` 어댑터와 각 게임의 `logic.ts`를 Node에서 직접 import함 → 로직 파일은 CSS·React·DOM을 import하면 안 됨 (예: 화투는 `../../hwatu/deck`처럼 순수 진입점 사용).
- 어댑터의 `view()`는 숨김 정보 제거 필수, 랜덤은 전달받은 rng만 사용.
