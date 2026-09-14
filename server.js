const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const taskEngine = require('./taskEngine');
const tokenOptimizer = require('./utils/tokenOptimizer');
const settingsManager = require('./utils/settingsManager');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

// JSON 바디 파서 헬퍼
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

// 응답 헬퍼
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-dashboard-user, x-dashboard-key',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// HTTP 서버 생성 (Node.js 자체 내장 모듈 사용 - 별도 npm install 불필요)
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method.toUpperCase();
  const queryParams = Object.fromEntries(reqUrl.searchParams);

  // CORS Preflight 처리
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-dashboard-user, x-dashboard-key',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    });
    return res.end();
  }

  // 1. SSE 실시간 스트리밍 엔드포인트
  if (pathname === '/api/events' && method === 'GET') {
    const reqUser = queryParams.user || 'admin';
    const reqKey = queryParams.key;

    if (!settingsManager.verifyCredentials(reqUser, reqKey)) {
      return sendJson(res, 401, { error: 'Unauthorized', message: '대시보드 로그인 계정(ID) 또는 비밀번호가 올바르지 않습니다.' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });

    taskEngine.addSseClient(res);

    req.on('close', () => {
      taskEngine.removeSseClient(res);
    });
    return;
  }

  // 2. REST API 엔드포인트 처리
  if (pathname.startsWith('/api/')) {
    // API 인증 검증
    const reqUser = req.headers['x-dashboard-user'] || queryParams.user || 'admin';
    const reqKey = req.headers['x-dashboard-key'] || queryParams.key;

    if (!settingsManager.verifyCredentials(reqUser, reqKey)) {
      return sendJson(res, 401, { error: 'Unauthorized', message: '대시보드 로그인 계정(ID) 또는 비밀번호가 올바르지 않습니다.' });
    }

    // GET /api/tasks
    if (pathname === '/api/tasks' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        tasks: taskEngine.tasks,
        tokenStats: tokenOptimizer.getStats()
      });
    }

    // POST /api/tasks/run
    if (pathname === '/api/tasks/run' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = taskEngine.runTask(body.taskId);
      return sendJson(res, 200, result);
    }

    // POST /api/tasks/stop
    if (pathname === '/api/tasks/stop' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = taskEngine.stopTask(body.taskId);
      return sendJson(res, 200, result);
    }

    // POST /api/pipeline/run
    if (pathname === '/api/pipeline/run' && method === 'POST') {
      const result = taskEngine.runPipeline();
      return sendJson(res, 200, result);
    }

    // POST /api/parallel/run
    if (pathname === '/api/parallel/run' && method === 'POST') {
      const result = taskEngine.runAllParallel();
      return sendJson(res, 200, result);
    }

    // POST /api/reset
    if (pathname === '/api/reset' && method === 'POST') {
      const result = taskEngine.resetAll();
      return sendJson(res, 200, result);
    }

    // POST /api/tasks (upsert)
    if (pathname === '/api/tasks' && method === 'POST') {
      const body = await parseJsonBody(req);
      const result = taskEngine.upsertTask(body);
      return sendJson(res, 200, result);
    }

    // DELETE /api/tasks/:id
    if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
      const taskId = pathname.replace('/api/tasks/', '');
      const result = taskEngine.deleteTask(taskId);
      return sendJson(res, 200, result);
    }

    // GET /api/stats
    if (pathname === '/api/stats' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        stats: tokenOptimizer.getStats()
      });
    }

    // GET /api/admin/settings
    if (pathname === '/api/admin/settings' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        settings: settingsManager.getSettings()
      });
    }

    // POST /api/admin/settings
    if (pathname === '/api/admin/settings' && method === 'POST') {
      const body = await parseJsonBody(req);
      const updated = settingsManager.updateSettings(body);
      return sendJson(res, 200, { success: true, settings: updated });
    }

    // POST /api/admin/change-credentials
    if (pathname === '/api/admin/change-credentials' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { newUsername, newPassword } = body;
      if (!newUsername || newUsername.trim().length < 2) {
        return sendJson(res, 400, { success: false, error: '계정 ID는 최소 2자 이상이어야 합니다.' });
      }
      if (!newPassword || newPassword.trim().length < 4) {
        return sendJson(res, 400, { success: false, error: '비밀번호는 최소 4자 이상이어야 합니다.' });
      }
      const ok = settingsManager.setCredentials(newUsername.trim(), newPassword.trim());
      return sendJson(res, 200, { success: ok, message: ok ? '계정 정보가 성공적으로 변경되었습니다.' : '계정 정보 변경 실패' });
    }

    // GET /api/admin/history
    if (pathname === '/api/admin/history' && method === 'GET') {
      const limit = parseInt(queryParams.limit, 10) || 50;
      return sendJson(res, 200, {
        success: true,
        history: settingsManager.getHistory(limit)
      });
    }

    // DELETE /api/admin/history
    if (pathname === '/api/admin/history' && method === 'DELETE') {
      settingsManager.clearHistory();
      return sendJson(res, 200, { success: true, message: '실행 이력이 초기화되었습니다.' });
    }

    // POST /api/admin/ping-proxy
    if (pathname === '/api/admin/ping-proxy' && method === 'POST') {
      return sendJson(res, 200, {
        success: true,
        pingTime: new Date().toISOString(),
        sseClientsCount: taskEngine.sseClients.length,
        status: 'ONLINE',
        proxyHeaders: {
          'x-accel-buffering': 'no',
          'cache-control': 'no-cache, no-transform'
        }
      });
    }

    return sendJson(res, 404, { error: 'Not Found' });
  }

  // 3. 정적 파일 서빙 (public/ 디렉토리)
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // 보안: 디렉토리 트래버설 방지
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // index.html로 fallback
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        return res.end('Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Multi-Task Agent Executive Manager Server Started`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🌐 Alternative: http://127.0.0.1:${PORT}`);
  console.log(`====================================================`);
});
