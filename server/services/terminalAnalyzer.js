const logPatterns = {
  error: /error|Error|ERROR|failed|Failed|FAILED|exception|Exception/i,
  warning: /warning|Warning|WARN|warn/i,
  permission: /permission denied|Permission denied|access denied|Access denied|sudo|root/i,
  network: /connection|Connection|timeout|Timeout|refused|Refused|unreachable/i,
  service: /systemctl|service|daemon|started|stopped|active|inactive|enabled|disabled/i,
  package: /yum|dnf|apt|install|installed|package|Package|repository|Repository/i,
  nginx: /nginx|Nginx|NGINX|httpd|apache|web server|port 80|port 443/i
};

const alertCooldowns = new Map();

function checkCooldown(socketId, alertType, cooldownMs = 30000) {
  const key = `${socketId}_${alertType}`;
  const now = Date.now();
  const lastAlert = alertCooldowns.get(key);
  
  if (lastAlert && (now - lastAlert) < cooldownMs) {
    return false;
  }
  
  alertCooldowns.set(key, now);
  return true;
}

function analyzeTerminalOutput(output, history, socketId) {
  const analysis = {
    patterns: [],
    suggestedActions: [],
    context: '',
    severity: 'info'
  };

  const cleanOutput = output.trim();
  if (!cleanOutput || cleanOutput.match(/^[\$#]\s*$/) || cleanOutput.length < 3) {
    return analysis;
  }

  for (const [patternName, regex] of Object.entries(logPatterns)) {
    if (regex.test(output)) {
      analysis.patterns.push(patternName);
    }
  }

  const outputLower = cleanOutput.toLowerCase();
  
  if (outputLower.includes('complete') || outputLower.includes('success') || 
      outputLower.includes('active (running)') || outputLower.includes('enabled') ||
      outputLower.includes('nothing to do') || outputLower.includes('no packages marked') ||
      outputLower.includes('already installed') || outputLower.includes('already up to date') ||
      outputLower.includes('no updates available') || outputLower.includes('0 upgraded') ||
      outputLower.includes('packages are up to date') || outputLower.includes('no action needed') ||
      // yum/dnf 관련 정상 메시지
      outputLower.includes('no packages marked for update') ||
      outputLower.includes('dependencies resolved') ||
      outputLower.includes('transaction check') ||
      outputLower.includes('running transaction') ||
      // apt 관련 정상 메시지
      outputLower.includes('reading package lists') ||
      outputLower.includes('building dependency tree') ||
      outputLower.includes('reading state information') ||
      outputLower.includes('0 to remove and 0 not to upgrade') ||
      outputLower.includes('done') || outputLower.includes('finished') ||
      outputLower.includes('completed successfully')) {
    return analysis;
  }

  if ((outputLower.includes('command not found') || 
            (outputLower.includes('no package') && !outputLower.includes('nothing to do')) ||
            outputLower.includes('unit not found') ||
            (outputLower.includes('failed to') && !outputLower.includes('nothing to do')) ||
            (outputLower.includes('error:') && !outputLower.includes('nothing to do'))) &&
           !outputLower.includes('nothing to do') &&
           !outputLower.includes('no packages marked') &&
           !outputLower.includes('already up to date') &&
           checkCooldown(socketId, 'ai_analysis', 30000)) {
    
    analysis.needsAIAnalysis = true;
    analysis.context = '문제를 감지했습니다. AI 분석을 실행하여 해결 방안을 제안받으시겠습니까?';
    analysis.severity = 'warning';
  }

  return analysis;
}

function analyzeExecutionErrors(results) {
  const analysis = {
    message: '',
    suggestion: '',
    alternativeActions: []
  };

  const allOutput = results.join(' ').toLowerCase();

  if (allOutput.includes('no package nginx available') || allOutput.includes('amazon-linux-extras')) {
    analysis.message = '🔍 Amazon Linux 2에서는 nginx가 기본 패키지가 아닙니다.';
    analysis.suggestion = 'Amazon Linux Extras를 통해 설치해야 합니다.';
    analysis.alternativeActions.push('nginx_amazon_linux');
  } else if (allOutput.includes('unit not found') && allOutput.includes('nginx')) {
    analysis.message = '🔍 nginx 서비스를 찾을 수 없습니다.';
    analysis.suggestion = '먼저 nginx를 올바르게 설치해야 합니다.';
    analysis.alternativeActions.push('nginx_amazon_linux');
  } else if (allOutput.includes('command not found') && !allOutput.includes('which')) {
    analysis.message = '🔍 명령어를 찾을 수 없습니다.';
    analysis.suggestion = '필요한 패키지가 설치되지 않았을 수 있습니다.';
  } else if (allOutput.includes('error:') || allOutput.includes('failed:')) {
    analysis.message = '🔍 명령어 실행 중 오류가 발생했습니다.';
    analysis.suggestion = '터미널 출력을 확인하여 구체적인 오류 내용을 파악해보세요.';
  } else {
    analysis.message = '🔍 일부 경고가 있었지만 대부분 정상적으로 실행된 것 같습니다.';
    analysis.suggestion = '터미널 출력을 확인하여 실제 결과를 확인해보세요.';
  }

  return analysis;
}

module.exports = {
  analyzeTerminalOutput,
  analyzeExecutionErrors,
  checkCooldown
};