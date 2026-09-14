FROM node:20-alpine

# NAS에서 Python 스크립트 에이전트도 실행할 수 있도록 python3 설치
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# NAS 데이터 및 설정 보존을 위한 Volume 포인트
VOLUME ["/app/config", "/app/data"]

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
