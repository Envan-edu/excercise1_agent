# 🚀 Multi-Task Agent Executive Dashboard & Pipeline Manager

> 다중 AI 에이전트 파이프라인 관제, 실시간 SSE 스트리밍 모니터링, 토큰 최적화 및 NAS Docker 배포를 지원하는 웹 대시보드 시스템

---

## 📌 주요 기능
- **🤖 다중 에이전트 파이프라인 관리**: 데이터 수집, AI 요약/정제, 리포트 생성, 알림 발송 등 순차/병렬 에이전트 실행 관리.
- **⚡ 실시간 스트리밍 모니터링**: SSE(Server-Sent Events) 기반으로 브라우저 새로고침 없이 에이전트 진행률 및 콘솔 로그 실시간 출력.
- **💰 토큰 절약 최적화 (Token Saver)**: 정규식 및 텍스트 압축 모듈을 통해 LLM 프롬프트 토큰 소모량을 최대 65% 절감.
- **🐳 NAS & Docker 지원**: Synology, QNAP 또는 일반 Docker 환경에서 원클릭으로 컨테이너화 배포 가능.
- **🌐 역방향 프록시 호환**: Nginx, Cloudflare Tunnel, Synology Reverse Proxy 환경 완벽 대응.

---

## 📂 프로젝트 구조

```text
├── config/
│   ├── settings.json       # 대시보드 인증 및 모델별 단가, 시스템 설정
│   └── tasks.json          # 에이전트 파이프라인 작업 정의
├── helpers/
│   └── token_saver.py      # 파이썬 기반 토큰 절약 유틸리티
├── middleware/
│   └── auth.js             # API 인증 미들웨어
├── public/
│   ├── app.js              # 프론트엔드 대시보드 제어 스크립트
│   ├── index.html          # 대시보드 UI 마크업
│   └── style.css           # 대시보드 스타일링
├── utils/
│   ├── settingsManager.js  # 설정 및 실행 기록 관리
│   └── tokenOptimizer.js   # 토큰 절약 알고리즘
├── Dockerfile              # 도커 이미지 빌드 파일
├── docker-compose.yml      # 도커 컴포즈 실행 파일
├── nginx_proxy_guide.md    # 프록시 연동 가이드
├── package.json            # 패키지 설정
├── server.js               # 백엔드 웹/API 서버
└── taskEngine.js           # 에이전트 프로세스 제어 엔진
```

---

## 🛠️ 시작하기

### 1. 요구 사항
- **Node.js**: v18 이상 권장

### 2. 로컬 실행
```bash
# 서버 시작
npm start
# 또는
node server.js
```

브라우저에서 `http://localhost:3000`으로 접속합니다.
- 기본 사용자: `admin`
- 기본 비밀번호: `1234` (또는 `config/settings.json`에서 변경 가능)

### 3. Docker로 실행
```bash
docker-compose up -d --build
```
