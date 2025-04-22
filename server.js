// --- server.js ---
const WebSocket = require('ws'); // 설치한 ws 라이브러리 가져오기
const { v4: uuidv4 } = require('uuid'); // 설치한 uuid 라이브러리에서 v4 함수 가져오기

const port = 8080; // 서버가 사용할 포트 번호 (다른 프로그램과 겹치지 않게)
const wss = new WebSocket.Server({ port: port }); // 지정된 포트로 WebSocket 서버 생성
const clients = new Map(); // 연결된 클라이언트들을 저장할 Map 객체 생성

console.log(`WebSocket Signaling Server started on port ${port}`);

// 클라이언트가 새로 연결되었을 때 실행될 함수 정의
wss.on('connection', (ws) => {
    const clientId = uuidv4(); // 새 클라이언트를 위한 고유 ID 생성
    clients.set(ws, clientId); // Map에 클라이언트 WebSocket 객체와 ID 저장
    console.log(`Client connected: ${clientId}`);

    // (선택 사항) 연결된 클라이언트에게 ID 알려주기
    // ws.send(JSON.stringify({ type: 'your-id', id: clientId }));

    // 클라이언트로부터 메시지를 받았을 때 실행될 함수 정의
    ws.on('message', (messageBuffer) => {
        // Buffer 형태로 받은 메시지를 문자열로 변환
        const messageString = messageBuffer.toString();
        console.log(`Message received from ${clientId}: ${messageString}`);

        // 중요: 메시지를 보낸 클라이언트를 제외한 모든 다른 클라이언트에게 메시지 전달 (Relay)
        clients.forEach((id, client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                // 다른 클라이언트에게 원본 메시지(Buffer 또는 문자열) 그대로 전송
                client.send(messageBuffer);
                console.log(`Message relayed to ${id}`);
            }
        });
    });

    // 클라이언트 연결이 끊어졌을 때 실행될 함수 정의
    ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        clients.delete(ws); // Map에서 해당 클라이언트 제거
    });

    // 에러가 발생했을 때 실행될 함수 정의
    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        clients.delete(ws); // 에러 발생 시에도 Map에서 제거
    });
});