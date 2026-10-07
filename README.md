# 🎲 보드게임 모음

폰과 컴퓨터 브라우저에서 혼자서도, 여럿이서도 즐길 수 있는 보드게임·카드·화투·주사위·파티 게임 모음입니다.

- 홈 화면에 추가하면 앱처럼 설치됩니다 (PWA).
- 컴퓨터(AI) 상대 또는 한 기기로 번갈아 하기 지원.
- 진행 상황은 [ROADMAP.md](./ROADMAP.md) 참고.

## 실행
```bash
npm install
npm run dev     # 개발 서버
npm test        # 로직 테스트
npm run build   # 배포용 빌드 (dist/)
```

## 배포 (GitHub Pages)
`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 자동 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Source: GitHub Actions** 로 설정해 주세요.
