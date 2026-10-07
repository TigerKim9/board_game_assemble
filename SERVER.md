# 온라인 서버 띄우기

온라인 대전은 이 저장소의 `server/`(Node.js + WebSocket)가 담당합니다.
서버가 게임 규칙을 직접 실행하고, 각자에게는 자기가 볼 수 있는 정보만 보내므로 남의 패를 엿볼 수 없어요.
서버 하나가 **웹앱 + 온라인 서버**를 같이 제공하므로, 서버 주소로 접속하면 바로 온라인 대전이 됩니다.

## 1. 내 컴퓨터에서 (테스트·같은 와이파이 친구)
```bash
npm install
npm run build
npm run server        # http://localhost:8787
```
같은 와이파이의 친구는 `http://<내 컴퓨터 IP>:8787` 로 접속하면 됩니다.

## 2. Render 무료 (추천: 가장 쉬움)
1. https://render.com 가입 (GitHub 계정으로)
2. **New → Blueprint** → 이 저장소 선택 → Apply (`render.yaml`이 자동 설정)
3. 몇 분 뒤 `https://board-game-assemble-xxxx.onrender.com` 주소가 생기면 그 주소로 접속
- 무료 플랜은 15분간 접속이 없으면 잠들고, 다음 접속 때 30초 정도 깨어나는 시간이 걸려요.

## 3. 그 밖의 곳
Docker가 되는 곳이면 어디든 됩니다 (Oracle Cloud 무료 VM, Fly.io, 집 서버 등).
```bash
docker build -t board-games .
docker run -p 8787:8787 board-games
```

## GitHub Pages 버전에서 쓰기
GitHub Pages(정적 사이트)에는 서버가 없으므로, 온라인 화면에서 **서버 주소**에 위 서버 주소를 입력하면 됩니다.
빌드할 때 `VITE_SERVER_URL=wss://내서버/ws` 를 지정하면 기본값으로 들어갑니다.

## 구조
- `src/online/engine.ts` — 온라인 게임 정의(OnlineGame): setup / toAct / apply / view(숨김 정보 제거) / result / bot
- `src/online/games/*.ts` — 게임별 어댑터 (기존 `src/games/<id>/logic.ts` 규칙을 재사용)
- `src/online/ui/*.tsx` — 게임별 온라인 화면
- `server/rooms.ts` — 방 코드, 입장/퇴장, 재접속, 컴퓨터 자리, 자리 비운 사람 대신 두기
- `server/index.ts` — HTTP(웹앱 제공) + WebSocket(`/ws`)
