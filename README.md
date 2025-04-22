# UnityVerse Bridge - Signaling Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Meta Quest 3와 모바일 앱 간의 WebRTC 연결 설정을 중계하는 간단한 WebSocket 기반 시그널링 서버입니다. UnityVerse Bridge 프로젝트의 일부입니다.

## 기능

* WebSocket 클라이언트 연결 수락 및 관리
* 연결된 클라이언트에게 고유 ID 부여
* 클라이언트 간 WebRTC 시그널링 메시지(Offer, Answer, ICE Candidate 등) 중계 (Relay)
* 클라이언트 연결 종료 및 오류 처리

## 사전 요구 사항

이 서버를 로컬 환경에서 실행하거나 개발하려면 다음 소프트웨어가 설치되어 있어야 합니다.

* [Node.js](https://nodejs.org/) (버전 18.x 이상 권장)
* [npm](https://www.npmjs.com/) (Node.js 설치 시 보통 함께 설치됨)
* [Git](https://git-scm.com/)

## 설치 방법

1.  **리포지토리 클론:**

    ```bash
    git clone [https://github.com/UnityVerseBridge/signaling-server.git](https://github.com/UnityVerseBridge/signaling-server.git)
    ```

2.  **프로젝트 폴더로 이동:**

    ```bash
    cd signaling-server
    ```

3.  **의존성 패키지 설치:**

    프로젝트에 필요한 라이브러리(ws, uuid 등)를 다운로드하고 설치합니다.
    ```bash
    npm install
    ```

## 로컬에서 서버 실행 방법 (개발용)

1.  **서버 시작:**
    아래 명령어를 실행하여 시그널링 서버를 시작합니다.

    ```bash
    node server.js
    ```

    *(참고: 개발 중 코드를 수정할 때마다 서버를 자동으로 재시작하려면 `nodemon`을 설치(`npm install --save-dev nodemon`)하고 `nodemon server.js`로 실행하면 편리합니다.)*

2.  **서버 접속 정보:**
    * 서버는 기본적으로 **WebSocket `ws://<서버 IP 주소>:8080`** 에서 연결을 기다립니다.
    * Unity 클라이언트 앱(`quest-app`, `mobile-app`)에서 이 주소로 접속해야 합니다. (로컬 테스트 시 `<서버 IP 주소>`는 `localhost` 또는 `127.0.0.1` 입니다.)

## 설정

* 현재 서버는 `server.js` 파일 내에 하드코딩된 포트 번호(`8080`)를 사용합니다. 필요시 해당 부분을 직접 수정하여 변경할 수 있습니다. (추후 환경 변수 등을 사용하도록 개선될 수 있습니다.)

## Docker

(현재는 로컬 실행 위주로 설명)

추후 CI/CD 파이프라인을 통해 이 서버 애플리케이션을 Docker 컨테이너로 빌드하고 배포할 예정입니다. 관련 설정 파일(`Dockerfile`, `.dockerignore`)이 포함되어 있습니다.

## 프로젝트 구조 (주요 파일)

```text
├── server.js           # 시그널링 서버 메인 코드
├── package.json        # 프로젝트 정보 및 의존성 목록
├── package-lock.json   # 의존성 버전 고정 파일
├── node_modules/       # 설치된 의존성 라이브러리 (Git 추적 제외)
├── Dockerfile          # (예정) Docker 이미지 빌드 설정
├── .dockerignore       # Docker 빌드 시 제외 파일 목록
├── README.md           # 현재 이 파일 (프로젝트 설명)
├── .gitignore          # Git 추적 제외 파일 목록
└── LICENSE             # 프로젝트 라이선스 정보
```

## 라이선스

이 프로젝트는 [MIT License](LICENSE)를 따릅니다.