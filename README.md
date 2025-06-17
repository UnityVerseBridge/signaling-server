# UnityVerse Signaling Server

WebRTC 시그널링 서버 - Quest VR과 모바일 디바이스 연결

## 빠른 시작

```bash
# 의존성 설치
npm install

# 환경 설정 복사
cp .env.example .env

# 서버 시작 (인증 없음 - 개발용)
npm start

# 인증과 함께 시작
npm run start:auth
```

## 설정

`.env` 파일 편집:

```env
PORT=8080                        # 서버 포트
HOST=0.0.0.0                    # 호스트 주소
REQUIRE_AUTH=false              # 인증 활성화
AUTH_KEY=your-secret-key        # 인증 키
MAX_CLIENTS_PER_ROOM=10         # 룸당 최대 클라이언트
MAX_MESSAGE_SIZE=10240          # 최대 메시지 크기 (10KB)
MAX_CONNECTIONS_PER_IP=10       # IP당 최대 연결 수
```

## 엔드포인트

- `ws://localhost:8080` - WebSocket 연결
- `http://localhost:8080/auth` - 인증 엔드포인트
- `http://localhost:8080/health` - 상태 확인
- `http://localhost:8080/rooms` - 활성 룸 목록

## WebSocket 메시지 형식

### 룸 참가
```json
{
  "type": "join-room",
  "roomId": "room-123",
  "role": "Host|Client",
  "peerId": "unique-id",
  "maxConnections": 5
}
```

### WebRTC 시그널링
```json
{
  "type": "offer|answer|ice-candidate",
  "targetPeerId": "recipient-id",
  "sourcePeerId": "sender-id",
  "data": {}
}
```

### 이벤트 메시지
- `joined-room`: 룸 참가 확인
- `peer-joined`: 새 피어 참가
- `peer-left`: 피어 퇴장
- `client-ready`: 클라이언트 준비 완료
- `host-disconnected`: 호스트 연결 끊김
- `error`: 오류 발생

## Unity 클라이언트 설정

1. **Quest 앱**: ConnectionConfig에서 `requireAuthentication: true` 설정
2. **Mobile 앱**: ConnectionConfig에서 `requireAuthentication: true` 설정
3. 두 앱 모두 서버와 동일한 `authKey` 사용

## 프로덕션 배포

### Docker 사용
```bash
# 이미지 빌드
docker build -t unityverse-signaling .

# 컨테이너 실행
docker run -p 8080:8080 \
  -e REQUIRE_AUTH=true \
  -e AUTH_KEY=your-production-key \
  unityverse-signaling
```

### PM2 사용
```bash
# 환경 변수 설정
export REQUIRE_AUTH=true
export AUTH_KEY=your-production-key
export PORT=443

# PM2로 실행
pm2 start server.js --name unityverse-signaling
pm2 save
pm2 startup
```

### HTTPS 설정 (Nginx)
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 보안 기능

- **토큰 기반 인증**: JWT 토큰 사용
- **속도 제한**: IP당 연결 수 제한
- **메시지 크기 제한**: 대용량 메시지 차단
- **입력 검증**: 모든 입력 데이터 검증
- **룸 용량 제한**: 룸당 최대 클라이언트 수 제한

## 모니터링

### 로그
- 모든 연결/해제 이벤트 기록
- 오류 상황 상세 로깅
- 룸 상태 변경 추적

### 상태 확인
```bash
# 서버 상태 확인
curl http://localhost:8080/health

# 활성 룸 목록
curl http://localhost:8080/rooms
```

## 문제 해결

### 연결이 자주 끊김
- `HEARTBEAT_INTERVAL` 환경 변수로 하트비트 간격 조정
- 클라이언트의 네트워크 상태 확인

### 인증 오류
- AUTH_KEY가 클라이언트와 서버에서 일치하는지 확인
- 토큰 만료 시간 확인

### 메모리 누수
- PM2 메모리 제한 설정
- 오래된 룸 자동 정리 활성화

## 개발 환경

- Node.js 16+
- npm 또는 yarn
- WebSocket 라이브러리: ws
- 환경 변수: dotenv
- 인증: jsonwebtoken

## 라이선스

루트 저장소의 LICENSE 파일 참조