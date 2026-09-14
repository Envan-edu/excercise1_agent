const https = require('https');
const http = require('http');
const settingsManager = require('../utils/settingsManager');

// 토큰 검증 결과 인메모리 캐시 (TTL: 5분)
const tokenCache = new Map(); // token -> { user, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Supabase Auth API를 통해 Access Token의 유효성을 검증합니다.
 * @param {string} token - JWT Access Token
 * @param {string} supabaseUrl - Supabase Project URL
 * @param {string} anonKey - Supabase Anon/Public Key
 * @returns {Promise<object|null>} 유효한 경우 user 객체, 실패 시 null
 */
function verifySupabaseToken(token, supabaseUrl, anonKey) {
  return new Promise((resolve) => {
    if (!token || !supabaseUrl || !anonKey) return resolve(null);

    // 1. 캐시 확인
    const cached = tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return resolve(cached.user);
    }

    try {
      const cleanUrl = supabaseUrl.replace(/\/+$/, '');
      const targetUrl = new URL(`${cleanUrl}/auth/v1/user`);
      const isHttps = targetUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${token}`
        },
        timeout: 5000
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const user = JSON.parse(data);
              // 캐시에 저장
              tokenCache.set(token, {
                user,
                expiresAt: Date.now() + CACHE_TTL_MS
              });
              resolve(user);
            } catch (e) {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });

      req.on('error', (err) => {
        console.error('Supabase Auth verification error:', err.message);
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });

      req.end();
    } catch (err) {
      console.error('Failed to initiate Supabase token check:', err);
      resolve(null);
    }
  });
}

/**
 * 요청의 인증 상태를 비동기로 검증하는 헬퍼
 * @param {object} req - HTTP Request 객체
 * @param {object} queryParams - 파싱된 Query Params
 * @returns {Promise<{authenticated: boolean, user: object|string|null}>}
 */
async function authenticateRequest(req, queryParams = {}) {
  const settings = settingsManager.getSettings();

  // 1. 인증이 비활성화된 경우 통과
  if (!settings.authEnabled) {
    return { authenticated: true, user: 'anonymous' };
  }

  // 2. Authorization 헤더 확인 (Bearer <token>)
  const authHeader = req.headers['authorization'] || '';
  let bearerToken = '';
  if (authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  } else if (queryParams.token) {
    bearerToken = queryParams.token.trim();
  }

  // 3. Supabase Auth 토큰 검증 (단일화된 유일한 인증 수단)
  if (settings.supabaseUrl && settings.supabaseAnonKey) {
    if (bearerToken) {
      const user = await verifySupabaseToken(bearerToken, settings.supabaseUrl, settings.supabaseAnonKey);
      if (user) {
        return { authenticated: true, user };
      }
    }
    return { authenticated: false, user: null, reason: 'Invalid or expired Supabase token' };
  }

  // Supabase 연동 정보가 설정되지 않은 경우 미인증 처리
  return { authenticated: false, user: null, reason: 'Supabase configuration missing' };
}

module.exports = {
  verifySupabaseToken,
  authenticateRequest
};
