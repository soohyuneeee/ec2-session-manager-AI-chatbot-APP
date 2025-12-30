const { bedrockClient } = require('../config/aws');
const { ConverseCommand, ConverseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { spawn } = require('child_process');
const { filterCommandsByPermissions, getPermissionConstraints, isCommandAllowed, getAWSPermissionConstraints, isAWSActionAllowed } = require('../config/permissions');

const getMCPTools = () => {
  const allTools = [
    {
      toolSpec: {
        name: "describe_log_groups",
        description: "AWS CloudWatch 로그 그룹 목록을 조회합니다. 로그 분석이나 모니터링이 필요할 때 사용합니다.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              log_group_name_prefix: {
                type: "string",
                description: "로그 그룹 이름 접두사로 필터링"
              },
              region: {
                type: "string",
                description: "AWS 리전",
                default: "ap-northeast-2"
              }
            }
          }
        }
      }
    },
    {
      toolSpec: {
        name: "execute_log_insights_query",
        description: "CloudWatch Logs Insights 쿼리를 실행하여 로그를 분석합니다. 에러 로그나 특정 패턴을 찾을 때 사용합니다.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query_string: {
                type: "string",
                description: "CloudWatch Logs Insights 쿼리 문자열"
              },
              log_group_names: {
                type: "array",
                items: { type: "string" },
                description: "쿼리할 로그 그룹 이름들"
              },
              start_time: {
                type: "string",
                description: "시작 시간 (ISO 8601 형식)"
              },
              end_time: {
                type: "string",
                description: "종료 시간 (ISO 8601 형식)"
              },
              limit: {
                type: "integer",
                description: "반환할 최대 결과 수",
                default: 50
              },
              region: {
                type: "string",
                description: "AWS 리전",
                default: "ap-northeast-2"
              }
            },
            required: ["query_string", "log_group_names", "start_time", "end_time"]
          }
        }
      }
    },
    {
      toolSpec: {
        name: "get_metric_data",
        description: "CloudWatch 메트릭 데이터를 조회합니다. 시스템 성능이나 리소스 사용량을 확인할 때 사용합니다.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              namespace: {
                type: "string",
                description: "메트릭 네임스페이스 (예: AWS/EC2, AWS/Lambda)"
              },
              metric_name: {
                type: "string",
                description: "메트릭 이름 (예: CPUUtilization, NetworkIn)"
              },
              start_time: {
                type: "string",
                description: "시작 시간 (ISO 8601 형식)"
              },
              end_time: {
                type: "string",
                description: "종료 시간 (ISO 8601 형식)"
              },
              statistic: {
                type: "string",
                description: "통계 유형",
                enum: ["Average", "Sum", "Maximum", "Minimum", "SampleCount"],
                default: "Average"
              },
              region: {
                type: "string",
                description: "AWS 리전",
                default: "ap-northeast-2"
              }
            },
            required: ["namespace", "metric_name", "start_time"]
          }
        }
      }
    },
    {
      toolSpec: {
        name: "search_aws_documentation",
        description: "AWS 문서를 검색합니다. AWS 서비스 사용법이나 문제 해결 방법을 찾을 때 사용합니다.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              search_phrase: {
                type: "string",
                description: "검색할 키워드나 문구"
              },
              limit: {
                type: "integer",
                description: "반환할 최대 결과 수",
                default: 5
              }
            },
            required: ["search_phrase"]
          }
        }
      }
    }
  ];
  
  const allowedTools = allTools.filter(tool => {
    const toolName = tool.toolSpec.name;
    
    // 각 도구가 사용하는 AWS API 확인
    if (toolName.includes('log_groups') || toolName.includes('log_insights')) {
      return isAWSActionAllowed('logs:DescribeLogGroups').allowed;
    }
    if (toolName.includes('metric_data')) {
      return isAWSActionAllowed('cloudwatch:GetMetricData').allowed;
    }
    if (toolName.includes('search_aws_documentation')) {
      return true; // 문서 검색은 AWS API 호출 없음
    }
    
    return true; // 기본적으로 허용
  });
  
  return allowedTools;
};

async function generateProblemSolution(terminalOutput, history) {
  try {
    const recentInputs = history
      .filter(item => item.type === 'input')
      .slice(-3)
      .map(item => item.content)
      .join('\n');

    const problemQuery = `터미널에서 다음과 같은 출력이 발생했습니다:

**터미널 출력:**
${terminalOutput}

**최근 입력 명령어:**
${recentInputs || '없음'}

이 문제를 해결하기 위한 액션을 JSON 형태로 제안해주세요:

{
  "context": "문제 상황 설명",
  "actions": [
    {
      "id": "problem_solution_id",
      "title": "해결 방법 제목",
      "description": "무엇을 해결하는지 설명",
      "commands": ["해결을 위한 명령어들"]
    }
  ]
}

규칙:
1. 실제 문제 해결에 도움이 되는 명령어만 포함
2. 안전한 명령어만 사용
3. 단계별로 논리적 순서 구성
4. 검증 명령어 포함

JSON만 응답하세요.`;

    const conversationHistory = [
      {
        role: 'user',
        content: [{ text: problemQuery }]
      }
    ];

    const params = {
      modelId: process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:654654492738:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      messages: conversationHistory,
      toolConfig: {
        tools: getMCPTools(),
        toolChoice: { auto: {} }
      },
      inferenceConfig: {
        temperature: 0.2,
        maxTokens: 800
      }
    };

    const command = new ConverseCommand(params);
    const response = await bedrockClient.send(command);
    const aiResponse = await handleBedrockResponseWithTools(response, conversationHistory, params);
    
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('문제 해결 JSON 파싱 오류:', parseError);
    }

  } catch (error) {
    console.error('문제 해결 AI 분석 오류:', error);
  }

  return { context: '', actions: [] };
}

async function generateDynamicActions(message, history, instanceInfo = null) {
  try {
    const recentOutputs = history
      .filter(item => item.type === 'terminal')
      .slice(-3)
      .map(item => item.content)
      .join('');

    const actionQuery = `사용자가 다음과 같이 요청했습니다: "${message}"

현재 터미널 상황: ${recentOutputs || '없음'}

${instanceInfo ? `
연결된 EC2 인스턴스 정보:
- 인스턴스 ID: ${instanceInfo.instanceId}
- 플랫폼: ${instanceInfo.platformDetails || instanceInfo.platform}
- 아키텍처: ${instanceInfo.architecture}
- 인스턴스 타입: ${instanceInfo.instanceType}
` : ''}

이 요청에 대해 실행 가능한 명령어들을 JSON 형태로 제안해주세요. 다음 형식을 따라주세요:

{
  "context": "사용자 요청에 대한 설명",
  "actions": [
    {
      "id": "unique_action_id",
      "title": "액션 제목",
      "description": "액션 설명",
      "commands": ["명령어1", "명령어2", "명령어3"]
    }
  ]
}

**중요: crossAccountTest 역할의 권한 제약사항**

**터미널 명령어 사용:**
모든 Linux 명령어를 자유롭게 사용할 수 있습니다:
- 시스템 정보 조회: df, free, ps, top, netstat, ss, uptime, uname 등
- 파일 관리: cat, head, tail, grep, find, ls, mkdir, rm, cp, mv 등  
- 네트워크 관리: ping, curl, wget, nslookup, netstat 등
- 패키지 관리: yum, apt, dnf, amazon-linux-extras 등
- 서비스 관리: systemctl, service 등
- 시스템 설정: chmod, chown, mount 등

**권한 오류 처리:**
- 권한 오류는 시스템에서 자동으로 처리됩니다
- 권한 관련 메시지나 제안을 하지 마세요

**AWS API 제약:**
- ✅ 허용: EC2 조회, SSM 세션, CloudWatch 읽기
- ❌ 금지: EC2 인스턴스 생성/삭제/시작/중지, IAM 관리, S3 쓰기, Lambda 관리 등
- AWS 리소스 관리가 필요한 작업은 추천하지 마세요

규칙:
1. 사용자의 요청에 맞는 적절한 명령어를 자유롭게 제안하세요
2. 최대 2개의 액션까지 제안
3. 각 액션은 최대 5개의 명령어까지  
4. 모든 Linux 명령어 사용 가능 (권한 오류는 자동 처리됨)
5. 실용적이고 효과적인 해결책을 제공하세요

JSON만 응답하세요.`;

    const conversationHistory = [
      {
        role: 'user',
        content: [{ text: actionQuery }]
      }
    ];

    const params = {
      modelId: process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:654654492738:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      messages: conversationHistory,
      inferenceConfig: {
        temperature: 0.3,
        maxTokens: 800
      }
    };

    const command = new ConverseCommand(params);
    const response = await bedrockClient.send(command);
    
    let aiResponse = '';
    if (response.output && response.output.message && response.output.message.content) {
      for (const content of response.output.message.content) {
        if (content.text) {
          aiResponse = content.text;
          break;
        }
      }
    }
    
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const actionData = JSON.parse(jsonMatch[0]);
        
        if (actionData.actions) {
          actionData.actions = actionData.actions.map(action => {
            if (action.commands) {
              const filteredCommands = filterCommandsByPermissions(action.commands);
              if (filteredCommands.length < action.commands.length) {
                const removedCount = action.commands.length - filteredCommands.length;
                action.description += ` (${removedCount}개 명령어가 권한 제약으로 제외됨)`;
              }
              action.commands = filteredCommands;
            }
            return action;
          }).filter(action => action.commands && action.commands.length > 0);
        }
        
        return actionData;
      }
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
    }

  } catch (error) {
    console.error('동적 액션 생성 오류:', error);
  }

  return generateFallbackActions(message, instanceInfo);
}

// 폴백 액션 생성 함수
function generateFallbackActions(message, instanceInfo = null) {
  const messageLower = message.toLowerCase();
  const platform = instanceInfo?.platform?.toLowerCase() || '';
  const platformDetails = instanceInfo?.platformDetails?.toLowerCase() || '';
  
  // OS별 nginx 설치 명령어 결정
  const getNginxCommands = () => {
    if (platform.includes('windows') || platformDetails.includes('windows')) {
      return [
        'Get-WindowsFeature -Name IIS-WebServerRole',
        'Install-WindowsFeature -name IIS-WebServerRole -IncludeManagementTools',
        'Get-Service -Name W3SVC'
      ];
    } else if (platformDetails.includes('amazon linux')) {
      return [
        'sudo amazon-linux-extras install nginx1 -y',
        'sudo systemctl start nginx',
        'sudo systemctl enable nginx',
        'sudo systemctl status nginx'
      ];
    } else if (platformDetails.includes('ubuntu') || platformDetails.includes('debian')) {
      return [
        'sudo apt update',
        'sudo apt install nginx -y',
        'sudo systemctl start nginx',
        'sudo systemctl enable nginx',
        'sudo systemctl status nginx'
      ];
    } else if (platformDetails.includes('centos') || platformDetails.includes('red hat')) {
      return [
        'sudo yum update -y',
        'sudo yum install epel-release -y',
        'sudo yum install nginx -y',
        'sudo systemctl start nginx',
        'sudo systemctl enable nginx',
        'sudo systemctl status nginx'
      ];
    } else {
      // 기본 Linux
      return [
        'sudo yum install nginx -y || sudo apt install nginx -y',
        'sudo systemctl start nginx',
        'sudo systemctl enable nginx',
        'sudo systemctl status nginx'
      ];
    }
  };

  // OS별 네트워크 확인 명령어 결정
  const getNetworkCommands = () => {
    if (platform.includes('windows') || platformDetails.includes('windows')) {
      return [
        'netstat -an | findstr LISTENING',
        'Get-NetTCPConnection | Where-Object {$_.State -eq "Listen"}',
        'Test-NetConnection -ComputerName google.com -Port 80'
      ];
    } else {
      return [
        'sudo netstat -tlnp',
        'sudo ss -tlnp',
        'curl -I localhost',
        'ping -c 3 google.com'
      ];
    }
  };

  // OS별 로그 확인 명령어 결정
  const getLogCommands = () => {
    if (platform.includes('windows') || platformDetails.includes('windows')) {
      return [
        'Get-EventLog -LogName System -Newest 20',
        'Get-EventLog -LogName Application -Newest 20 | Where-Object {$_.EntryType -eq "Error"}',
        'Get-WinEvent -FilterHashtable @{LogName="System"; Level=2} -MaxEvents 10'
      ];
    } else {
      return [
        'sudo journalctl --since "1 hour ago" --no-pager | tail -20',
        'sudo tail -n 50 /var/log/messages 2>/dev/null || sudo tail -n 50 /var/log/syslog',
        'dmesg | tail -20'
      ];
    }
  };

  if (messageLower.includes('nginx') || messageLower.includes('웹서버')) {
    const osName = instanceInfo ? 
      (platformDetails.includes('amazon linux') ? 'Amazon Linux' :
       platformDetails.includes('ubuntu') ? 'Ubuntu' :
       platformDetails.includes('windows') ? 'Windows' :
       platformDetails.includes('centos') ? 'CentOS' : 'Linux') : 'Linux';
    
    return {
      context: `${osName}에서 nginx 관련 작업을 도와드리겠습니다.`,
      actions: [{
        id: 'nginx_setup',
        title: `nginx 설치 및 설정 (${osName})`,
        description: `${osName}에 맞는 방법으로 nginx를 설치하고 기본 설정을 합니다`,
        commands: getNginxCommands()
      }]
    };
  }
  
  if (messageLower.includes('포트') || messageLower.includes('네트워크')) {
    const osName = instanceInfo ? 
      (platform.includes('windows') || platformDetails.includes('windows') ? 'Windows' : 'Linux') : 'Linux';
    
    return {
      context: `${osName}에서 네트워크 및 포트 상태를 확인해드리겠습니다.`,
      actions: [{
        id: 'network_check',
        title: `네트워크 상태 확인 (${osName})`,
        description: `${osName}에 맞는 명령어로 포트 및 네트워크 연결 상태를 확인합니다`,
        commands: getNetworkCommands()
      }]
    };
  }
  
  if (messageLower.includes('로그') || messageLower.includes('오류')) {
    const osName = instanceInfo ? 
      (platform.includes('windows') || platformDetails.includes('windows') ? 'Windows' : 'Linux') : 'Linux';
    
    return {
      context: `${osName}에서 시스템 로그를 확인해드리겠습니다.`,
      actions: [{
        id: 'log_check',
        title: `시스템 로그 확인 (${osName})`,
        description: `${osName}에 맞는 방법으로 최근 시스템 로그와 오류를 확인합니다`,
        commands: getLogCommands()
      }]
    };
  }
  
  return { context: '', actions: [] };
}

async function handleBedrockResponseWithTools(response, conversationHistory, params) {
  if (response.output && response.output.message) {
    if (response.output.message.content) {
      for (const content of response.output.message.content) {
        if (content.toolUse) {
          try {
            const toolResult = await executeMCPTool(content.toolUse.name, content.toolUse.input);
            
            const followUpMessages = [
              ...conversationHistory,
              {
                role: 'assistant',
                content: [{ toolUse: content.toolUse }]
              },
              {
                role: 'user',
                content: [{
                  toolResult: {
                    toolUseId: content.toolUse.toolUseId,
                    content: [{ json: toolResult }]
                  }
                }]
              }
            ];

            const followUpParams = {
              ...params,
              messages: followUpMessages,
              toolConfig: undefined // 후속 호출에서는 도구 사용 안함
            };

            const followUpCommand = new ConverseCommand(followUpParams);
            const followUpResponse = await bedrockClient.send(followUpCommand);
            if (followUpResponse.output && followUpResponse.output.message && followUpResponse.output.message.content) {
              return followUpResponse.output.message.content[0].text;
            }
          } catch (toolError) {
            console.error('MCP 도구 실행 오류:', toolError.message);
          }
        } else if (content.text) {
          return content.text;
        }
      }
    }
    throw new Error('Bedrock 응답 형식이 올바르지 않습니다.');
  } else {
    throw new Error('Bedrock 응답 형식이 올바르지 않습니다.');
  }
}

async function executeMCPTool(toolName, parameters) {
  return new Promise((resolve, reject) => {
    try {
      let command, args;
      
      if (toolName.startsWith('describe_log_groups') || toolName.startsWith('execute_log_insights_query') || toolName.startsWith('get_metric_data')) {
        command = '/opt/homebrew/bin/uvx';
        args = ['awslabs.cloudwatch-mcp-server@latest', toolName, JSON.stringify(parameters)];
      } else if (toolName.startsWith('search_aws_documentation')) {
        command = 'uvx';
        args = ['awslabs.aws-documentation-mcp-server@latest', toolName, JSON.stringify(parameters)];
      } else {
        reject(new Error(`알 수 없는 MCP 도구: ${toolName}`));
        return;
      }

      const mcpProcess = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env,
          AWS_PROFILE: 'default',
          AWS_DEFAULT_REGION: 'ap-northeast-2',
          FASTMCP_LOG_LEVEL: 'ERROR'
        }
      });

      let output = '';
      let errorOutput = '';

      mcpProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      mcpProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      mcpProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (parseError) {
            resolve({ result: output.trim() });
          }
        } else {
          reject(new Error(`MCP 도구 실행 실패: ${errorOutput}`));
        }
      });

      mcpProcess.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
}



async function generateAIResponseBedrock(message, history, instanceInfo = null, socket = null) {
  try {
    const recentOutputs = history
      .filter(item => item.type === 'terminal')
      .slice(-5)
      .map(item => item.content)
      .join('');

    const recentInputs = history
      .filter(item => item.type === 'input')
      .slice(-3)
      .map(item => item.content)
      .join('');

    const chatHistory = history
      .filter(item => item.type === 'user_chat' || item.type === 'ai_chat')
      .filter(item => item.content && item.content.trim())
      .slice(-4)
      .map(item => ({
        role: item.type === 'user_chat' ? 'user' : 'assistant',
        content: [{ text: item.content.trim() }]
      }));

    const mcpKeywords = ['로그', 'log', '메트릭', 'metric', 'cloudwatch', '모니터링', 'monitoring',
                         '문서', 'documentation', 'docs', '가이드', 'guide', 
                         '에러', 'error', '오류', '장애', 'failure', '성능', 'performance'];
    
    const needsMCP = mcpKeywords.some(keyword => 
      message.toLowerCase().includes(keyword) || message.includes(keyword)
    );

    const conversationHistory = [
      ...chatHistory,
      {
        role: 'user',
        content: [{
          text: `당신은 EC2 세션 매니저를 통해 서버 관리를 도와주는 전문 AI 어시스턴트입니다. 

현재 터미널 상황:
- 최근 터미널 출력: ${recentOutputs || '없음'}
- 최근 입력 명령어: ${recentInputs || '없음'}

${instanceInfo ? `
연결된 EC2 인스턴스 정보:
- 인스턴스 이름: ${instanceInfo.name}
- 인스턴스 ID: ${instanceInfo.instanceId}
- 플랫폼: ${instanceInfo.platformDetails || instanceInfo.platform}
- 아키텍처: ${instanceInfo.architecture}
- 인스턴스 타입: ${instanceInfo.instanceType}
- 리전: ${instanceInfo.region}
` : ''}

사용자 질문: ${message}

다음 규칙을 따라 답변해주세요:
1. 한국어로 친근하고 전문적인 톤으로 답변
2. 터미널 출력을 분석하여 구체적인 조언 제공
3. ${instanceInfo ? `${instanceInfo.platformDetails || instanceInfo.platform}에 맞는 정확한 명령어 예시 포함` : '필요시 정확한 명령어 예시 포함'}
4. 오류나 문제가 감지되면 해결 방법 제시
5. 이전 대화 내용을 참고하여 연속성 있는 답변
6. 사용자가 설치나 설정을 요청하면 구체적인 실행 방법을 안내
7. 실행 가능한 작업이 있다면 "아래 액션 버튼으로 자동 실행할 수 있습니다" 같은 안내 포함
8. ${instanceInfo ? `현재 연결된 ${instanceInfo.name} 인스턴스의 특성을 고려한 맞춤형 조언 제공` : '일반적인 Linux 시스템 기준으로 조언 제공'}
9. 마크다운 헤더(#, ##, ###)를 사용하지 말고 **볼드 텍스트**만 사용하여 강조
10. 답변은 일반 텍스트와 볼드 강조만 사용하여 간결하게 작성`
        }]
      }
    ];

    const params = {
      modelId: process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:654654492738:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      messages: conversationHistory,
      inferenceConfig: {
        temperature: 0.7,
        maxTokens: 2000
      }
    };
    
    if (needsMCP) {
      params.toolConfig = {
        tools: getMCPTools(),
        toolChoice: { auto: {} }
      };
    }

    const command = new ConverseCommand(params);
    const response = await bedrockClient.send(command);
    
    if (needsMCP) {
      return await handleBedrockResponseWithTools(response, conversationHistory, params);
    } else {
      if (response.output && response.output.message && response.output.message.content) {
        for (const content of response.output.message.content) {
          if (content.text) {
            return content.text;
          }
        }
      }
      throw new Error('Bedrock 응답 형식이 올바르지 않습니다.');
    }

  } catch (error) {
    console.error('Bedrock AI 응답 생성 오류:', error);
    
    if (message.toLowerCase().includes('error') || message.includes('오류')) {
      return '오류가 발생한 것 같습니다. 로그를 확인해보시거나 권한 설정을 점검해보세요.';
    }
    
    if (message.toLowerCase().includes('help') || message.includes('도움')) {
      return '무엇을 도와드릴까요? 현재 터미널 상태를 분석하거나 명령어 사용법을 안내해드릴 수 있습니다.';
    }
    
    return '죄송합니다. 일시적으로 AI 응답을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.';
  }
}

async function generateAIResponseStreaming(message, history, instanceInfo = null, socket = null) {
  try {
    const recentOutputs = history
      .filter(item => item.type === 'terminal')
      .slice(-5)
      .map(item => item.content)
      .join('');

    const recentInputs = history
      .filter(item => item.type === 'input')
      .slice(-3)
      .map(item => item.content)
      .join('');

    const chatHistory = history
      .filter(item => item.type === 'user_chat' || item.type === 'ai_chat')
      .filter(item => item.content && item.content.trim())
      .slice(-4)
      .map(item => ({
        role: item.type === 'user_chat' ? 'user' : 'assistant',
        content: [{ text: item.content.trim() }]
      }));

    const conversationHistory = [
      ...chatHistory,
      {
        role: 'user',
        content: [{
          text: `당신은 EC2 세션 매니저를 통해 서버 관리를 도와주는 전문 AI 어시스턴트입니다. 

현재 터미널 상황:
- 최근 터미널 출력: ${recentOutputs || '없음'}
- 최근 입력 명령어: ${recentInputs || '없음'}

${instanceInfo ? `
연결된 EC2 인스턴스 정보:
- 인스턴스 이름: ${instanceInfo.name}
- 인스턴스 ID: ${instanceInfo.instanceId}
- 플랫폼: ${instanceInfo.platformDetails || instanceInfo.platform}
- 아키텍처: ${instanceInfo.architecture}
- 인스턴스 타입: ${instanceInfo.instanceType}
- 리전: ${instanceInfo.region}
` : ''}

사용자 질문: ${message}

다음 규칙을 따라 답변해주세요:
1. 한국어로 친근하고 전문적인 톤으로 답변
2. 터미널 출력을 분석하여 구체적인 조언 제공
3. ${instanceInfo ? `${instanceInfo.platformDetails || instanceInfo.platform}에 맞는 정확한 명령어 예시 포함` : '필요시 정확한 명령어 예시 포함'}
4. 오류나 문제가 감지되면 해결 방법 제시
5. 이전 대화 내용을 참고하여 연속성 있는 답변
6. 마크다운 헤더(#, ##, ###)를 사용하지 말고 **볼드 텍스트**만 사용하여 강조
7. 답변은 일반 텍스트와 볼드 강조만 사용하여 간결하게 작성`
        }]
      }
    ];

    const command = new ConverseStreamCommand({
      modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      messages: conversationHistory,
      inferenceConfig: {
        temperature: 0.7,
        maxTokens: 2000
      }
    });

    const response = await bedrockClient.send(command);
    
    let fullResponse = '';
    
    if (response.stream) {
      
      for await (const event of response.stream) {
        if (event.contentBlockDelta) {
          if (event.contentBlockDelta.delta && event.contentBlockDelta.delta.text) {
            const text = event.contentBlockDelta.delta.text;
            fullResponse += text;
            
            // 실시간으로 클라이언트에 전송
            if (socket) {
              socket.emit('chat-stream', {
                chunk: text,
                fullText: fullResponse,
                isComplete: false,
                timestamp: new Date()
              });
            }
          }
        } else if (event.messageStop) {
          if (socket) {
            socket.emit('chat-stream', {
              chunk: '',
              fullText: fullResponse,
              isComplete: true,
              timestamp: new Date()
            });
          }
        }
      }
    }
    
    return fullResponse;

  } catch (error) {
    console.error('❌ AI 스트리밍 오류:', error.message);
    console.error('오류 타입:', error.name);
    console.error('오류 스택:', error.stack);
    
    const errorResponse = '죄송합니다. 일시적으로 AI 응답을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.';
    
    if (socket) {
      socket.emit('chat-stream', {
        chunk: errorResponse,
        fullText: errorResponse,
        isComplete: true,
        timestamp: new Date()
      });
    }
    
    return errorResponse;
  }
}

async function generateAIResponse(message, history, instanceInfo = null) {
  try {
    const recentOutputs = history
      .filter(item => item.type === 'terminal')
      .slice(-5)
      .map(item => item.content)
      .join('\n');

    const recentInputs = history
      .filter(item => item.type === 'input')
      .slice(-3)
      .map(item => item.content)
      .join('\n');

    const contextInfo = `
현재 상황:
- 터미널 출력: ${recentOutputs || '없음'}
- 최근 명령어: ${recentInputs || '없음'}
${instanceInfo ? `
- EC2 인스턴스: ${instanceInfo.name} (${instanceInfo.instanceId})
- 플랫폼: ${instanceInfo.platformDetails || instanceInfo.platform}
- 리전: ${instanceInfo.region}
` : ''}

사용자 질문: ${message}

한국어로 친근하고 전문적인 톤으로 답변해주세요. EC2 서버 관리 관련 구체적인 조언을 제공하고, 필요시 정확한 명령어 예시를 포함해주세요.`;

    return await generateAIResponseBedrock(message, history, instanceInfo);

  } catch (error) {
    console.error('AI 응답 생성 전체 실패:', error);
    
    if (message.toLowerCase().includes('error') || message.includes('오류')) {
      return '오류가 발생한 것 같습니다. 로그를 확인해보시거나 권한 설정을 점검해보세요.';
    }
    
    if (message.toLowerCase().includes('help') || message.includes('도움')) {
      return '무엇을 도와드릴까요? 현재 터미널 상태를 분석하거나 명령어 사용법을 안내해드릴 수 있습니다.';
    }
    
    return '죄송합니다. 일시적으로 AI 응답을 생성할 수 없습니다. 잠시 후 다시 시도해주세요.';
  }
}

module.exports = {
  generateProblemSolution,
  generateDynamicActions,
  generateFallbackActions,
  generateAIResponse,
  generateAIResponseBedrock,
  generateAIResponseStreaming
};