# NAS Reverse Proxy & 개인 도메인 설정 가이드

본 시스템은 **SSE(Server-Sent Events)** 기술을 사용하여 4~6개 에이전트의 상태, 진행률 및 로그를 실시간으로 웹 브라우저에 스트리밍합니다. 개인 도메인 및 Nginx / Synology 역방향 프록시를 사용할 때는 프록시가 응답을 지연(버퍼링)시키지 않도록 아래 설정을 적용해야 합니다.

---

## 1. Nginx / Nginx Proxy Manager 설정

개인 도메인의 Nginx 설정 파일 (`server` 블록) 내에 아래 프록시 헤더를 추가합니다.

```nginx
server {
    server_name agent.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # SSE (Server-Sent Events) 실시간 스트리밍 필수 헤더
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Nginx 버퍼링 해제 (핵심!)
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

---

## 2. Synology NAS 역방향 프록시 (Reverse Proxy) 설정

1. **시놀로지 제어판** -> **응용 프로그램 포털 / 로그인 포털** -> **역방향 프록시** 선택.
2. 새 규칙 생성:
   - **소스**: HTTPS, 호스트 이름: `agent.yourdomain.com`, 포트: `443`
   - **대상**: HTTP, 호스트 이름: `localhost`, 포트: `3000`
3. **사용자 지정 머리글 (Custom Headers)** 탭 이동 -> **생성** -> **WebSocket** 클릭 (Upgrade 및 Connection 헤더 자동 생성됨).
4. `proxy_buffering off` 헤더 설정을 위해 필요 시 고급 설정에 추가합니다.

---

## 3. Cloudflare Tunnel 사용자 설정

Cloudflare를 사용하는 경우, **Network** 설정에서 **WebSockets** 및 **gRPC**를 활성화해 두시면 SSE 통신이 차단 없이 원활하게 작동합니다.
