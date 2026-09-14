const settingsManager = require('../utils/settingsManager');

function authMiddleware(req, res, next) {
  const clientUser = req.headers['x-dashboard-user'] || req.query.user || 'admin';
  const clientKey = req.headers['x-dashboard-key'] || req.query.key;

  if (settingsManager.verifyCredentials(clientUser, clientKey)) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: '대시보드 로그인 계정(ID) 또는 비밀번호가 올바르지 않습니다.'
  });
}

module.exports = {
  authMiddleware
};
