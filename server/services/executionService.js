const { analyzeExecutionErrors } = require('./terminalAnalyzer');
const { generateExecutionSummary, generateFollowUpActions } = require('./summaryService');
const historyService = require('./historyService');

function executeCommandSequence(ptyProcess, commands, socket, index = 0, executionResults = [], actionId = null, skipInitialMessage = false, actionTitle = null) {
  if (index >= commands.length) {
    setTimeout(async () => {
      const allOutput = executionResults.join(' ').toLowerCase();
    
      const hasPermissionErrors = executionResults.some(result => {
        const resultLower = result.toLowerCase();
        return (
          resultLower.includes('permission denied') ||
          resultLower.includes('access denied') ||
          resultLower.includes('operation not permitted') ||
          resultLower.includes('you must be root') ||
          resultLower.includes('insufficient privileges') ||
          resultLower.includes('you should be root') ||
          resultLower.includes('geteuid()') ||
          resultLower.includes('must be root') ||
          resultLower.includes('need to be root') ||
          resultLower.includes('run as root')
        );
      });

      const hasRealErrors = executionResults.some(result => {
        const resultLower = result.toLowerCase();
        return (
          resultLower.includes('error:') ||
          resultLower.includes('failed:') ||
          (resultLower.includes('command not found') && !resultLower.includes('which')) ||
          resultLower.includes('no package') ||
          (resultLower.includes('unit not found') && !resultLower.includes('status'))
        );
      });

      const hasSuccessIndicators = allOutput.includes('complete') || 
                                  allOutput.includes('success') || 
                                  allOutput.includes('active (running)') ||
                                  allOutput.includes('enabled') ||
                                  allOutput.includes('started') ||
                                  allOutput.includes('installed');

      let actionStatus = 'success';
      if (hasPermissionErrors) {
        actionStatus = 'permission_error';
      } else if (hasRealErrors && !hasSuccessIndicators) {
        actionStatus = 'error';
      } else if (hasRealErrors) {
        actionStatus = 'warning';
      }

      const session = require('../handlers/socketHandlers').activeSessions.get(socket.id);
      if (session && session.instanceId) {
        await historyService.saveActionExecution(session.instanceId, {
          actionId: actionId,
          actionTitle: actionTitle || '액션 실행',
          commands: commands,
          results: executionResults,
          status: actionStatus
        });
      }

      if (hasPermissionErrors) {
        socket.emit('permission-prompt', {
          message: '🔐 **권한 문제 감지**\n\n이 작업을 수행하려면 관리자 권한이 필요합니다.\n\n**루트 권한으로 전환하시겠습니까?**',
          timestamp: new Date(),
          permissionError: {
            originalCommands: commands,
            originalOutput: executionResults.join('\n'),
            actionTitle: actionTitle // 액션 제목 추가
          },
          actionId: actionId
        });
      } else if (hasRealErrors && !hasSuccessIndicators) {
        const errorAnalysis = analyzeExecutionErrors(executionResults);
        
        socket.emit('chat-response', {
          message: `⚠️ 일부 명령어 실행 중 문제가 발생했습니다.\n\n${errorAnalysis.message}\n\n${errorAnalysis.suggestion}`,
          timestamp: new Date(),
          isAction: true,
          isLoading: false,
          actionId: actionId
        });

        if (errorAnalysis.alternativeActions.length > 0) {
          setTimeout(() => {
            socket.emit('action-suggestions', {
              suggestions: errorAnalysis.alternativeActions,
              context: '문제를 해결하기 위한 대안을 제안합니다.'
            });
          }, 1000);
        }
      } else {
        socket.emit('chat-response', {
          message: '✅ 실행 완료',
          timestamp: new Date(),
          isAction: true,
          isLoading: false,
          actionId: actionId
        });

        setTimeout(() => {
          socket.emit('chat-response', {
            message: '📝 **실행 결과 요약을 생성할까요?**',
            timestamp: new Date(),
            isAction: true,
            needsConfirmation: true,
            confirmationType: 'execution-summary',
            confirmationData: {
              commands: commands,
              executionResults: executionResults
            },
            confirmationButtons: [
              { label: '📝 요약 생성', value: 'yes' },
              { label: '건너뛰기', value: 'no' }
            ],
            removeOnResponse: true
          });
        }, 1000);
      }
    }, 3000);
    return;
  }

  const command = commands[index];
  let commandOutput = '';
  let outputCollector = null;
  
  if (index === 0 && !skipInitialMessage) {
    const commandList = commands.map((cmd, i) => `${i + 1}. ${cmd}`).join('\n');
    socket.emit('chat-response', {
      message: `🚀 **액션 실행 중** (${commands.length}개 명령어)`,
      timestamp: new Date(),
      isAction: true,
      isProgress: true,
      actionId: actionId,
      executingCommands: commands,
      progressMessageId: `progress-${actionId}`,
      collapsible: true, // 접을 수 있음
      collapsed: false, // 초기에는 펼쳐진 상태
      progressData: {
        total: commands.length,
        current: 0,
        commands: commands,
        statuses: commands.map(() => 'pending')
      }
    });
  } else if (index === 0 && skipInitialMessage) {
    const statuses = commands.map(() => 'pending');
    statuses[0] = 'running';
    
    socket.emit('chat-response', {
      message: `🚀 **액션 실행 중** (${commands.length}개 명령어)`,
      timestamp: new Date(),
      isAction: true,
      isProgress: true,
      actionId: actionId,
      updateProgress: true,
      progressMessageId: `progress-${actionId}`,
      collapsible: true,
      collapsed: false,
      progressData: {
        total: commands.length,
        current: 0,
        commands: commands,
        statuses: statuses
      }
    });
  } else {
    const statuses = commands.map((cmd, i) => {
      if (i < index) return 'completed';
      if (i === index) return 'running';
      return 'pending';
    });
    
    socket.emit('chat-response', {
      message: `🚀 **액션 실행 중** (${commands.length}개 명령어)`,
      timestamp: new Date(),
      isAction: true,
      isProgress: true,
      actionId: actionId,
      updateProgress: true,
      progressMessageId: `progress-${actionId}`,
      collapsible: true,
      progressData: {
        total: commands.length,
        current: index,
        commands: commands,
        statuses: statuses
      }
    });
  }
  
  setTimeout(() => {
    let commandCompleted = false;
    let needsQuit = false; // 'q' 입력이 필요한지 추적
    
    // 페이저를 사용하는 명령어 패턴 감지
    const commandLower = command.toLowerCase();
    const pagerCommands = [
      'less', 'more', 'systemctl status', 'journalctl', 
      'git log', 'git diff', 'man ', 'tail -f', 'watch '
    ];
    
    // 명령어가 페이저를 사용하는지 확인
    const usesPager = pagerCommands.some(pagerCmd => commandLower.includes(pagerCmd));
    
    outputCollector = (data) => {
      const output = data.toString();
      commandOutput += output;
      
      // 페이저 프롬프트 감지 (less, more 등)
      if (output.includes('(END)') || output.includes('--More--') || output.includes('lines ')) {
        needsQuit = true;
      }
      
      if ((output.includes('sh-4.2$') || output.includes('$') || output.includes('#')) && !commandCompleted) {
        commandCompleted = true;
        
        const outputLower = commandOutput.toLowerCase();
        const hasPermissionError = (
          outputLower.includes('permission denied') ||
          outputLower.includes('access denied') ||
          outputLower.includes('operation not permitted') ||
          outputLower.includes('you must be root') ||
          outputLower.includes('insufficient privileges') ||
          outputLower.includes('you should be root') ||
          outputLower.includes('geteuid()') ||
          outputLower.includes('must be root') ||
          outputLower.includes('need to be root') ||
          outputLower.includes('run as root')
        );
        
        if (hasPermissionError) {
          if (outputCollector) {
            ptyProcess.removeListener('data', outputCollector);
          }
          
          const remainingCommands = commands.slice(index);
          
          const statuses = commands.map((cmd, i) => {
            if (i < index) return 'completed';
            if (i === index) return 'warning';
            return 'pending';
          });
          
          socket.emit('chat-response', {
            message: `⚠️ **권한 문제 발생** (${commands.length}개 명령어)`,
            timestamp: new Date(),
            isAction: true,
            isProgress: true,
            actionId: actionId,
            updateProgress: true,
            progressMessageId: `progress-${actionId}`,
            collapsible: true,
            collapsed: false,
            progressData: {
              total: commands.length,
              current: index,
              commands: commands,
              statuses: statuses
            }
          });
          
          setTimeout(() => {
            socket.emit('permission-prompt', {
              message: '🔐 **권한 문제 감지**\n\n이 작업을 수행하려면 관리자 권한이 필요합니다.\n\n**루트 권한으로 전환하시겠습니까?**',
              timestamp: new Date(),
              permissionError: {
                originalCommands: remainingCommands,
                originalOutput: commandOutput,
                failedCommandIndex: index,
                failedCommand: command,
                actionTitle: actionTitle
              },
              actionId: actionId
            });
          }, 300);
          return;
        }
        
        setTimeout(() => {
          if (outputCollector) {
            ptyProcess.removeListener('data', outputCollector);
          }
          
          // 페이저가 감지되었으면 'q' 입력
          if (needsQuit || usesPager) {
            console.log(`페이저 감지됨, 'q' 자동 입력: ${command}`);
            ptyProcess.write('q');
            
            // 'q' 입력 후 잠시 대기
            setTimeout(() => {
              executionResults.push(commandOutput);
              continueExecution();
            }, 300);
          } else {
            executionResults.push(commandOutput);
            continueExecution();
          }
        }, 500);
      }
    };
    
    // 실행 계속 진행하는 함수
    const continueExecution = () => {
      const outputLower = commandOutput.toLowerCase();
      const hasError = outputLower.includes('error') || outputLower.includes('failed') || outputLower.includes('command not found');
      
      const statuses = commands.map((cmd, i) => {
        if (i < index) return 'completed';
        if (i === index) return hasError ? 'warning' : 'completed';
        if (i === index + 1) return 'running';
        return 'pending';
      });
      
      if (index + 1 < commands.length) {
        socket.emit('chat-response', {
          message: `🚀 **액션 실행 중** (${commands.length}개 명령어)`,
          timestamp: new Date(),
          isAction: true,
          isProgress: true,
          actionId: actionId,
          updateProgress: true,
          progressMessageId: `progress-${actionId}`,
          collapsible: true,
          progressData: {
            total: commands.length,
            current: index + 1,
            commands: commands,
            statuses: statuses
          }
        });
      } else {
        socket.emit('chat-response', {
          message: `✅ **액션 실행 완료** (${commands.length}개 명령어)`,
          timestamp: new Date(),
          isAction: true,
          isProgress: true,
          actionId: actionId,
          updateProgress: true,
          progressMessageId: `progress-${actionId}`,
          collapsible: true,
          collapsed: true,
          progressData: {
            total: commands.length,
            current: commands.length,
            commands: commands,
            statuses: commands.map((cmd, i) => i === index && hasError ? 'warning' : 'completed')
          }
        });
      }
      
      executeCommandSequence(ptyProcess, commands, socket, index + 1, executionResults, actionId, skipInitialMessage, actionTitle);
    };
    
    ptyProcess.on('data', outputCollector);
    ptyProcess.write(command + '\n');
    
    setTimeout(() => {
      if (!commandCompleted && outputCollector) {
        ptyProcess.removeListener('data', outputCollector);
        executionResults.push(commandOutput);
        
        const statuses = commands.map((cmd, i) => {
          if (i < index) return 'completed';
          if (i === index) return 'timeout';
          if (i === index + 1) return 'running';
          return 'pending';
        });
        
        socket.emit('chat-response', {
          message: `🚀 **액션 실행 중** (${commands.length}개 명령어)`,
          timestamp: new Date(),
          isAction: true,
          isProgress: true,
          actionId: actionId,
          updateProgress: true,
          progressMessageId: `progress-${actionId}`,
          collapsible: true,
          progressData: {
            total: commands.length,
            current: index + 1,
            commands: commands,
            statuses: statuses
          }
        });
        
        executeCommandSequence(ptyProcess, commands, socket, index + 1, executionResults, actionId, skipInitialMessage, actionTitle);
      }
    }, 30000);
  }, 1000);
}

module.exports = {
  executeCommandSequence
};