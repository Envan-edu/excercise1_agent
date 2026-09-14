const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const tokenOptimizer = require('./utils/tokenOptimizer');
const settingsManager = require('./utils/settingsManager');

class TaskEngine {
  constructor() {
    this.configPath = path.join(__dirname, 'config', 'tasks.json');
    this.tasks = [];
    this.activeProcesses = new Map(); // taskId -> childProcess
    this.taskLogs = new Map(); // taskId -> Array of log strings
    this.taskOutputs = new Map(); // taskId -> JSON result object
    this.sseClients = []; // SSE Response objects

    this.loadTasks();
  }

  // 1. Task Config 관리
  loadTasks() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        this.tasks = JSON.parse(raw);
        // 초기화
        this.tasks.forEach(t => {
          t.status = t.status || 'IDLE';
          t.progress = 0;
          t.currentStep = '대기 중';
          t.usedTokens = 0;
          t.savedTokens = 0;
          if (!this.taskLogs.has(t.id)) this.taskLogs.set(t.id, []);
        });
      }
    } catch (err) {
      console.error('Failed to load tasks.json:', err);
    }
  }

  saveTasks() {
    try {
      const dataToSave = this.tasks.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
        description: t.description,
        command: t.command,
        args: t.args,
        params: t.params,
        dependsOn: t.dependsOn,
        nextTaskId: t.nextTaskId,
        model: t.model,
        tokenQuota: t.tokenQuota,
        status: t.status
      }));
      fs.writeFileSync(this.configPath, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save tasks.json:', err);
    }
  }

  // 2. SSE 브로드캐스트
  addSseClient(res) {
    this.sseClients.push(res);
    // 현재 전체 상태 즉시 전송
    this.sendSseEvent(res, 'init', {
      tasks: this.tasks,
      logs: Object.fromEntries(this.taskLogs),
      tokenStats: tokenOptimizer.getStats()
    });
  }

  removeSseClient(res) {
    this.sseClients = this.sseClients.filter(c => c !== res);
  }

  broadcast(event, data) {
    this.sseClients.forEach(res => this.sendSseEvent(res, event, data));
  }

  sendSseEvent(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // 3. 작업 실행 로직
  runTask(taskId, inputContext = null) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return { success: false, error: 'Task not found' };

    if (task.status === 'RUNNING') {
      return { success: false, error: 'Task is already running' };
    }

    // 상태 변경
    task.status = 'RUNNING';
    task.progress = 10;
    task.currentStep = '작업 초기화 중...';
    task.startTime = Date.now();
    this.addLog(taskId, `🚀 [${task.name}] 실행 시작 (Command: ${task.command} ${(task.args || []).join(' ')})`);
    
    if (inputContext) {
      this.addLog(taskId, `📥 [Context Input] 이전 작업 연계 데이터 수신 완료`);
    }

    this.broadcastState();

    // 토큰 최적화 수치 가상 적용 (데모 & 실제 프로세스 추적)
    const promptSample = `${task.name} ${JSON.stringify(task.params)} ${JSON.stringify(inputContext || {})}`;
    const compResult = tokenOptimizer.compressContext(promptSample);
    
    // 캐시 확인
    const cacheCheck = tokenOptimizer.checkCache(promptSample);
    if (cacheCheck.hit) {
      this.addLog(taskId, `⚡ [Smart Cache] 캐시 매칭 성공! 토큰 ${cacheCheck.savedTokens}개 절감 (비용 $0)`);
      task.savedTokens += cacheCheck.savedTokens;
    } else {
      task.savedTokens += compResult.savedTokens;
    }

    // 프로세스 실행
    try {
      const child = spawn(task.command, task.args || [], {
        shell: true,
        env: { ...process.env, TASK_CONTEXT: JSON.stringify(inputContext || {}) }
      });

      this.activeProcesses.set(taskId, child);

      // stdout 수신
      child.stdout.on('data', (data) => {
        const str = data.toString().trim();
        if (!str) return;

        this.addLog(taskId, str);
        
        // Progress 자동 추산
        if (task.progress < 90) {
          task.progress += 20;
          task.currentStep = str.length > 30 ? str.substring(0, 30) + '...' : str;
          this.broadcastState();
        }

        // 결과 JSON 포착
        if (str.includes('RESULT_JSON:')) {
          try {
            const jsonPart = str.split('RESULT_JSON:')[1];
            const parsed = JSON.parse(jsonPart);
            this.taskOutputs.set(taskId, parsed);
          } catch (e) {
            // ignore
          }
        }
      });

      // stderr 수신
      child.stderr.on('data', (data) => {
        const errStr = data.toString().trim();
        if (errStr) {
          this.addLog(taskId, `⚠️ [STDERR] ${errStr}`);
        }
      });

      // 프로세스 종료
      child.on('close', (code) => {
        this.activeProcesses.delete(taskId);
        const durationSec = Math.round((Date.now() - (task.startTime || Date.now())) / 1000);

        if (code === 0) {
          task.status = 'COMPLETED';
          task.progress = 100;
          task.currentStep = '작업 완료';
          this.addLog(taskId, `✅ [${task.name}] 성공적으로 완료되었습니다.`);

          // 토큰 기록
          const usage = tokenOptimizer.recordUsage(task.model, promptSample, `Success execution of ${task.name}`, compResult.savedTokens);
          task.usedTokens += usage.totalTokens;

          // 실행 이력 기록
          settingsManager.recordHistory({
            taskId: task.id,
            taskName: task.name,
            status: 'COMPLETED',
            usedTokens: usage.totalTokens,
            savedTokens: compResult.savedTokens,
            costUsd: usage.costUsd,
            model: task.model,
            durationSeconds: durationSec,
            summary: '정상 종료'
          });

          // 다음 파이프라인 연계 트리거
          if (task.nextTaskId) {
            const outputData = this.taskOutputs.get(taskId) || { output: 'Completed' };
            this.addLog(taskId, `🔗 [Pipeline Chaining] 다음 연계 작업(${task.nextTaskId})을 트리거합니다...`);
            setTimeout(() => {
              this.runTask(task.nextTaskId, outputData);
            }, 1000);
          }
        } else {
          task.status = 'FAILED';
          task.progress = 100;
          task.currentStep = `종료 코드: ${code}`;
          this.addLog(taskId, `❌ [${task.name}] 작업 실행 실패 (Exit Code: ${code})`);

          settingsManager.recordHistory({
            taskId: task.id,
            taskName: task.name,
            status: 'FAILED',
            usedTokens: 0,
            savedTokens: 0,
            costUsd: 0,
            model: task.model,
            durationSeconds: durationSec,
            summary: `실패 (Exit Code: ${code})`
          });
        }

        this.broadcastState();
      });

      child.on('error', (err) => {
        this.activeProcesses.delete(taskId);
        task.status = 'FAILED';
        task.currentStep = err.message;
        this.addLog(taskId, `💥 [ERROR] 실행 오류: ${err.message}`);

        settingsManager.recordHistory({
          taskId: task.id,
          taskName: task.name,
          status: 'FAILED',
          usedTokens: 0,
          savedTokens: 0,
          costUsd: 0,
          model: task.model,
          durationSeconds: Math.round((Date.now() - (task.startTime || Date.now())) / 1000),
          summary: `오류: ${err.message}`
        });

        this.broadcastState();
      });

      return { success: true };
    } catch (err) {
      task.status = 'FAILED';
      task.currentStep = err.message;
      this.addLog(taskId, `💥 [EXCEPT] 예외 발생: ${err.message}`);
      this.broadcastState();
      return { success: false, error: err.message };
    }
  }

  // 작업 중지
  stopTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return { success: false, error: 'Task not found' };

    const child = this.activeProcesses.get(taskId);
    if (child) {
      child.kill('SIGTERM');
      this.activeProcesses.delete(taskId);
    }

    task.status = 'PAUSED';
    task.currentStep = '사용자에 의해 일시정지됨';
    this.addLog(taskId, `🛑 [${task.name}] 작업이 중지되었습니다.`);
    this.broadcastState();

    return { success: true };
  }

  // 전체 파이프라인 (연계) 실행
  runPipeline() {
    // 루트 작업(dependsOn이 없는 작업)부터 찾기
    const rootTasks = this.tasks.filter(t => !t.dependsOn || t.dependsOn.length === 0);
    rootTasks.forEach(t => this.runTask(t.id));
    return { success: true, count: rootTasks.length };
  }

  // 전체 병렬 실행
  runAllParallel() {
    this.tasks.forEach(t => this.runTask(t.id));
    return { success: true, count: this.tasks.length };
  }

  // 전체 초기화
  resetAll() {
    this.tasks.forEach(t => {
      this.stopTask(t.id);
      t.status = 'IDLE';
      t.progress = 0;
      t.currentStep = '대기 중';
      t.usedTokens = 0;
      t.savedTokens = 0;
      this.taskLogs.set(t.id, []);
    });
    this.broadcastState();
    return { success: true };
  }

  // 작업 수정/추가
  upsertTask(taskData) {
    let existing = this.tasks.find(t => t.id === taskData.id);
    if (existing) {
      Object.assign(existing, taskData);
    } else {
      taskData.id = taskData.id || `agent_${Date.now()}`;
      taskData.status = 'IDLE';
      taskData.progress = 0;
      taskData.currentStep = '대기 중';
      taskData.usedTokens = 0;
      taskData.savedTokens = 0;
      this.tasks.push(taskData);
      this.taskLogs.set(taskData.id, []);
    }

    this.saveTasks();
    this.broadcastState();
    return { success: true, task: taskData };
  }

  // 작업 삭제
  deleteTask(taskId) {
    this.stopTask(taskId);
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.taskLogs.delete(taskId);
    this.saveTasks();
    this.broadcastState();
    return { success: true };
  }

  // 헬퍼
  addLog(taskId, message) {
    if (!this.taskLogs.has(taskId)) {
      this.taskLogs.set(taskId, []);
    }
    const timestamp = new Date().toLocaleTimeString('ko-KR');
    const logLine = `[${timestamp}] ${message}`;
    const logs = this.taskLogs.get(taskId);
    logs.push(logLine);
    // 최대 100줄 유지
    if (logs.length > 100) logs.shift();

    this.broadcast('log', { taskId, logLine });
  }

  broadcastState() {
    this.broadcast('state', {
      tasks: this.tasks,
      tokenStats: tokenOptimizer.getStats()
    });
  }
}

module.exports = new TaskEngine();
