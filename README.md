# UnityVerseBridge Signaling Server

Unity WebRTC 애플리케이션을 위한 WebSocket 기반 시그널링 서버입니다. Quest VR과 모바일 앱 간의 P2P 연결을 중재합니다.

## 🎯 개요

이 서버는 WebRTC 연결 설정에 필요한 시그널링 메시지(SDP, ICE candidates)를 중계하는 역할을 합니다. 실제 미디어 스트림은 P2P로 직접 전송됩니다.

**주요 기능:**
- 룸 기반 피어 매칭
- WebSocket 실시간 메시지 중계
- 간단한 토큰 기반 인증 (선택사항)
- 하트비트를 통한 연결 상태 관리

## 🛠️ 기술 스택

- Node.js
- WebSocket (ws 라이브러리)
- 환경 변수 기반 설정

## 📋 요구사항

- Node.js 16.x 이상
- npm 또는 yarn

## 🚀 설치 및 실행

### 1. 프로젝트 클론
```bash
git clone https://github.com/UnityVerseBridge/signaling-server.git
cd signaling-server
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 환경 설정
```bash
# .env 파일 생성
cp .env.example .env

# .env 파일을 편집하여 설정
```

### 4. 서버 실행

**개발 모드:**
```bash
npm start
```

**인증 모드:**
```bash
npm run start:auth
```

**프로덕션 모드:**
```bash
npm run start:prod
```

## ⚙️ 환경 설정

`.env` 파일 예시:
```env
# 서버 포트 (기본값: 8080)
PORT=8080

# 인증 모드 활성화 (true/false)
REQUIRE_AUTH=false

# 인증 키 (인증 모드 사용 시)
AUTH_KEY=your-secret-key

# 토큰 만료 시간 (밀리초, 기본값: 24시간)
TOKEN_EXPIRY=86400000

# 로그 레벨 (선택사항)
LOG_LEVEL=info
```

## 📡 프로토콜

### 클라이언트 → 서버

**등록 (필수):**
```json
{
  "type": "register",
  "peerId": "unique-peer-id",
  "clientType": "Quest" | "Mobile",
  "roomId": "room-name"
}
```

**시그널링 메시지:**
```json
{
  "type": "offer" | "answer" | "ice-candidate",
  "data": { /* WebRTC 데이터 */ },
  "target": "peer-id" (선택사항)
}
```

### 서버 → 클라이언트

**등록 확인:**
```json
{
  "type": "registered",
  "roomId": "room-name",
  "peerId": "your-peer-id"
}
```

**피어 알림:**
```json
{
  "type": "peer-joined" | "peer-left",
  "peerId": "other-peer-id",
  "clientType": "Quest" | "Mobile"
}
```

**오류:**
```json
{
  "type": "error",
  "error": "에러 메시지",
  "context": "error_context"
}
```

## 🔐 인증

### 토큰 기반 인증 (현재)
- 간단한 토큰 생성 및 검증
- 메모리 기반 저장 (서버 재시작 시 초기화)
- 24시간 만료 시간

### 인증 엔드포인트
```
POST /auth
Content-Type: application/json

{
  "clientId": "client-unique-id",
  "clientType": "Quest" | "Mobile",
  "authKey": "your-auth-key"
}

Response:
{
  "token": "generated-token"
}
```

### WebSocket 연결 시 인증
```
ws://server:port?token=your-token
```

### 프로덕션 권장사항
- JWT(JSON Web Token) 구현
- Redis 등을 사용한 세션 관리
- HTTPS/WSS 사용
- Rate limiting 적용

## 🏗️ 아키텍처

```
시그널링 서버
├── WebSocket 서버
│   ├── 연결 관리
│   ├── 메시지 라우팅
│   └── 하트비트 체크
├── 룸 관리
│   ├── 피어 그룹핑
│   └── 자동 정리
└── 인증 (선택사항)
    ├── 토큰 생성
    └── 검증
```

## 📊 모니터링

서버는 다음 정보를 콘솔에 로깅합니다:
- 클라이언트 연결/해제
- 룸 생성/삭제
- 메시지 타입 및 라우팅
- 오류 상황

## 🐛 문제 해결

### 연결이 안 되는 경우
1. 포트가 방화벽에서 열려있는지 확인
2. 클라이언트의 서버 URL이 올바른지 확인
3. 네트워크 연결 상태 확인

### 메시지가 전달되지 않는 경우
1. 두 클라이언트가 같은 룸에 있는지 확인
2. 클라이언트가 올바르게 등록되었는지 확인
3. 서버 로그에서 오류 확인

### 성능 문제
1. 동시 연결 수 확인
2. 메시지 크기 및 빈도 확인
3. 서버 리소스 모니터링

## 🚀 배포

### 로컬 테스트
```bash
node server.js
```

### 프로덕션 배포 (PM2 사용)
```bash
# PM2 설치
npm install -g pm2

# 서버 시작
pm2 start server.js --name "signaling-server"

# 로그 확인
pm2 logs signaling-server

# 서버 재시작
pm2 restart signaling-server
```

### Docker 배포
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

## 🔧 확장성

### 수평적 확장
- Redis를 사용한 세션 공유
- 로드 밸런서를 통한 부하 분산
- Sticky session 설정 필요

### 수직적 확장
- 서버 리소스 증설
- Node.js 클러스터 모드 활용

## 🚧 향후 개발 계획

### 우선순위 높음
- JWT 기반 인증 구현
- Redis 세션 저장소 통합
- 연결 통계 API

### 중간 우선순위
- 대시보드 UI
- 메트릭 수집 (Prometheus)
- 자동 확장 지원

### 장기 계획
- 멀티 리전 지원
- WebRTC TURN 서버 통합
- 녹화 기능 지원

## 📄 라이선스

이 프로젝트는 BSD 3-Clause 라이선스를 따릅니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

## 👥 제작자

- **kugorang** - [GitHub](https://github.com/kugorang)

---

문제가 있거나 제안사항이 있으시면 [Issues](https://github.com/UnityVerseBridge/signaling-server/issues)에 등록해주세요.
