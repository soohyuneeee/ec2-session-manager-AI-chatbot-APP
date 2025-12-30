const pty = require('node-pty');
const { getSSMClient } = require('../config/aws');
const { StartSessionCommand } = require('@aws-sdk/client-ssm');
const { getEC2InstancesByRegion, generateOSSpecificActions, getAWSRoleInfo, getEC2InstancesByAccount, getEC2InstancesByRegionForAccount } = require('../services/ec2Service');
const { analyzeTerminalOutput } = require('../services/terminalAnalyzer');
const { generateProblemSolution, generateDynamicActions, generateAIResponse, generateAIResponseStreaming } = require('../services/aiService');
const { executeCommandSequence } = require('../services/executionService');
const historyService = require('../services/historyService');

// 활성 세션 저장
const activeSessions = new Map();

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('✅ 클라이언트 연결:', socket.id);

    // EC2 인스턴스 목록 조회
    socket.on('get-ec2-instances', async (data = {}) => {
      try {
        const { accountId, externalId } = data;
        
        socket.emit('ec2-instances-loading', { 
          message: accountId 
            ? `계정 ${accountId}의 EC2 인스턴스를 조회하고 있습니다...` 
            : 'EC2 인스턴스를 조회하고 있습니다...' 
        });
        
        // 계정 자격 증명 가져오기
        const { getAccountCredentials, getBaseAccountInfo } = require('../config/accounts');
        const credentials = await getAccountCredentials(accountId, externalId);
        
        // 계정 정보 생성
        let accountInfo;
        if (accountId) {
          accountInfo = {
            accountId: accountId,
            accountName: accountId,
            externalId: externalId,
            isBase: false
          };
        } else {
          const baseAccount = await getBaseAccountInfo();
          accountInfo = {
            accountId: baseAccount.accountId,
            accountName: '기본 계정',
            externalId: null,
            isBase: true
          };
        }
        
        // 해당 계정의 인스턴스 조회
        const instancesByRegion = await getEC2InstancesByRegionForAccount(credentials, accountInfo);
        
        socket.emit('ec2-instances-loaded', { 
          instancesByRegion,
          totalInstances: Object.values(instancesByRegion).reduce((sum, instances) => sum + instances.length, 0),
          accountId: accountInfo.accountId
        });
      } catch (error) {
        console.error('EC2 인스턴스 조회 오류:', error);
        socket.emit('ec2-instances-error', { error: error.message });
      }
    });

    // 멀티 계정 EC2 인스턴스 목록 조회
    socket.on('get-ec2-instances-multi-account', async () => {
      try {
        socket.emit('ec2-instances-loading', { message: '멀티 계정에서 EC2 인스턴스를 조회하고 있습니다...' });
        
        const instancesByAccount = await getEC2InstancesByAccount();
        
        const totalInstances = Object.values(instancesByAccount).reduce((sum, acc) => sum + acc.totalInstances, 0);
        
        socket.emit('ec2-instances-multi-account-loaded', { 
          instancesByAccount,
          totalInstances,
          totalAccounts: Object.keys(instancesByAccount).length
        });
      } catch (error) {
        console.error('멀티 계정 EC2 인스턴스 조회 오류:', error);
        socket.emit('ec2-instances-error', { error: error.message });
      }
    });

    // AWS Role 정보 조회
    socket.on('get-aws-role-info', async () => {
      try {
        const roleInfo = await getAWSRoleInfo();
        socket.emit('aws-role-info-loaded', roleInfo);
      } catch (error) {
        console.error('AWS Role 정보 조회 오류:', error);
        socket.emit('aws-role-info-error', { error: error.message });
      }
    });

    // 특정 인스턴스의 추천 액션 조회
    socket.on('get-instance-actions', (data) => {
      const { instanceInfo } = data;
      try {
        const recommendedActions = generateOSSpecificActions(instanceInfo);
        socket.emit('instance-actions-loaded', { 
          instanceInfo,
          recommendedActions 
        });
      } catch (error) {
        console.error('인스턴스 액션 생성 오류:', error);
        socket.emit('instance-actions-error', { error: error.message });
      }
    });

    // EC2 세션 매니저 연결 (크로스 어카운트 지원)
    socket.on('start-session', async (data) => {
      const { instanceId, instanceInfo } = data;
      const accountId = instanceInfo?.accountId || null;
      const externalId = instanceInfo?.externalId || null;
      
      try {
        console.log(`🚀 세션 시작 요청: ${instanceId}${accountId ? ` (계정: ${accountId})` : ''}`);
        
        // 기존 히스토리 로드
        const existingHistory = await historyService.getHistory(instanceId);
        
        // 계정별 자격 증명 가져오기
        const { getAccountCredentials } = require('../config/accounts');
        const credentials = await getAccountCredentials(accountId, externalId);
        
        // 자격 증명이 함수인 경우 (fromEnv) 실제 값으로 변환
        let actualCredentials;
        if (typeof credentials === 'function') {
          actualCredentials = await credentials();
        } else {
          actualCredentials = credentials;
        }
        
        console.log(`🔑 자격 증명 획득 완료 (계정: ${accountId || '기본 계정'})`);
        
        // 계정별 SSM 클라이언트 가져오기
        const ssmClient = await getSSMClient(accountId, externalId);
        
        console.log(`🔑 SSM 클라이언트 생성 완료 (계정: ${accountId || '기본 계정'})`);
        
        // SSM 세션 시작
        const sessionParams = {
          Target: instanceId,
          DocumentName: 'SSM-SessionManagerRunShell'
        };

        const command = new StartSessionCommand(sessionParams);
        const session = await ssmClient.send(command);
        console.log(`✅ SSM 세션 생성: ${session.SessionId}`);
        
        // AWS CLI를 위한 환경 변수 설정 (임시 자격 증명 포함)
        const awsEnv = {
          ...process.env,
          AWS_REGION: process.env.AWS_REGION || 'ap-northeast-2'
        };
        
        // 임시 자격 증명이 있으면 환경 변수로 전달
        if (actualCredentials && actualCredentials.accessKeyId) {
          awsEnv.AWS_ACCESS_KEY_ID = actualCredentials.accessKeyId;
          awsEnv.AWS_SECRET_ACCESS_KEY = actualCredentials.secretAccessKey;
          if (actualCredentials.sessionToken) {
            awsEnv.AWS_SESSION_TOKEN = actualCredentials.sessionToken;
          }
          console.log(`🔐 임시 자격 증명을 AWS CLI에 전달 (Session Token: ${actualCredentials.sessionToken ? 'Yes' : 'No'})`);
        }
        
        const awsCliArgs = [
          'ssm', 'start-session',
          '--target', instanceId,
          '--region', process.env.AWS_REGION || 'ap-northeast-2'
        ];

        // 세션 매니저 터미널 프로세스 생성 (색상 지원 강화)
        const ptyProcess = pty.spawn('aws', awsCliArgs, {
          name: 'xterm-256color', // 256색 지원
          cols: 80,
          rows: 30,
          cwd: process.env.HOME,
          env: awsEnv
        });

        activeSessions.set(socket.id, {
          ptyProcess,
          sessionId: session.SessionId,
          instanceId,
          instanceInfo: instanceInfo || null, // 인스턴스 정보 저장
          chatHistory: [] // 빈 배열로 시작 (히스토리는 요청 시에만 로드)
        });

        // 히스토리는 자동으로 전송하지 않음 - 사용자가 요청할 때만 전송
        // 대신 히스토리 개수만 전송
        const historyCount = existingHistory.length;
        if (historyCount > 0) {
          socket.emit('history-count', {
            instanceId,
            count: historyCount
          });
        }



        // 터미널 출력을 클라이언트로 전송
        ptyProcess.on('data', (data) => {
          socket.emit('terminal-output', data);
          
          // 채팅봇을 위한 명령어 분석 (권한 문제 감지 비활성화)
          const sessionData = activeSessions.get(socket.id);
          if (sessionData) {
            const terminalMessage = {
              type: 'terminal',
              content: data,
              timestamp: new Date()
            };
            
            // 세션 히스토리에만 추가 (Redis에는 저장하지 않음)
            sessionData.chatHistory.push(terminalMessage);
            
            // 실시간 로그 분석 (권한 문제 제외)
            const analysis = analyzeTerminalOutput(data, sessionData.chatHistory, socket.id);
            
            // AI 분석을 위한 이벤트 발생 (권한 문제 제외)
            socket.emit('analyze-command', {
              output: data,
              history: sessionData.chatHistory.slice(-10),
              analysis: analysis
            });
            
            // 실시간 터미널 출력에서는 오류 감지 비활성화
            // executionService에서만 명령어 실행 완료 후 오류를 감지하도록 함
            // 이렇게 하면 중복 메시지를 방지할 수 있습니다
          }
        });

        ptyProcess.on('exit', () => {
          socket.emit('session-ended');
          activeSessions.delete(socket.id);
        });

        socket.emit('session-started', { sessionId: session.SessionId });

      } catch (error) {
        console.error('세션 시작 오류:', error);
        socket.emit('session-error', { error: error.message });
      }
    });

    // 터미널 입력 처리
    socket.on('terminal-input', (data) => {
      const session = activeSessions.get(socket.id);
      if (session && session.ptyProcess) {
        session.ptyProcess.write(data);
        
        // 입력 명령어도 세션 히스토리에만 저장 (Redis에는 저장하지 않음)
        const inputMessage = {
          type: 'input',
          content: data,
          timestamp: new Date()
        };
        
        session.chatHistory.push(inputMessage);
      }
    });

    // 채팅봇 메시지 처리 (스트리밍)
    socket.on('chat-message', async (data) => {
      const { message, instanceInfo } = data;
      const session = activeSessions.get(socket.id);
      
      // 인스턴스 정보를 세션에 저장 (클라이언트에서 전달된 정보 우선)
      if (instanceInfo && session) {
        session.instanceInfo = instanceInfo;
      }
      
      if (session) {
        // 세션에 저장된 인스턴스 정보 사용
        const currentInstanceInfo = session.instanceInfo || instanceInfo;
        
        // 사용자 메시지를 히스토리에 추가
        const userMessage = {
          type: 'user_chat',
          content: message,
          timestamp: new Date()
        };
        
        session.chatHistory.push(userMessage);
        
        // Redis에 사용자 메시지 저장
        await historyService.saveMessage(session.instanceId, userMessage);
        
        // 스트리밍 시작 알림
        socket.emit('chat-stream-start', {
          timestamp: new Date()
        });

        // AI 응답과 동적 액션을 병렬로 생성 (동적 액션은 선택적)
        const [response, dynamicActions] = await Promise.all([
          generateAIResponseStreaming(message, session.chatHistory, currentInstanceInfo, socket),
          generateDynamicActions(message, session.chatHistory, currentInstanceInfo)
        ]);
        
        // AI 응답을 히스토리에 추가
        const aiMessage = {
          type: 'ai_chat',
          content: response,
          timestamp: new Date()
        };
        
        session.chatHistory.push(aiMessage);
        
        // Redis에 AI 응답 저장
        await historyService.saveMessage(session.instanceId, aiMessage);
        
        // 스트리밍 완료 후 액션 정보 전송
        socket.emit('chat-stream-end', {
          timestamp: new Date(),
          // 액션이 있으면 함께 포함
          ...(dynamicActions.actions && dynamicActions.actions.length > 0 && {
            hasDynamicActions: true,
            dynamicActions: dynamicActions.actions,
            actionContext: dynamicActions.context
          })
        });
      }
    });

    // 동적 액션 실행 처리
    socket.on('execute-dynamic-action', (data) => {
      const { action, actionId } = data;
      const session = activeSessions.get(socket.id);
      
      if (session && session.ptyProcess && action && action.commands) {
        // 액션 버튼 클릭 확인 메시지
        socket.emit('action-button-clicked', {
          actionId: actionId || action.id,
          timestamp: new Date()
        });
        
        // 명령어들을 순차적으로 실행 (액션 제목 전달)
        executeCommandSequence(
          session.ptyProcess, 
          action.commands, 
          socket, 
          0, 
          [], 
          actionId || action.id,
          false,
          action.title || action.description || '액션 실행' // 액션 제목 전달
        );
      }
    });

    // 분석 프롬프트 응답 처리
    socket.on('analysis-response', async (data) => {
      const { response, analysisData } = data; // response: 'yes' | 'no'
      const session = activeSessions.get(socket.id);
      
      if (session && response === 'yes' && analysisData) {
        try {
          // AI 분석 실행
          const problemAnalysis = await generateProblemSolution(
            analysisData.output, 
            analysisData.history
          );
          
          if (problemAnalysis.actions.length > 0) {
            socket.emit('chat-response', {
              message: `🔧 **문제 해결 방안**\n\n${problemAnalysis.context}`,
              timestamp: new Date(),
              isAutoGenerated: true,
              hasDynamicActions: true,
              dynamicActions: problemAnalysis.actions,
              actionContext: problemAnalysis.context
            });
          }
        } catch (error) {
          console.error('AI 문제 분석 오류:', error);
          socket.emit('chat-response', {
            message: '🚨 **분석 오류**\n\n문제 분석 중 오류가 발생했습니다. 직접 질문해주시면 도움을 드리겠습니다.',
            timestamp: new Date(),
            isAutoGenerated: true
          });
        }
      } else if (response === 'no') {
        // 사용자가 분석을 원하지 않는 경우
        socket.emit('chat-response', {
          message: '✅ **분석 취소**\n\n문제 분석을 건너뛰었습니다. 도움이 필요하시면 언제든 말씀해주세요.',
          timestamp: new Date(),
          isAutoGenerated: true
        });
      }
    });

    // 실행 요약 확인 응답 처리
    socket.on('confirmation-response', async (data) => {
      const { response, confirmationType, confirmationData, messageId } = data;
      
      if (messageId) {
        socket.emit('remove-message', { messageId });
      }
      
      if (response === 'yes') {
        if (confirmationType === 'execution-summary') {
          // 실행 요약 생성
          try {
            socket.emit('chat-response', {
              message: '📝 소금이가 실행 결과 요약을 생성중입니다...',
              timestamp: new Date(),
              isAction: true,
              isLoading: true,
              loadingType: 'generating_summary'
            });

            const { generateExecutionSummary } = require('../services/summaryService');
            const executionSummary = await generateExecutionSummary(
              confirmationData.commands,
              confirmationData.executionResults
            );
            
            socket.emit('chat-response', {
              message: executionSummary,
              timestamp: new Date(),
              isAction: true,
              isSummary: true,
              isLoading: false
            });

            // 요약 후 후속 작업 제안
            socket.emit('chat-response', {
              message: '🎯 **추천 후속 작업을 생성할까요?**',
              timestamp: new Date(),
              isAction: true,
              needsConfirmation: true,
              confirmationType: 'follow-up-actions',
              confirmationData: {
                ...confirmationData,
                executionSummary: executionSummary
              },
              confirmationButtons: [
                { label: '🎯 후속 작업 생성', value: 'yes' },
                { label: '건너뛰기', value: 'no' }
              ],
              removeOnResponse: true
            });
          } catch (error) {
            console.error('실행 요약 생성 오류:', error);
            socket.emit('chat-response', {
              message: '⚠️ 요약 생성 중 오류가 발생했습니다.',
              timestamp: new Date(),
              isAction: true
            });
          }
        } else if (confirmationType === 'follow-up-actions') {
          // 후속 작업 생성
          try {
            socket.emit('chat-response', {
              message: '🎯 소금이가 추천 후속 작업을 생성중입니다...',
              timestamp: new Date(),
              isAction: true,
              isLoading: true,
              loadingType: 'generating_followup'
            });

            const { generateFollowUpActions } = require('../services/summaryService');
            const followUpActions = await generateFollowUpActions(
              confirmationData.commands,
              confirmationData.executionResults,
              confirmationData.executionSummary
            );
            
            if (followUpActions.length > 0) {
              socket.emit('chat-response', {
                message: `🎯 **추천 후속 작업**\n\n다음 단계로 이런 작업들을 진행해보세요:`,
                timestamp: new Date(),
                isAutoGenerated: true,
                hasDynamicActions: true,
                dynamicActions: followUpActions,
                actionContext: '실행 완료 후 추가로 수행할 수 있는 작업들입니다.',
                isLoading: false
              });
            } else {
              socket.emit('chat-response', {
                message: '✨ 추천할 후속 작업이 없습니다.',
                timestamp: new Date(),
                isAction: true,
                isLoading: false
              });
            }
          } catch (error) {
            console.error('후속 작업 생성 오류:', error);
            socket.emit('chat-response', {
              message: '⚠️ 후속 작업 생성 중 오류가 발생했습니다.',
              timestamp: new Date(),
              isAction: true
            });
          }
        }
      } else if (response === 'no') {
        if (confirmationType === 'execution-summary') {
          socket.emit('chat-response', {
            message: '🎯 **추천 후속 작업을 생성할까요?**',
            timestamp: new Date(),
            isAction: true,
            needsConfirmation: true,
            confirmationType: 'follow-up-actions',
            confirmationData: confirmationData,
            confirmationButtons: [
              { label: '🎯 후속 작업 생성', value: 'yes' },
              { label: '건너뛰기', value: 'no' }
            ],
            removeOnResponse: true
          });
        }
      }
    });

    // 권한 프롬프트 응답 처리
    socket.on('permission-response', (data) => {
      const { response, permissionError, actionId } = data; // response: 'yes' | 'no'
      const session = activeSessions.get(socket.id);
      
      if (session && session.ptyProcess) {
        if (response === 'yes') {
          // sudo 후 원래 명령어들을 다시 실행
          if (permissionError && permissionError.originalCommands) {
            // 각 명령어 앞에 sudo를 붙여서 실행
            const commandsWithSudo = permissionError.originalCommands.map(cmd => {
              // 이미 sudo가 있으면 추가하지 않음
              if (cmd.trim().startsWith('sudo')) {
                return cmd;
              }
              return `sudo ${cmd}`;
            });
            
            // 같은 actionId로 계속 진행 - 기존 진행 상황 메시지를 업데이트
            // skipInitialMessage: true로 새 진행 상황 메시지 생성 방지
            // actionTitle도 함께 전달
            executeCommandSequence(
              session.ptyProcess, 
              commandsWithSudo, 
              socket, 
              0, 
              [], 
              actionId, 
              true,
              permissionError.actionTitle || '액션 실행'
            );
          } else {
            // 원래 명령어 정보가 없으면 sudo su만 실행
            session.ptyProcess.write('sudo su -\n');
          }
          
        } else {
          // 사용자가 아니오를 선택한 경우
          socket.emit('chat-response', {
            message: '🔒 **권한 전환 취소**\n\n현재 권한으로 계속 작업합니다.',
            timestamp: new Date(),
            isAction: true,
            isLoading: false,
            actionId: actionId
          });
        }
      }
    });

    // 세션 종료 처리
    socket.on('disconnect-session', () => {
      const session = activeSessions.get(socket.id);
      if (session) {
        console.log(`🔌 세션 종료: ${session.instanceId}`);
        
        // PTY 프로세스 종료
        if (session.ptyProcess) {
          try {
            session.ptyProcess.kill();
          } catch (error) {
            console.error('PTY 프로세스 종료 오류:', error);
          }
        }
        
        // 세션 삭제
        activeSessions.delete(socket.id);
        
        // 클라이언트에 세션 종료 이벤트 전송 (탭 닫기용)
        socket.emit('session-closed');
        
        // 클라이언트에 확인 메시지
        socket.emit('chat-response', {
          message: '🔌 **세션이 종료되었습니다**\n\n터미널 연결이 끊어졌습니다.',
          timestamp: new Date(),
          isSystemMessage: true
        });
      }
    });

    // 히스토리 관리 이벤트들
    
    // 특정 인스턴스의 히스토리 조회
    socket.on('get-history', async (data) => {
      const { instanceId, limit } = data;
      try {
        const history = await historyService.getHistory(instanceId, limit || 100);
        const messageCount = await historyService.getMessageCount(instanceId);
        
        socket.emit('history-loaded', {
          instanceId,
          history,
          count: messageCount,
          totalMessages: messageCount
        });
      } catch (error) {
        console.error('히스토리 조회 오류:', error);
        socket.emit('history-error', { 
          error: error.message,
          instanceId 
        });
      }
    });

    // 히스토리가 있는 날짜 목록 조회
    socket.on('get-history-dates', async (data) => {
      const { instanceId } = data;
      try {
        const dates = await historyService.getHistoryDates(instanceId);
        
        socket.emit('history-dates-loaded', {
          instanceId,
          dates
        });
      } catch (error) {
        console.error('히스토리 날짜 목록 조회 오류:', error);
        socket.emit('history-error', { 
          error: error.message,
          instanceId 
        });
      }
    });

    // 특정 날짜의 히스토리 조회
    socket.on('get-history-by-date', async (data) => {
      const { instanceId, date } = data;
      try {
        const messages = await historyService.getHistoryByDate(instanceId, date);
        
        socket.emit('history-by-date-loaded', {
          instanceId,
          date,
          messages,
          count: messages.length
        });
      } catch (error) {
        console.error('날짜별 히스토리 조회 오류:', error);
        socket.emit('history-error', { 
          error: error.message,
          instanceId,
          date
        });
      }
    });

    // 특정 인스턴스의 히스토리 삭제
    socket.on('clear-history', async (data) => {
      const { instanceId } = data;
      try {
        const success = await historyService.clearHistory(instanceId);
        
        // 현재 세션의 히스토리도 초기화
        const session = activeSessions.get(socket.id);
        if (session && session.instanceId === instanceId) {
          session.chatHistory = [];
        }
        
        socket.emit('history-cleared', {
          instanceId,
          success
        });
      } catch (error) {
        console.error('히스토리 삭제 오류:', error);
        socket.emit('history-error', { 
          error: error.message,
          instanceId 
        });
      }
    });

    // 모든 인스턴스의 히스토리 목록 조회
    socket.on('get-all-histories', async () => {
      try {
        const instances = await historyService.getAllInstanceHistories();
        const historiesWithCounts = await Promise.all(
          instances.map(async (instanceId) => {
            const count = await historyService.getMessageCount(instanceId);
            return {
              instanceId,
              messageCount: count
            };
          })
        );
        
        socket.emit('all-histories-loaded', {
          histories: historiesWithCounts
        });
      } catch (error) {
        console.error('전체 히스토리 목록 조회 오류:', error);
        socket.emit('history-error', { 
          error: error.message 
        });
      }
    });

    // Redis 연결 상태 확인
    socket.on('check-redis-status', () => {
      const isConnected = historyService.isRedisConnected();
      socket.emit('redis-status', {
        connected: isConnected,
        timestamp: new Date()
      });
    });

    socket.on('disconnect', () => {
      console.log('❌ 클라이언트 연결 해제:', socket.id);
      const session = activeSessions.get(socket.id);
      if (session) {
        if (session.ptyProcess) {
          session.ptyProcess.kill();
        }
        activeSessions.delete(socket.id);
      }
    });
  });
}

module.exports = {
  setupSocketHandlers,
  activeSessions
};