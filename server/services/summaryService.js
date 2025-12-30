const { bedrockClient } = require('../config/aws');
const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

async function generateExecutionSummary(commands, executionResults) {
  try {
    const conversationHistory = [
      {
        role: 'user',
        content: [{
          text: `다음 명령어들이 EC2 서버에서 실행되었습니다:

**실행된 명령어들:**
${commands.map((cmd, index) => `${index + 1}. ${cmd}`).join('\n')}

**각 명령어의 실행 결과:**
${executionResults.map((result, index) => `
--- 명령어 ${index + 1} 결과 ---
${result.trim()}
`).join('\n')}

이 실행 결과를 분석하여 다음 형식으로 간결하게 요약해주세요:

**✅ 완료 작업**
- 핵심 설치/설정 내용만 간단히

**⚠️ 주의사항** (있다면)
- 중요한 경고나 알아둘 점만

**🎯 다음 단계**
- 추가로 할 수 있는 작업 2-3개만 구체적 명령어와 함께
- 예: "nginx 상태 확인 (systemctl status nginx)"

한국어로 작성하고, 각 섹션은 2-3줄 이내로 간결하게 작성해주세요. 마크다운 헤더(#)를 사용하지 말고 **볼드 텍스트**만 사용하세요.`
        }]
      }
    ];

    const params = {
      modelId: process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:654654492738:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      messages: conversationHistory,
      inferenceConfig: {
        temperature: 0.3,
        maxTokens: 1500
      }
    };

    const command = new ConverseCommand(params);
    const response = await bedrockClient.send(command);
    
    if (response.output && response.output.message && response.output.message.content) {
      return response.output.message.content[0].text;
    }

  } catch (error) {
    console.error('실행 요약 생성 오류:', error);
    
    // 폴백: 간단한 요약
    return generateSimpleSummary(commands, executionResults);
  }

  return generateSimpleSummary(commands, executionResults);
}

function generateSimpleSummary(commands, executionResults) {
  const allOutput = executionResults.join(' ').toLowerCase();
  
  let summary = '**✅ 완료 작업**\n\n';
  
  // 설치된 패키지 감지
  const installedItems = [];
  if (allOutput.includes('nginx')) installedItems.push('nginx 웹서버');
  if (allOutput.includes('docker')) installedItems.push('Docker 컨테이너');
  if (allOutput.includes('python')) installedItems.push('Python');
  if (allOutput.includes('mysql')) installedItems.push('MySQL');
  if (allOutput.includes('apache')) installedItems.push('Apache');
  
  if (installedItems.length > 0) {
    summary += `${installedItems.join(', ')} 설치/설정 완료\n`;
  } else {
    summary += `${commands.length}개 명령어 실행 완료\n`;
  }
  
  // 서비스 상태
  if (allOutput.includes('active (running)')) {
    summary += '서비스가 정상 실행 중\n';
  }
  
  summary += '\n**🎯 다음 단계**\n\n';
  
  // 간단한 다음 단계 제안
  if (allOutput.includes('nginx')) {
    summary += '- nginx 상태 확인 (systemctl status nginx)\n';
    summary += '- 웹서버 테스트 (curl -I localhost)\n';
  } else if (allOutput.includes('docker')) {
    summary += '- Docker 상태 확인 (systemctl status docker)\n';
    summary += '- Docker 버전 확인 (docker --version)\n';
  } else {
    summary += '- 시스템 상태 확인 (ps aux)\n';
    summary += '- 디스크 사용량 확인 (df -h)\n';
  }
  
  return summary;
}

async function generateFollowUpActions(commands, executionResults, executionSummary = null) {
  try {
    if (executionSummary) {
      const followUpFromSummary = extractFollowUpFromSummary(executionSummary);
      if (followUpFromSummary.length > 0) {
        return followUpFromSummary;
      }
    }

    const conversationHistory = [
      {
        role: 'user',
        content: [{
          text: `다음 명령어들이 성공적으로 실행되었습니다:

**실행된 명령어:**
${commands.map((cmd, index) => `${index + 1}. ${cmd}`).join('\n')}

**실행 결과:**
${executionResults.join('\n---\n')}

이제 추가로 수행하면 좋을 후속 작업들을 JSON 형태로 제안해주세요:

{
  "context": "후속 작업 설명",
  "actions": [
    {
      "id": "followup_action_id",
      "title": "후속 작업 제목",
      "description": "왜 이 작업이 필요한지 설명",
      "commands": ["후속 명령어들"]
    }
  ]
}

규칙:
1. 방금 실행한 작업과 관련된 후속 작업만 제안
2. 테스트, 확인, 최적화 등의 작업 포함
3. 최대 2개의 후속 액션까지
4. 실용적이고 도움이 되는 작업만

JSON만 응답하세요.`
        }]
      }
    ];

    const params = {
      modelId: process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:654654492738:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      messages: conversationHistory,
      inferenceConfig: {
        temperature: 0.3,
        maxTokens: 600
      }
    };

    const command = new ConverseCommand(params);
    const response = await bedrockClient.send(command);
    
    if (response.output && response.output.message && response.output.message.content) {
      const aiResponse = response.output.message.content[0].text;
      
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const followUpData = JSON.parse(jsonMatch[0]);
          return followUpData.actions || [];
        }
      } catch (parseError) {
        console.error('후속 액션 JSON 파싱 오류:', parseError);
      }
    }

  } catch (error) {
    console.error('후속 액션 생성 오류:', error);
  }

  return [];
}

function extractFollowUpFromSummary(summary) {
  try {
    // "다음 단계 제안" 섹션 찾기
    const nextStepsMatch = summary.match(/\*\*다음 단계[^*]*\*\*\s*([\s\S]*?)(?=\*\*|$)/i);
    if (!nextStepsMatch) {
      return [];
    }

    const nextStepsText = nextStepsMatch[1].trim();
    const lines = nextStepsText.split('\n').filter(line => line.trim());
    
    const actions = [];
    let actionCounter = 1;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
        const suggestion = trimmedLine.replace(/^[-•]\s*/, '').trim();
        
        if (suggestion.length > 10) { // 의미있는 제안만 처리
          // 제안에서 명령어 추출 시도
          const commands = extractCommandsFromSuggestion(suggestion);
          
          actions.push({
            id: `summary_followup_${actionCounter}`,
            title: generateActionTitle(suggestion),
            description: suggestion,
            commands: commands.length > 0 ? commands : ['echo "수동으로 진행해주세요: ' + suggestion + '"']
          });
          
          actionCounter++;
          
          // 최대 3개까지만
          if (actions.length >= 3) break;
        }
      }
    }

    return actions;
  } catch (error) {
    console.error('요약에서 후속 액션 추출 오류:', error);
    return [];
  }
}

function extractCommandsFromSuggestion(suggestion) {
  const commands = [];
  const lowerSuggestion = suggestion.toLowerCase();
  
  const commandInParentheses = suggestion.match(/\(([^)]+)\)/);
  if (commandInParentheses) {
    const extractedCommand = commandInParentheses[1].trim();
    if (extractedCommand.includes(' ') || extractedCommand.match(/^[a-zA-Z]/)) {
      commands.push(extractedCommand);
      return commands;
    }
  }
  
  if (lowerSuggestion.includes('상태 확인') || lowerSuggestion.includes('status')) {
    if (lowerSuggestion.includes('nginx')) commands.push('systemctl status nginx');
    else if (lowerSuggestion.includes('docker')) commands.push('systemctl status docker');
    else if (lowerSuggestion.includes('apache')) commands.push('systemctl status apache2');
    else if (lowerSuggestion.includes('mysql')) commands.push('systemctl status mysql');
    else if (lowerSuggestion.includes('postgresql')) commands.push('systemctl status postgresql');
    else if (lowerSuggestion.includes('서비스')) commands.push('systemctl list-units --type=service --state=active');
  }
  
  if (lowerSuggestion.includes('테스트') || lowerSuggestion.includes('test')) {
    if (lowerSuggestion.includes('nginx')) commands.push('nginx -t');
    else if (lowerSuggestion.includes('curl') || lowerSuggestion.includes('웹') || lowerSuggestion.includes('http')) {
      commands.push('curl -I localhost');
    } else if (lowerSuggestion.includes('docker')) commands.push('docker --version');
    else if (lowerSuggestion.includes('연결') || lowerSuggestion.includes('connection')) {
      commands.push('curl -I localhost');
    }
  }
  
  if (lowerSuggestion.includes('로그') || lowerSuggestion.includes('log')) {
    if (lowerSuggestion.includes('nginx')) commands.push('tail -f /var/log/nginx/error.log');
    else if (lowerSuggestion.includes('apache')) commands.push('tail -f /var/log/apache2/error.log');
    else if (lowerSuggestion.includes('system') || lowerSuggestion.includes('시스템')) {
      commands.push('journalctl -f');
    } else {
      commands.push('journalctl -xe');
    }
  }
  
  if (lowerSuggestion.includes('포트') || lowerSuggestion.includes('port')) {
    commands.push('netstat -tlnp');
  }
  
  if (lowerSuggestion.includes('방화벽') || lowerSuggestion.includes('firewall')) {
    commands.push('ufw status');
  }
  
  if (lowerSuggestion.includes('디스크') || lowerSuggestion.includes('disk') || lowerSuggestion.includes('용량')) {
    commands.push('df -h');
  }
  
  if (lowerSuggestion.includes('메모리') || lowerSuggestion.includes('memory')) {
    commands.push('free -h');
  }
  
  if (lowerSuggestion.includes('프로세스') || lowerSuggestion.includes('process')) {
    commands.push('ps aux');
  }
  
  if (lowerSuggestion.includes('설정') || lowerSuggestion.includes('config')) {
    if (lowerSuggestion.includes('nginx')) commands.push('cat /etc/nginx/nginx.conf');
    else if (lowerSuggestion.includes('apache')) commands.push('cat /etc/apache2/apache2.conf');
  }
  
  if (lowerSuggestion.includes('보안') || lowerSuggestion.includes('security')) {
    commands.push('ufw status', 'fail2ban-client status');
  }
  
  if (lowerSuggestion.includes('업데이트') || lowerSuggestion.includes('update')) {
    commands.push('yum check-update');
  }
  
  if (lowerSuggestion.includes('백업') || lowerSuggestion.includes('backup')) {
    commands.push('ls -la /backup', 'df -h');
  }
  
  return commands;
}

function generateActionTitle(suggestion) {
  const lowerSuggestion = suggestion.toLowerCase();
  
  if (lowerSuggestion.includes('상태 확인')) return '서비스 상태 확인';
  if (lowerSuggestion.includes('테스트')) return '설정 테스트';
  if (lowerSuggestion.includes('로그')) return '로그 확인';
  if (lowerSuggestion.includes('방화벽')) return '방화벽 설정 확인';
  if (lowerSuggestion.includes('포트')) return '포트 사용 현황 확인';
  if (lowerSuggestion.includes('디스크')) return '디스크 사용량 확인';
  if (lowerSuggestion.includes('메모리')) return '메모리 사용량 확인';
  if (lowerSuggestion.includes('보안')) return '보안 설정 확인';
  if (lowerSuggestion.includes('백업')) return '백업 설정';
  if (lowerSuggestion.includes('업데이트')) return '시스템 업데이트';
  
  return suggestion.length > 20 ? suggestion.substring(0, 20) + '...' : suggestion;
}

module.exports = {
  generateExecutionSummary,
  generateSimpleSummary,
  generateFollowUpActions
};