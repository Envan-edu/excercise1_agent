const fs = require('fs');
const path = require('path');
const tokenOptimizer = require('./tokenOptimizer');

class SettingsManager {
  constructor() {
    this.settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
    this.defaultSettings = {
      authUsername: process.env.DASHBOARD_USER || 'admin',
      authPassword: process.env.DASHBOARD_PASS || '1234',
      authEnabled: process.env.AUTH_ENABLED !== 'false',
      compressionLevel: 'standard', // conservative, standard, aggressive
      pricing: {
        'gemini-1.5-flash': { input: 0.075, output: 0.30 },
        'gemini-1.5-pro': { input: 1.25, output: 5.00 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'gpt-4o': { input: 2.50, output: 10.00 },
        'claude-3-haiku': { input: 0.25, output: 1.25 },
        'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
        'none': { input: 0, output: 0 }
      },
      proxyConfig: {
        domain: 'agent.yourdomain.com',
        localPort: 3000,
        sseBufferingOff: true,
        corsEnabled: true
      },
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      supabaseEnabled: process.env.SUPABASE_ENABLED === 'true',
      executionHistory: []
    };

    this.settings = { ...this.defaultSettings };
    this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.settings = { ...this.defaultSettings, ...parsed };
      } else {
        this.saveSettings();
      }
    } catch (err) {
      console.error('Failed to load settings.json:', err);
    }
    // Update tokenOptimizer pricing
    if (this.settings.pricing) {
      tokenOptimizer.pricing = { ...this.settings.pricing };
    }
  }

  saveSettings() {
    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save settings.json:', err);
    }
  }

  getSettings() {
    return {
      authEnabled: this.settings.authEnabled,
      authUsername: this.settings.authUsername || 'admin',
      compressionLevel: this.settings.compressionLevel,
      pricing: this.settings.pricing,
      proxyConfig: this.settings.proxyConfig,
      supabaseUrl: this.settings.supabaseUrl || '',
      supabaseAnonKey: this.settings.supabaseAnonKey || '',
      supabaseEnabled: !!this.settings.supabaseEnabled,
      historyCount: this.settings.executionHistory.length
    };
  }

  setSupabaseConfig(url, anonKey, enabled) {
    if (typeof url === 'string') this.settings.supabaseUrl = url.trim();
    if (typeof anonKey === 'string') this.settings.supabaseAnonKey = anonKey.trim();
    if (typeof enabled === 'boolean') this.settings.supabaseEnabled = enabled;
    this.saveSettings();
    return true;
  }

  verifyCredentials(username, password) {
    if (!this.settings.authEnabled) return true;
    const reqUser = (username || 'admin').trim();
    const targetUser = (this.settings.authUsername || 'admin').trim();
    const reqPass = (password || '').trim();
    const targetPass = (this.settings.authPassword || '1234').trim();

    if (reqUser === targetUser) {
      if (reqPass === targetPass) return true;
      // 초기 호환성: 1234와 admin1234 모두 허용
      if ((targetPass === '1234' || targetPass === 'admin1234') && (reqPass === '1234' || reqPass === 'admin1234')) {
        return true;
      }
    }
    return false;
  }

  verifyPassword(password) {
    if (!this.settings.authEnabled) return true;
    const reqPass = (password || '').trim();
    const targetPass = (this.settings.authPassword || '1234').trim();
    return (reqPass === targetPass) || ((targetPass === '1234' || targetPass === 'admin1234') && (reqPass === '1234' || reqPass === 'admin1234'));
  }

  setCredentials(newUsername, newPassword) {
    if (newUsername && typeof newUsername === 'string') {
      this.settings.authUsername = newUsername.trim();
    }
    if (newPassword && typeof newPassword === 'string') {
      this.settings.authPassword = newPassword.trim();
    }
    this.saveSettings();
    return true;
  }

  setPassword(newPassword) {
    if (!newPassword || typeof newPassword !== 'string') return false;
    this.settings.authPassword = newPassword;
    this.saveSettings();
    return true;
  }

  updateSettings(newSettings) {
    if (newSettings.compressionLevel) {
      this.settings.compressionLevel = newSettings.compressionLevel;
    }
    if (newSettings.pricing) {
      this.settings.pricing = { ...this.settings.pricing, ...newSettings.pricing };
      tokenOptimizer.pricing = { ...this.settings.pricing };
    }
    if (newSettings.proxyConfig) {
      this.settings.proxyConfig = { ...this.settings.proxyConfig, ...newSettings.proxyConfig };
    }
    this.saveSettings();
    return this.getSettings();
  }

  recordHistory(record) {
    const historyItem = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      formattedTime: new Date().toLocaleString('ko-KR'),
      taskId: record.taskId,
      taskName: record.taskName,
      status: record.status, // COMPLETED, FAILED, PAUSED
      usedTokens: record.usedTokens || 0,
      savedTokens: record.savedTokens || 0,
      costUsd: record.costUsd || 0,
      model: record.model || 'none',
      durationSeconds: record.durationSeconds || 0,
      summary: record.summary || ''
    };

    this.settings.executionHistory.unshift(historyItem);
    if (this.settings.executionHistory.length > 200) {
      this.settings.executionHistory = this.settings.executionHistory.slice(0, 200);
    }
    this.saveSettings();
    return historyItem;
  }

  getHistory(limit = 50) {
    return this.settings.executionHistory.slice(0, limit);
  }

  clearHistory() {
    this.settings.executionHistory = [];
    this.saveSettings();
    return true;
  }
}

module.exports = new SettingsManager();
