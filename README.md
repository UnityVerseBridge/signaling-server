# Unity WebRTC Signaling Server

## 설치 및 실행

1. Node.js 설치 필요
2. 터미널에서 실행:
```bash
cd signaling-server
npm install
npm start
```

## 작동 방식
- 포트 8080에서 WebSocket 서버 실행
- 수신한 메시지를 발신자를 제외한 모든 클라이언트에게 중계
- Quest App과 Mobile App 간 시그널링 메시지 교환 지원
