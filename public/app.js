let tasksState = [];
let logsState = {};
let tokenStatsState = {};
let currentModalTaskId = null;
let eventSource = null;
let dashboardUsername = localStorage.getItem('DASHBOARD_USER') || 'admin';
let dashboardPassword = localStorage.getItem('DASHBOARD_PASS') || '1234';

// DOM Elements
const loginModal = document.getElementById('loginModal');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');

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

// Auth Check & Login
btnLoginSubmit.addEventListener('click', doLogin);
if (loginUsername) loginUsername.addEventListener('keyup', (e) => { if (e.key === 'Enter') doLogin(); });
loginPassword.addEventListener('keyup', (e) => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  const user = (loginUsername && loginUsername.value.trim()) ? loginUsername.value.trim() : 'admin';
  const pass = (loginPassword && loginPassword.value.trim()) ? loginPassword.value.trim() : '1234';
  
  dashboardUsername = user;
  dashboardPassword = pass;
  localStorage.setItem('DASHBOARD_USER', user);
  localStorage.setItem('DASHBOARD_PASS', pass);
  loginError.classList.add('hidden');
  initSse();
}

// Initialize SSE Connection
function initSse() {
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`/api/events?user=${encodeURIComponent(dashboardUsername)}&key=${encodeURIComponent(dashboardPassword)}`);

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
    loginError.classList.remove('hidden');
    loginError.textContent = '인증에 실패했습니다. 계정 ID 및 비밀번호를 확인해주세요.';
  };
}

// Helper fetch with Auth Header
async function authFetch(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    'x-dashboard-user': dashboardUsername,
    'x-dashboard-key': dashboardPassword
  };
  const res = await fetch(url, options);
  if (res.status === 401) {
    loginModal.classList.remove('hidden');
    loginError.classList.remove('hidden');
    loginError.textContent = '인증이 만료되었거나 계정 정보가 틀립니다.';
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

// Change Credentials (Username & Password)
document.getElementById('btnChangePassword').addEventListener('click', async () => {
  const u1 = document.getElementById('inputNewUsername').value.trim();
  const p1 = document.getElementById('inputNewPassword').value.trim();
  const p2 = document.getElementById('inputNewPasswordConfirm').value.trim();
  const msgBox = document.getElementById('pwdChangeMsg');

  if (!u1 || u1.length < 2) {
    msgBox.className = 'message-box error margin-top';
    msgBox.textContent = '계정 ID는 최소 2자 이상 입력해야 합니다.';
    return;
  }
  if (!p1 || p1.length < 4) {
    msgBox.className = 'message-box error margin-top';
    msgBox.textContent = '비밀번호는 최소 4자 이상 입력해야 합니다.';
    return;
  }
  if (p1 !== p2) {
    msgBox.className = 'message-box error margin-top';
    msgBox.textContent = '두 비밀번호가 일치하지 않습니다.';
    return;
  }

  const res = await authFetch('/api/admin/change-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newUsername: u1, newPassword: p1 })
  });
  const data = await res.json();
  if (data.success) {
    dashboardUsername = u1;
    dashboardPassword = p1;
    localStorage.setItem('DASHBOARD_USER', u1);
    localStorage.setItem('DASHBOARD_PASS', p1);
    msgBox.className = 'message-box success margin-top';
    msgBox.textContent = '✅ 계정 ID 및 비밀번호가 성공적으로 변경되었습니다.';
    document.getElementById('inputNewPassword').value = '';
    document.getElementById('inputNewPasswordConfirm').value = '';
  } else {
    msgBox.className = 'message-box error margin-top';
    msgBox.textContent = `❌ ${data.error || '변경 실패'}`;
  }
});

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

// Initial start
initSse();
