let tasksState = [];
let logsState = {};
let tokenStatsState = {};
let currentModalTaskId = null;
let eventSource = null;
// Supabase State & Config
let supabaseClient = null;
let supabaseSession = null;
let serverAuthConfig = {
  authEnabled: true,
  supabaseEnabled: false,
  supabaseUrl: '',
  supabaseAnonKey: ''
};

// DOM Elements - Auth & Profile
const loginModal = document.getElementById('loginModal');
const formSupabaseAuth = document.getElementById('formSupabaseAuth');
const supabaseEmail = document.getElementById('supabaseEmail');
const supabasePassword = document.getElementById('supabasePassword');
const supabaseAuthError = document.getElementById('supabaseAuthError');
const btnSupabaseLogin = document.getElementById('btnSupabaseLogin');
const btnSupabaseSignUp = document.getElementById('btnSupabaseSignUp');
const supabaseNotConfiguredNotice = document.getElementById('supabaseNotConfiguredNotice');

const userStatusBadge = document.getElementById('userStatusBadge');
const btnLogout = document.getElementById('btnLogout');

// DOM Elements - Metrics
const statActiveCount = document.getElementById('statActiveCount');
const statTotalCount = document.getElementById('statTotalCount');
const statSuccessRate = document.getElementById('statSuccessRate');
const statTotalTokens = document.getElementById('statTotalTokens');
const statSavedTokens = document.getElementById('statSavedTokens');
const statSavingsRatio = document.getElementById('statSavingsRatio');
const statEstimatedCost = document.getElementById('statEstimatedCost');

const pipelineNodes = document.getElementById('pipelineNodes');
const agentGrid = document.getElementById('agentGrid');

// Nav Views
const dashboardView = document.getElementById('dashboardView');
const adminView = document.getElementById('adminView');
const btnTabDashboard = document.getElementById('btnTabDashboard');
const btnTabAdmin = document.getElementById('btnTabAdmin');

// Modals
const logModal = document.getElementById('logModal');
const modalAgentTitle = document.getElementById('modalAgentTitle');
const modalLogContent = document.getElementById('modalLogContent');

const agentModal = document.getElementById('agentModal');
const agentForm = document.getElementById('agentForm');
const agentModalTitle = document.getElementById('agentModalTitle');

// --- Supabase Client Initialization ---
async function initAuthSystem() {
  try {
    const res = await fetch('/api/auth/config');
    const data = await res.json();
    if (data.success) {
      serverAuthConfig = data;
    }
  } catch (err) {
    console.warn('Failed to fetch auth config:', err);
  }

  // Supabase 클라이언트 초기화
  if (serverAuthConfig.supabaseUrl && serverAuthConfig.supabaseAnonKey && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(serverAuthConfig.supabaseUrl, serverAuthConfig.supabaseAnonKey);
      supabaseNotConfiguredNotice.classList.add('hidden');

      // 세션 복원 확인
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (sessionData && sessionData.session) {
        supabaseSession = sessionData.session;
        updateUserUI(supabaseSession.user.email);
        loginModal.classList.add('hidden');
        initSse();
        return;
      }

      // 세션 상태 변경 리스너
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
          supabaseSession = session;
          updateUserUI(session.user.email);
          loginModal.classList.add('hidden');
          initSse();
        } else {
          supabaseSession = null;
          updateUserUI(null);
          loginModal.classList.remove('hidden');
        }
      });
    } catch (e) {
      console.error('Supabase client init error:', e);
      supabaseNotConfiguredNotice.classList.remove('hidden');
    }
  } else {
    supabaseNotConfiguredNotice.classList.remove('hidden');
  }

  // 세션이 없으면 로그인 모달 표시
  if (!supabaseSession) {
    loginModal.classList.remove('hidden');
  }
}

// 사용자 프로필 배지 갱신
function updateUserUI(email) {
  if (!userStatusBadge) return;
  if (!email) {
    userStatusBadge.textContent = '👤 로그인 필요';
    userStatusBadge.style.borderColor = 'rgba(255,255,255,0.2)';
    userStatusBadge.style.color = 'var(--text-muted)';
  } else {
    userStatusBadge.textContent = `⚡ ${email}`;
    userStatusBadge.style.borderColor = 'rgba(6,182,212,0.5)';
    userStatusBadge.style.color = 'var(--accent-cyan)';
  }
}

// --- Supabase Login Action ---
btnSupabaseLogin.addEventListener('click', doSupabaseLogin);
supabaseEmail.addEventListener('keyup', (e) => { if (e.key === 'Enter') doSupabaseLogin(); });
supabasePassword.addEventListener('keyup', (e) => { if (e.key === 'Enter') doSupabaseLogin(); });

async function doSupabaseLogin() {
  supabaseAuthError.classList.add('hidden');
  if (!supabaseClient) {
    supabaseAuthError.textContent = 'Supabase Project URL 및 Anon Key 설정이 필요합니다.';
    supabaseAuthError.classList.remove('hidden');
    return;
  }

  const email = supabaseEmail.value.trim();
  const password = supabasePassword.value.trim();

  if (!email || !password) {
    supabaseAuthError.textContent = '이메일과 비밀번호를 모두 입력해주세요.';
    supabaseAuthError.classList.remove('hidden');
    return;
  }

  btnSupabaseLogin.disabled = true;
  btnSupabaseLogin.textContent = '로그인 중...';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      supabaseAuthError.textContent = `로그인 실패: ${error.message}`;
      supabaseAuthError.classList.remove('hidden');
    } else if (data.session) {
      supabaseSession = data.session;
      updateUserUI(data.session.user.email);
      loginModal.classList.add('hidden');
      initSse();
    }
  } catch (err) {
    supabaseAuthError.textContent = '로그인 통신 오류가 발생했습니다.';
    supabaseAuthError.classList.remove('hidden');
  } finally {
    btnSupabaseLogin.disabled = false;
    btnSupabaseLogin.textContent = '로그인';
  }
}

// --- Supabase Sign Up Action ---
btnSupabaseSignUp.addEventListener('click', async () => {
  supabaseAuthError.classList.add('hidden');
  if (!supabaseClient) {
    supabaseAuthError.textContent = 'Supabase Project URL 및 Anon Key 설정이 필요합니다.';
    supabaseAuthError.classList.remove('hidden');
    return;
  }

  const email = supabaseEmail.value.trim();
  const password = supabasePassword.value.trim();

  if (!email || !password) {
    supabaseAuthError.textContent = '가입할 이메일과 비밀번호를 입력해주세요.';
    supabaseAuthError.classList.remove('hidden');
    return;
  }
  if (password.length < 6) {
    supabaseAuthError.textContent = '비밀번호는 최소 6자 이상이어야 합니다.';
    supabaseAuthError.classList.remove('hidden');
    return;
  }

  btnSupabaseSignUp.disabled = true;
  btnSupabaseSignUp.textContent = '가입 중...';

  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      supabaseAuthError.textContent = `회원가입 실패: ${error.message}`;
      supabaseAuthError.classList.remove('hidden');
    } else {
      if (data.session) {
        supabaseSession = data.session;
        updateUserUI(data.session.user.email);
        loginModal.classList.add('hidden');
        initSse();
      } else {
        alert('🎉 가입 완료! 이메일 인증이 필요한 경우 메일함을 확인해 주시거나 바로 로그인해 보세요.');
      }
    }
  } catch (err) {
    supabaseAuthError.textContent = '회원가입 처리 중 오류가 발생했습니다.';
    supabaseAuthError.classList.remove('hidden');
  } finally {
    btnSupabaseSignUp.disabled = false;
    btnSupabaseSignUp.textContent = '회원가입';
  }
});

// --- Logout Action ---
btnLogout.addEventListener('click', async () => {
  if (confirm('대시보드에서 로그아웃하시겠습니까?')) {
    if (eventSource) eventSource.close();

    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    supabaseSession = null;
    updateUserUI(null);
    loginModal.classList.remove('hidden');
  }
});

// --- Initialize SSE Connection (Supabase Only) ---
function initSse() {
  if (eventSource) eventSource.close();

  if (!supabaseSession || !supabaseSession.access_token) {
    loginModal.classList.remove('hidden');
    return;
  }

  const sseUrl = `/api/events?token=${encodeURIComponent(supabaseSession.access_token)}`;
  eventSource = new EventSource(sseUrl);

  eventSource.addEventListener('init', (e) => {
    loginModal.classList.add('hidden');
    const data = JSON.parse(e.data);
    tasksState = data.tasks;
    logsState = data.logs || {};
    tokenStatsState = data.tokenStats || {};
    renderAll();
    loadAdminSettings();
    loadExecutionHistory();
  });

  eventSource.addEventListener('state', (e) => {
    const data = JSON.parse(e.data);
    tasksState = data.tasks;
    tokenStatsState = data.tokenStats || {};
    renderAll();
  });

  eventSource.addEventListener('log', (e) => {
    const { taskId, logLine } = JSON.parse(e.data);
    if (!logsState[taskId]) logsState[taskId] = [];
    logsState[taskId].push(logLine);
    if (logsState[taskId].length > 100) logsState[taskId].shift();

    updateCardTerminal(taskId);

    if (currentModalTaskId === taskId) {
      renderModalLogs(taskId);
    }
  });

  eventSource.onerror = (err) => {
    console.warn('SSE Auth error or Disconnected.', err);
    loginModal.classList.remove('hidden');
    supabaseAuthError.classList.remove('hidden');
    supabaseAuthError.textContent = '인증 토큰이 만료되었습니다. 다시 로그인해주세요.';
  };
}

// --- Helper fetch with Supabase Bearer Auth ---
async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (supabaseSession && supabaseSession.access_token) {
    headers['Authorization'] = `Bearer ${supabaseSession.access_token}`;
  }

  options.headers = headers;
  const res = await fetch(url, options);

  if (res.status === 401) {
    loginModal.classList.remove('hidden');
    supabaseAuthError.classList.remove('hidden');
    supabaseAuthError.textContent = '인증 세션이 만료되었습니다. 다시 로그인해주세요.';
  }
  return res;
}

// Top Navigation Switching
btnTabDashboard.addEventListener('click', () => {
  btnTabDashboard.classList.add('active');
  btnTabAdmin.classList.remove('active');
  dashboardView.classList.remove('hidden');
  adminView.classList.add('hidden');
});

btnTabAdmin.addEventListener('click', () => {
  btnTabAdmin.classList.add('active');
  btnTabDashboard.classList.remove('active');
  adminView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  loadAdminSettings();
  loadExecutionHistory();
});

// Admin Sub Tab Switching
document.querySelectorAll('.sub-tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-sub-panel').forEach(p => p.classList.remove('active'));

    e.target.classList.add('active');
    const targetId = e.target.getAttribute('data-target');
    const panel = document.getElementById(targetId);
    if (panel) panel.classList.add('active');

    if (targetId === 'adminSubHistory') {
      loadExecutionHistory();
    }
  });
});

// Render Functions
function renderAll() {
  renderMetrics();
  renderPipeline();
  renderGrid();
  renderAdminAgentTable();
}

function renderMetrics() {
  const total = tasksState.length;
  const running = tasksState.filter(t => t.status === 'RUNNING').length;
  const completed = tasksState.filter(t => t.status === 'COMPLETED').length;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  statActiveCount.textContent = running;
  statTotalCount.textContent = total;
  statSuccessRate.textContent = successRate;

  if (tokenStatsState) {
    statTotalTokens.textContent = (tokenStatsState.totalTokens || 0).toLocaleString();
    statSavedTokens.textContent = (tokenStatsState.totalSavedTokens || 0).toLocaleString();
    statSavingsRatio.textContent = tokenStatsState.savingsRatio || 0;
    statEstimatedCost.textContent = tokenStatsState.estimatedCostUsdFormatted || '$0.0000';
  }
}

function renderPipeline() {
  pipelineNodes.innerHTML = '';

  if (tasksState.length === 0) {
    pipelineNodes.innerHTML = '<span class="metric-unit">등록된 에이전트가 없습니다.</span>';
    return;
  }

  tasksState.forEach((task) => {
    const nodeEl = document.createElement('div');
    nodeEl.className = `pipeline-node ${task.status === 'RUNNING' ? 'running' : ''}`;
    nodeEl.innerHTML = `
      <span>${task.id} (${task.name})</span>
      <span class="badge badge-${task.status.toLowerCase()}">${task.status}</span>
    `;
    pipelineNodes.appendChild(nodeEl);

    if (task.nextTaskId) {
      const arrowEl = document.createElement('span');
      arrowEl.className = 'pipeline-arrow';
      arrowEl.innerHTML = '➔';
      pipelineNodes.appendChild(arrowEl);
    }
  });
}

function renderGrid() {
  agentGrid.innerHTML = '';

  tasksState.forEach((task) => {
    const card = document.createElement('div');
    card.className = `agent-card glass ${task.status === 'RUNNING' ? 'running' : ''}`;
    card.id = `card-${task.id}`;

    const logs = logsState[task.id] || [];
    const latestLog = logs.length > 0 ? logs[logs.length - 1] : '대기 중...';

    card.innerHTML = `
      <div class="card-header">
        <div class="agent-title-box">
          <h3>${task.name}</h3>
          <div class="agent-category">${task.category || '일반 작업'} • ${task.id}</div>
        </div>
        <span class="badge badge-${task.status.toLowerCase()}">${task.status}</span>
      </div>

      <p class="agent-desc">${task.description || ''}</p>

      <div class="progress-container">
        <div class="progress-info">
          <span class="step-text" title="${task.currentStep || ''}">${task.currentStep || '대기 중'}</span>
          <span style="font-weight:700;">${task.progress || 0}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar" style="width: ${task.progress || 0}%;"></div>
        </div>
      </div>

      <div class="card-tags">
        <span class="tag">🤖 ${task.model}</span>
        ${task.nextTaskId ? `<span class="tag">🔗 Next: ${task.nextTaskId}</span>` : ''}
        <span class="tag">⚡ Saved: ${(task.savedTokens || 0).toLocaleString()} T</span>
      </div>

      <div class="mini-terminal" id="terminal-${task.id}">${escapeHtml(latestLog)}</div>

      <div class="card-actions">
        ${task.status === 'RUNNING'
          ? `<button class="btn btn-outline-danger" onclick="stopTask('${task.id}')">🛑 중지</button>`
          : `<button class="btn btn-primary" onclick="runTask('${task.id}')">▶️ 실행</button>`
        }
        <button class="btn btn-secondary" onclick="openLogModal('${task.id}')">📜 콘솔</button>
        <button class="btn btn-accent" onclick="openEditModal('${task.id}')">✏️ 편집</button>
      </div>
    `;

    agentGrid.appendChild(card);
  });
}

// Render Admin Agent Management Table
function renderAdminAgentTable() {
  const tbody = document.getElementById('adminAgentTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (tasksState.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">등록된 에이전트가 없습니다.</td></tr>`;
    return;
  }

  tasksState.forEach((task) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${task.id}</code></td>
      <td><strong>${escapeHtml(task.name)}</strong></td>
      <td><span class="tag">${escapeHtml(task.category || '기본')}</span></td>
      <td><code>${escapeHtml(task.command)} ${(task.args || []).join(' ')}</code></td>
      <td><span class="badge badge-info">${task.model}</span></td>
      <td>${task.nextTaskId ? `<code>🔗 ${task.nextTaskId}</code>` : '<span style="color:var(--text-muted);">-</span>'}</td>
      <td><span class="badge badge-${task.status.toLowerCase()}">${task.status}</span></td>
      <td>
        <button class="btn btn-accent btn-sm" onclick="openEditModal('${task.id}')">✏️ 수정</button>
        <button class="btn btn-outline-danger btn-sm" onclick="deleteTask('${task.id}')">🗑️ 삭제</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateCardTerminal(taskId) {
  const termEl = document.getElementById(`terminal-${taskId}`);
  if (termEl && logsState[taskId]) {
    const logs = logsState[taskId];
    const latest = logs.length > 0 ? logs[logs.length - 1] : '';
    termEl.textContent = latest;
    termEl.scrollTop = termEl.scrollHeight;
  }
}

// API Calls
async function runTask(taskId) {
  await authFetch('/api/tasks/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  });
}

async function stopTask(taskId) {
  await authFetch('/api/tasks/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  });
}

async function deleteTask(taskId) {
  if (confirm(`정말로 에이전트(${taskId})를 삭제하시겠습니까?`)) {
    await authFetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
  }
}

// Admin API Actions & Settings
async function loadAdminSettings() {
  try {
    const res = await authFetch('/api/admin/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      const s = data.settings;
      if (s.compressionLevel) {
        document.getElementById('settingCompressionLevel').value = s.compressionLevel;
      }
      if (s.pricing) {
        for (const [model, p] of Object.entries(s.pricing)) {
          const inp = document.getElementById(`price_${model}_input`);
          const out = document.getElementById(`price_${model}_output`);
          if (inp) inp.value = p.input;
          if (out) out.value = p.output;
        }
      }

      // Supabase Settings Fields
      const cbSupabaseEnabled = document.getElementById('settingSupabaseEnabled');
      const inputSupabaseUrl = document.getElementById('settingSupabaseUrl');
      const inputSupabaseKey = document.getElementById('settingSupabaseAnonKey');
      if (cbSupabaseEnabled) cbSupabaseEnabled.checked = !!s.supabaseEnabled;
      if (inputSupabaseUrl) inputSupabaseUrl.value = s.supabaseUrl || '';
      if (inputSupabaseKey) inputSupabaseKey.value = s.supabaseAnonKey || '';
    }
  } catch (e) {
    console.error('Failed to load admin settings:', e);
  }
}

document.getElementById('btnSaveTokenSettings').addEventListener('click', async () => {
  const compressionLevel = document.getElementById('settingCompressionLevel').value;
  const pricing = {
    'gemini-1.5-flash': {
      input: parseFloat(document.getElementById('price_gemini-1.5-flash_input').value) || 0.075,
      output: parseFloat(document.getElementById('price_gemini-1.5-flash_output').value) || 0.30
    },
    'gemini-1.5-pro': {
      input: parseFloat(document.getElementById('price_gemini-1.5-pro_input').value) || 1.25,
      output: parseFloat(document.getElementById('price_gemini-1.5-pro_output').value) || 5.00
    },
    'gpt-4o-mini': {
      input: parseFloat(document.getElementById('price_gpt-4o-mini_input').value) || 0.15,
      output: parseFloat(document.getElementById('price_gpt-4o-mini_output').value) || 0.60
    },
    'gpt-4o': {
      input: parseFloat(document.getElementById('price_gpt-4o_input').value) || 2.50,
      output: parseFloat(document.getElementById('price_gpt-4o_output').value) || 10.00
    },
    'claude-3-haiku': {
      input: parseFloat(document.getElementById('price_claude-3-haiku_input').value) || 0.25,
      output: parseFloat(document.getElementById('price_claude-3-haiku_output').value) || 1.25
    },
    'claude-3-5-sonnet': {
      input: parseFloat(document.getElementById('price_claude-3-5-sonnet_input').value) || 3.00,
      output: parseFloat(document.getElementById('price_claude-3-5-sonnet_output').value) || 15.00
    }
  };

  const res = await authFetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ compressionLevel, pricing })
  });
  const data = await res.json();
  if (data.success) {
    alert('💡 토큰 절감 파라미터 및 LLM 단가 설정이 저장되었습니다.');
  }
});

// Save Supabase Configuration
const btnSaveSupabaseConfig = document.getElementById('btnSaveSupabaseConfig');
if (btnSaveSupabaseConfig) {
  btnSaveSupabaseConfig.addEventListener('click', async () => {
    const supabaseUrl = (document.getElementById('settingSupabaseUrl').value || '').trim();
    const supabaseAnonKey = (document.getElementById('settingSupabaseAnonKey').value || '').trim();
    const supabaseEnabled = document.getElementById('settingSupabaseEnabled').checked;
    const msgBox = document.getElementById('supabaseSaveMsg');

    btnSaveSupabaseConfig.disabled = true;
    btnSaveSupabaseConfig.textContent = '저장 중...';

    try {
      const res = await authFetch('/api/admin/supabase-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabaseAnonKey, supabaseEnabled })
      });
      const data = await res.json();
      if (data.success) {
        msgBox.className = 'message-box success';
        msgBox.textContent = '✅ Supabase 연동 설정이 성공적으로 저장되었습니다.';
        msgBox.classList.remove('hidden');

        // 클라이언트 상태 재초기화
        serverAuthConfig.supabaseUrl = supabaseUrl;
        serverAuthConfig.supabaseAnonKey = supabaseAnonKey;
        serverAuthConfig.supabaseEnabled = supabaseEnabled;

        if (supabaseUrl && supabaseAnonKey && window.supabase) {
          supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
          supabaseNotConfiguredNotice.classList.add('hidden');
        }
      } else {
        msgBox.className = 'message-box error';
        msgBox.textContent = `❌ ${data.message || '저장 실패'}`;
        msgBox.classList.remove('hidden');
      }
    } catch (err) {
      msgBox.className = 'message-box error';
      msgBox.textContent = '❌ 통신 오류 발생';
      msgBox.classList.remove('hidden');
    } finally {
      btnSaveSupabaseConfig.disabled = false;
      btnSaveSupabaseConfig.textContent = '💾 Supabase 연동 설정 저장';
    }
  });
}

// Proxy Ping Test
document.getElementById('btnTestProxyPing').addEventListener('click', async () => {
  const res = await authFetch('/api/admin/ping-proxy', { method: 'POST' });
  const data = await res.json();
  if (data.success) {
    document.getElementById('pingSseCount').textContent = `${data.sseClientsCount} 명`;
    document.getElementById('pingTime').textContent = new Date(data.pingTime).toLocaleString('ko-KR');
    alert('✅ Reverse Proxy 핑 연결 상태가 정상입니다. (SSE 무지연 스트리밍 활성화)');
  }
});

// History Functions
async function loadExecutionHistory() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  try {
    const res = await authFetch('/api/admin/history');
    const data = await res.json();
    tbody.innerHTML = '';

    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">기록된 실행 이력이 없습니다.</td></tr>`;
      return;
    }

    data.history.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.formattedTime || item.timestamp}</td>
        <td><code>${item.taskId}</code></td>
        <td><strong>${escapeHtml(item.taskName)}</strong></td>
        <td><span class="badge badge-${item.status.toLowerCase()}">${item.status}</span></td>
        <td><span class="tag">${item.model}</span></td>
        <td>${item.durationSeconds}초</td>
        <td>${(item.usedTokens || 0).toLocaleString()} T</td>
        <td>${(item.savedTokens || 0).toLocaleString()} T</td>
        <td>$${(item.costUsd || 0).toFixed(5)}</td>
        <td>${escapeHtml(item.summary)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Failed to load history:', e);
  }
}

document.getElementById('btnRefreshHistory').addEventListener('click', loadExecutionHistory);
document.getElementById('btnClearHistory').addEventListener('click', async () => {
  if (confirm('모든 실행 이력 기록을 삭제하시겠습니까?')) {
    await authFetch('/api/admin/history', { method: 'DELETE' });
    loadExecutionHistory();
  }
});

// Button Actions
document.getElementById('btnPipelineRun').addEventListener('click', async () => {
  await authFetch('/api/pipeline/run', { method: 'POST' });
});

document.getElementById('btnParallelRun').addEventListener('click', async () => {
  await authFetch('/api/parallel/run', { method: 'POST' });
});

document.getElementById('btnReset').addEventListener('click', async () => {
  if (confirm('모든 작업 진행 상태 및 로그를 초기화하시겠습니까?')) {
    await authFetch('/api/reset', { method: 'POST' });
  }
});

// Log Modal Functions
function openLogModal(taskId) {
  currentModalTaskId = taskId;
  const task = tasksState.find(t => t.id === taskId);
  modalAgentTitle.textContent = `📜 Console Log: ${task ? task.name : taskId}`;
  renderModalLogs(taskId);
  logModal.classList.remove('hidden');
}

function renderModalLogs(taskId) {
  const logs = logsState[taskId] || [];
  modalLogContent.textContent = logs.join('\n') || '로그가 존재하지 않습니다.';
  modalLogContent.scrollTop = modalLogContent.scrollHeight;
}

document.getElementById('btnCloseLogModal').addEventListener('click', closeLogModal);
document.getElementById('btnCloseModalFooter').addEventListener('click', closeLogModal);
document.getElementById('btnClearModalLog').addEventListener('click', () => {
  if (currentModalTaskId) {
    logsState[currentModalTaskId] = [];
    renderModalLogs(currentModalTaskId);
    updateCardTerminal(currentModalTaskId);
  }
});

function closeLogModal() {
  logModal.classList.add('hidden');
  currentModalTaskId = null;
}

// Add / Edit Modal Functions
document.getElementById('btnAddAgent').addEventListener('click', () => {
  openEditModal(null);
});
document.getElementById('btnAdminAddAgent').addEventListener('click', () => {
  openEditModal(null);
});

function openEditModal(taskId) {
  agentForm.reset();
  if (taskId) {
    const task = tasksState.find(t => t.id === taskId);
    if (task) {
      agentModalTitle.textContent = `✏️ 에이전트 수정: ${task.name}`;
      document.getElementById('formAgentId').value = task.id;
      document.getElementById('formName').value = task.name || '';
      document.getElementById('formCategory').value = task.category || '';
      document.getElementById('formDescription').value = task.description || '';
      document.getElementById('formCommand').value = task.command || '';
      document.getElementById('formArgs').value = JSON.stringify(task.args || []);
      document.getElementById('formNextTaskId').value = task.nextTaskId || '';
      document.getElementById('formModel').value = task.model || 'gemini-1.5-flash';
    }
  } else {
    agentModalTitle.textContent = `➕ 신규 에이전트 등록`;
    document.getElementById('formAgentId').value = '';
  }
  agentModal.classList.remove('hidden');
}

document.getElementById('btnCloseAgentModal').addEventListener('click', closeAgentModal);
document.getElementById('btnCancelAgentModal').addEventListener('click', closeAgentModal);

function closeAgentModal() {
  agentModal.classList.add('hidden');
}

agentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('formAgentId').value;
  const name = document.getElementById('formName').value;
  const category = document.getElementById('formCategory').value;
  const description = document.getElementById('formDescription').value;
  const command = document.getElementById('formCommand').value;
  const rawArgs = document.getElementById('formArgs').value;
  const nextTaskId = document.getElementById('formNextTaskId').value;
  const model = document.getElementById('formModel').value;

  let args = [];
  try {
    args = rawArgs ? JSON.parse(rawArgs) : [];
  } catch (err) {
    args = [rawArgs];
  }

  const payload = {
    id: id || undefined,
    name,
    category,
    description,
    command,
    args,
    nextTaskId: nextTaskId || null,
    model
  };

  await authFetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  closeAgentModal();
});

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Initial start with Auth system check
initAuthSystem();
