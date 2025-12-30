import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Paper,
  IconButton,
  Chip,
  Alert,
  Collapse,
  CircularProgress,
  Fade,
  Skeleton,
  Tooltip,
  Badge,
  Drawer
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
// SmartToyIcon 제거 - 커스텀 이미지 사용
import PersonIcon from '@mui/icons-material/Person';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ClearIcon from '@mui/icons-material/Clear';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import HistoryIcon from '@mui/icons-material/History';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import StorageIcon from '@mui/icons-material/Storage';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import TextIncreaseIcon from '@mui/icons-material/TextIncrease';
import TextDecreaseIcon from '@mui/icons-material/TextDecrease';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ReactMarkdown from 'react-markdown';
import HistoryCalendar from './HistoryCalendar';

const ChatBot = ({ socket, selectedInstance, sessionId, sessionState, setSessionState }) => {
  // 상태를 props에서 받아서 사용 (App.js에서 관리)
  const messages = sessionState.messages;
  const setMessages = (updater) => {
    setSessionState(prev => ({
      ...prev,
      messages: typeof updater === 'function' ? updater(prev.messages) : updater
    }));
  };
  
  const historyCount = sessionState.historyCount;
  const setHistoryCount = (updater) => {
    setSessionState(prev => ({
      ...prev,
      historyCount: typeof updater === 'function' ? updater(prev.historyCount) : updater
    }));
  };
  
  const historyMessages = sessionState.historyMessages;
  const setHistoryMessages = (updater) => {
    setSessionState(prev => ({
      ...prev,
      historyMessages: typeof updater === 'function' ? updater(prev.historyMessages) : updater
    }));
  };
  
  const historyLoaded = sessionState.historyLoaded;
  const setHistoryLoaded = (updater) => {
    setSessionState(prev => ({
      ...prev,
      historyLoaded: typeof updater === 'function' ? updater(prev.historyLoaded) : updater
    }));
  };
  
  // 로컬 상태 (탭 전환 시 초기화되어도 괜찮은 것들)
  const [inputMessage, setInputMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dynamicActions, setDynamicActions] = useState([]);
  const [currentContext, setCurrentContext] = useState('');
  const [lastAutoMessage, setLastAutoMessage] = useState('');
  const [collapsedMessages, setCollapsedMessages] = useState(new Set());
  const [showOnlyImportant, setShowOnlyImportant] = useState(false);
  const [clickedActions, setClickedActions] = useState(new Set());
  const [instanceInfoCollapsed, setInstanceInfoCollapsed] = useState(false);
  
  // 컴포넌트 마운트 시 로그
  useEffect(() => {
    // 마운트/언마운트 로그 제거 (필요시 주석 해제)
    // console.log(`🎨 ChatBot 마운트됨 - sessionId: ${sessionId}`);
    return () => {
      // console.log(`🎨 ChatBot 언마운트됨 - sessionId: ${sessionId}`);
    };
  }, []);
  
  const [redisConnected, setRedisConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // 기본값을 false로 변경
  const [streamingMessageId, setStreamingMessageId] = useState(null); // 현재 스트리밍 중인 메시지 ID
  const [fontSize, setFontSize] = useState(0.875); // 기본 폰트 크기 (rem)
  const [copiedCode, setCopiedCode] = useState(null); // 복사된 코드 블록 ID
  const [collapsedProgress, setCollapsedProgress] = useState(new Set()); // 접힌 진행 상황 메시지
  const [showCalendar, setShowCalendar] = useState(false); // 캘린더 표시 여부
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(null); // 선택된 날짜
  const [dateSelectionMessage, setDateSelectionMessage] = useState(null); // 날짜 선택 알림 메시지
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 코드 복사 함수
  const handleCopyCode = (code, id) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  // 폰트 크기 조절 함수
  const increaseFontSize = () => {
    setFontSize(prev => Math.min(prev + 0.125, 1.5)); // 최대 1.5rem
  };

  const decreaseFontSize = () => {
    setFontSize(prev => Math.max(prev - 0.125, 0.625)); // 최소 0.625rem
  };

  // 커스텀 코드 블록 컴포넌트
  const CodeBlock = ({ inline, children, ...props }) => {
    if (inline) {
      return (
        <code
          style={{
            backgroundColor: '#f5f5f5',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: `${fontSize * 0.9}rem`,
            wordBreak: 'break-all'
          }}
          {...props}
        >
          {children}
        </code>
      );
    }

    const codeString = String(children).replace(/\n$/, '');
    const codeId = `code-${Date.now()}-${Math.random()}`;

    return (
      <Box sx={{ position: 'relative', my: 1 }}>
        <pre
          style={{
            backgroundColor: '#f8f9fa',
            padding: '12px',
            paddingTop: '36px',
            borderRadius: '8px',
            overflow: 'auto',
            border: '1px solid #e9ecef',
            maxWidth: '100%',
            margin: 0
          }}
        >
          <code
            style={{
              backgroundColor: 'transparent',
              padding: 0,
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
              fontSize: `${fontSize * 0.9}rem`,
              fontFamily: 'monospace'
            }}
            {...props}
          >
            {children}
          </code>
        </pre>
        <Tooltip title={copiedCode === codeId ? '복사됨!' : '코드 복사'}>
          <IconButton
            size="small"
            onClick={() => handleCopyCode(codeString, codeId)}
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 1)'
              }
            }}
          >
            {copiedCode === codeId ? (
              <CheckIcon sx={{ fontSize: 16, color: '#22c55e' }} />
            ) : (
              <ContentCopyIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 인스턴스 선택 시 환영 메시지 표시 (한 번만)
  useEffect(() => {
    // 메시지가 비어있을 때만 환영 메시지 추가 (처음 시작할 때만)
    if (selectedInstance && socket && messages.length === 0) {
      setMessages([{
        type: 'bot',
        content: `안녕하세요! 저는 EC2 세션 매니저 AI 어시스턴트 **소금이**입니다! 🧂\n\n현재 **${selectedInstance.name}** (${selectedInstance.platformDetails || selectedInstance.platform})에 연결되었습니다.\n\n터미널 사용 중 궁금한 점이 있으면 언제든 물어보세요. 이 인스턴스의 OS에 맞는 명령어를 추천해드릴 수 있습니다.`,
        timestamp: new Date(),
        hasInstanceInfo: true
      }]);
    }
  }, [selectedInstance, socket, messages.length]);

  useEffect(() => {
    if (!socket) return;

    // AI 응답 수신 (액션 포함 가능)
    socket.on('chat-response', (data) => {
      if (data.isLoading) {
        // 로딩 메시지는 기존 로딩 메시지를 업데이트하거나 새로 추가
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.isLoading && lastMessage.actionId === data.actionId) {
            // 같은 액션의 로딩 메시지 업데이트
            return [...prev.slice(0, -1), {
              ...lastMessage,
              content: data.message,
              loadingType: data.loadingType
            }];
          } else {
            // 새 로딩 메시지 추가
            return [...prev, {
              type: 'bot',
              content: data.message,
              timestamp: new Date(data.timestamp),
              isLoading: true,
              loadingType: data.loadingType,
              actionId: data.actionId
            }];
          }
        });
      } else {
        // 완료된 메시지 처리
        setMessages(prev => {
          // 진행 상황 업데이트인 경우 - actionId로 찾기
          if (data.updateProgress && data.actionId && data.isProgress) {
            // 같은 actionId를 가진 진행 상황 메시지 찾기
            const progressMessageIndex = prev.findIndex(msg => 
              msg.actionId === data.actionId && msg.isProgress
            );
            
            if (progressMessageIndex !== -1) {
              // 기존 진행 상황 메시지 업데이트
              const updatedMessages = [...prev];
              updatedMessages[progressMessageIndex] = {
                ...updatedMessages[progressMessageIndex],
                content: data.message,
                timestamp: new Date(data.timestamp),
                progressData: data.progressData,
                collapsed: data.collapsed !== undefined ? data.collapsed : updatedMessages[progressMessageIndex].collapsed
              };
              return updatedMessages;
            } else {
              // 진행 상황 메시지가 없으면 새로 추가 (권한 전환 후 재실행 시)
              return [...prev, {
                type: 'bot',
                content: data.message,
                timestamp: new Date(data.timestamp),
                isLoading: false,
                isAction: data.isAction,
                isProgress: data.isProgress,
                actionId: data.actionId,
                progressData: data.progressData,
                collapsible: data.collapsible,
                collapsed: data.collapsed
              }];
            }
          }
          
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.isLoading && lastMessage.actionId === data.actionId) {
            // 로딩 메시지를 완료 메시지로 교체
            return [...prev.slice(0, -1), {
              type: 'bot',
              content: data.message,
              timestamp: new Date(data.timestamp),
              isLoading: false,
              isSummary: data.isSummary,
              isAction: data.isAction,
              isProgress: data.isProgress,
              hasDynamicActions: data.hasDynamicActions,
              dynamicActions: data.dynamicActions,
              actionContext: data.actionContext,
              actionId: data.actionId,
              progressData: data.progressData,
              collapsible: data.collapsible,
              collapsed: data.collapsed,
              needsConfirmation: data.needsConfirmation,
              confirmationType: data.confirmationType,
              confirmationData: data.confirmationData,
              confirmationButtons: data.confirmationButtons
            }];
          } else {
            return [...prev, {
              type: 'bot',
              content: data.message,
              timestamp: new Date(data.timestamp),
              isLoading: false,
              isSummary: data.isSummary,
              isAction: data.isAction,
              isProgress: data.isProgress,
              hasDynamicActions: data.hasDynamicActions,
              dynamicActions: data.dynamicActions,
              actionContext: data.actionContext,
              actionId: data.actionId,
              progressData: data.progressData,
              collapsible: data.collapsible,
              collapsed: data.collapsed,
              needsConfirmation: data.needsConfirmation,
              confirmationType: data.confirmationType,
              confirmationData: data.confirmationData,
              confirmationButtons: data.confirmationButtons,
              removeOnResponse: data.removeOnResponse,
              id: data.removeOnResponse ? `msg-${Date.now()}-${Math.random()}` : undefined
            }];
          }
        });
        
        // 액션 완료 시 클릭 상태 해제
        if (data.actionId) {
          setClickedActions(prev => {
            const newSet = new Set(prev);
            newSet.delete(data.actionId);
            return newSet;
          });
        }
      }
      
      // 액션이 함께 왔다면 동적 액션 상태 업데이트
      if (data.hasDynamicActions && data.dynamicActions) {
        setDynamicActions(data.dynamicActions);
        setCurrentContext(data.actionContext);
      }
      
      setIsAnalyzing(false);
    });

    // 터미널 명령어 자동 분석 (중복 방지)
    socket.on('analyze-command', (data) => {
      if (data.analysis && data.analysis.severity !== 'info' && data.analysis.context) {
        // 같은 메시지가 최근에 표시되었는지 확인
        if (lastAutoMessage !== data.analysis.context) {
          const severityIcon = data.analysis.severity === 'error' ? '🚨' : '⚠️';
          setMessages(prev => [...prev, {
            type: 'bot',
            content: `${severityIcon} ${data.analysis.context} 도움이 필요하시면 말씀해주세요.`,
            timestamp: new Date(),
            isAutoGenerated: true,
            severity: data.analysis.severity
          }]);
          setLastAutoMessage(data.analysis.context);
          
          // 5분 후 중복 방지 해제
          setTimeout(() => setLastAutoMessage(''), 300000);
        }
      }
    });

    // 정적 액션 제거

    // 액션 버튼 클릭 확인 처리
    socket.on('action-button-clicked', (data) => {
      setClickedActions(prev => new Set([...prev, data.actionId]));
    });

    // 스트리밍 시작 처리
    socket.on('chat-stream-start', (data) => {
      const messageId = `stream_${Date.now()}`;
      setStreamingMessageId(messageId);
      setIsAnalyzing(true);
      
      // 빈 스트리밍 메시지 추가
      setMessages(prev => [...prev, {
        type: 'bot',
        content: '',
        timestamp: new Date(data.timestamp),
        isStreaming: true,
        messageId: messageId
      }]);
    });

    // 스트리밍 청크 처리
    socket.on('chat-stream', (data) => {
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          // 스트리밍 메시지 업데이트
          return [...prev.slice(0, -1), {
            ...lastMessage,
            content: data.fullText,
            isStreaming: !data.isComplete
          }];
        }
        return prev;
      });
      
      // 스크롤 유지
      scrollToBottom();
    });

    // 스트리밍 완료 처리
    socket.on('chat-stream-end', (data) => {
      setStreamingMessageId(null);
      setIsAnalyzing(false);
      
      // 스트리밍 메시지를 완료 상태로 변경하고 액션 추가
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        
        // 마지막 메시지가 봇 메시지이고 아직 액션이 없으면 업데이트
        if (lastMessage && lastMessage.type === 'bot' && !lastMessage.hasDynamicActions) {
          const updatedMessage = {
            ...lastMessage,
            isStreaming: false,
            hasDynamicActions: data.hasDynamicActions,
            dynamicActions: data.dynamicActions,
            actionContext: data.actionContext
          };
          return [...prev.slice(0, -1), updatedMessage];
        }
        return prev;
      });
      
      // 액션이 있으면 상태 업데이트
      if (data.hasDynamicActions && data.dynamicActions) {
        setDynamicActions(data.dynamicActions);
        setCurrentContext(data.actionContext);
      }
    });

    // 분석 프롬프트 처리
    socket.on('analysis-prompt', (data) => {
      setMessages(prev => [...prev, {
        type: 'bot',
        content: data.message,
        timestamp: new Date(data.timestamp),
        isAnalysisPrompt: true,
        analysisData: data.analysisData
      }]);
    });

    // 권한 프롬프트 처리
    socket.on('permission-prompt', (data) => {
      setMessages(prev => [...prev, {
        type: 'bot',
        content: data.message,
        timestamp: new Date(data.timestamp),
        isPermissionPrompt: true,
        permissionError: data.permissionError,
        actionId: data.actionId
      }]);
    });

    // 히스토리 개수만 수신 (자동 로드 안함)
    socket.on('history-count', (data) => {
      setHistoryCount(data.count);
    });

    // 히스토리 로드 처리 (사용자가 요청했을 때만)
    socket.on('history-loaded', (data) => {
      setHistoryLoaded(true);
      setHistoryCount(data.totalMessages || data.count);
      
      if (data.history && data.history.length > 0) {
        // 일자별로 그룹화된 히스토리 처리
        const groupedMessages = data.history.map(group => ({
          date: group.date,
          messages: group.messages
            .filter(msg => msg.type === 'user_chat' || msg.type === 'ai_chat' || msg.type === 'action_execution')
            .map(msg => {
              if (msg.type === 'action_execution') {
                // 액션 실행 내역을 봇 메시지로 변환
                return {
                  type: 'bot',
                  content: `🎯 **${msg.content}**\n\n실행된 명령어:\n${msg.commands.map(cmd => `\`${cmd}\``).join('\n')}\n\n상태: ${msg.status === 'success' ? '✅ 성공' : msg.status === 'error' ? '❌ 오류' : '⚠️ 경고'}`,
                  timestamp: new Date(msg.timestamp),
                  isFromHistory: true,
                  isActionHistory: true
                };
              }
              return {
                type: msg.type === 'user_chat' ? 'user' : 'bot',
                content: msg.content,
                timestamp: new Date(msg.timestamp),
                isFromHistory: true
              };
            })
        }));
        
        // 히스토리 메시지를 별도 상태에 저장
        setHistoryMessages(groupedMessages);
      } else {
        setHistoryMessages([]);
      }
    });

    // 히스토리 삭제 완료 처리
    socket.on('history-cleared', (data) => {
      if (data.success) {
        setHistoryCount(0);
        setHistoryMessages([]);
        setHistoryLoaded(false);
        setMessages(prev => [...prev, {
          type: 'bot',
          content: '🗑️ **히스토리 삭제 완료**\n\n이 인스턴스의 대화 기록이 모두 삭제되었습니다.',
          timestamp: new Date(),
          isSystemMessage: true
        }]);
      }
    });

    // 날짜별 히스토리 로드 처리
    socket.on('history-by-date-loaded', (data) => {
      if (data.messages && data.messages.length > 0) {
        const dateMessages = data.messages
          .filter(msg => msg.type === 'user_chat' || msg.type === 'ai_chat' || msg.type === 'action_execution')
          .map(msg => {
            if (msg.type === 'action_execution') {
              return {
                type: 'bot',
                content: `🎯 **${msg.content}**\n\n실행된 명령어:\n${msg.commands.map(cmd => `\`${cmd}\``).join('\n')}\n\n상태: ${msg.status === 'success' ? '✅ 성공' : msg.status === 'error' ? '❌ 오류' : '⚠️ 경고'}`,
                timestamp: new Date(msg.timestamp),
                isFromHistory: true,
                isActionHistory: true
              };
            }
            return {
              type: msg.type === 'user_chat' ? 'user' : 'bot',
              content: msg.content,
              timestamp: new Date(msg.timestamp),
              isFromHistory: true
            };
          });
        
        setHistoryMessages([{
          date: data.date,
          messages: dateMessages
        }]);
        setShowHistory(true);
        setSelectedHistoryDate(data.date);
        
        setTimeout(() => {
          scrollToBottom();
        }, 100);
      } else {
        setHistoryMessages([]);
        setShowHistory(false);
      }
    });

    // Redis 상태 확인
    socket.on('redis-status', (data) => {
      setRedisConnected(data.connected);
    });

    // Redis 상태 확인 요청
    socket.emit('check-redis-status');

    socket.on('remove-message', (data) => {
      if (data.messageId) {
        setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
      }
    });

    return () => {
      socket.off('chat-response');
      socket.off('analyze-command');
      socket.off('action-button-clicked');
      socket.off('analysis-prompt');
      socket.off('permission-prompt');
      socket.off('history-count');
      socket.off('history-loaded');
      socket.off('history-cleared');
      socket.off('history-by-date-loaded');
      socket.off('redis-status');
      socket.off('chat-stream-start');
      socket.off('chat-stream');
      socket.off('chat-stream-end');
      socket.off('remove-message');
    };
  }, [socket]);

  const handleSendMessage = () => {
    const messageToSend = inputMessage.trim();
    if (!messageToSend || !socket) return;

    const userMessage = {
      type: 'user',
      content: messageToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsAnalyzing(true);

    socket.emit('chat-message', { 
      message: messageToSend,
      instanceInfo: selectedInstance 
    });
    setInputMessage('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 정적 액션 실행 함수 제거

  const handleExecuteDynamicAction = (action) => {
    if (socket) {
      const actionId = action.id || `action_${Date.now()}`;
      socket.emit('execute-dynamic-action', { action, actionId });
      setClickedActions(prev => new Set([...prev, actionId]));
      setDynamicActions([]);
    }
  };

  const handleAnalysisResponse = (response, analysisData) => {
    if (socket) {
      socket.emit('analysis-response', { response, analysisData });
    }
  };

  const handlePermissionResponse = (response, permissionError, actionId) => {
    if (socket) {
      socket.emit('permission-response', { response, permissionError, actionId });
    }
  };

  const handleConfirmationResponse = (response, confirmationType, confirmationData, messageIndex) => {
    if (socket) {
      const message = messages[messageIndex];
      const messageId = message?.id || `msg-${messageIndex}`;
      
      if (message?.removeOnResponse) {
        setMessages(prev => prev.filter((_, idx) => idx !== messageIndex));
      } else if (response === 'no') {
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (messageIndex !== undefined && updatedMessages[messageIndex]) {
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: confirmationType === 'execution-summary' 
                ? '📝 실행 결과 요약 건너뛰기'
                : '🎯 후속 작업 생성 건너뛰기',
              needsConfirmation: false,
              confirmationButtons: null
            };
          }
          return updatedMessages;
        });
      }
      
      socket.emit('confirmation-response', { 
        response, 
        confirmationType, 
        confirmationData,
        messageId: message?.removeOnResponse ? messageId : null
      });
    }
  };

  const toggleProgressCollapse = (messageIndex) => {
    setMessages(prev => {
      const updatedMessages = [...prev];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        collapsed: !updatedMessages[messageIndex].collapsed
      };
      return updatedMessages;
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'running':
        return '⏳';
      case 'warning':
        return '⚠️';
      case 'timeout':
        return '⏱️';
      case 'pending':
      default:
        return '⏸️';
    }
  };

  const toggleMessageCollapse = (index) => {
    const newCollapsed = new Set(collapsedMessages);
    if (newCollapsed.has(index)) {
      newCollapsed.delete(index);
    } else {
      newCollapsed.add(index);
    }
    setCollapsedMessages(newCollapsed);
  };

  const clearMessages = () => {
    setMessages([]);
    setCollapsedMessages(new Set());
    setClickedActions(new Set());
  };

  // 서버의 히스토리 삭제 (Redis에서 삭제)
  const clearServerHistory = () => {
    if (socket && selectedInstance) {
      socket.emit('clear-history', { instanceId: selectedInstance.instanceId });
    }
  };

  // 히스토리 새로고침
  const refreshHistory = () => {
    if (socket && selectedInstance) {
      // 히스토리 로드 요청 (자동으로 history-loaded 이벤트로 응답받음)
      socket.emit('get-history', { instanceId: selectedInstance.instanceId, limit: 100 });
    }
  };

  const isImportantMessage = (message) => {
    return message.type === 'user' || 
           message.isSummary || 
           message.hasDynamicActions || 
           (message.isAutoGenerated && message.severity === 'error');
  };

  const getFilteredMessages = () => {
    let filtered = messages;
    
    // 이전 대화 표시 여부에 따라 병합
    if (showHistory && historyMessages.length > 0) {
      // 환영 메시지만 추출
      const welcomeMsg = messages.length > 0 && messages[0].hasInstanceInfo ? [messages[0]] : [];
      
      // 일자별 히스토리 메시지만 추출 (구분선 없이)
      const allHistoryMessages = [];
      historyMessages.forEach(group => {
        // 해당 날짜의 메시지들만 추가 (날짜 구분선 제거)
        allHistoryMessages.push(...group.messages);
      });
      
      // 환영 메시지 + 히스토리 메시지만 표시 (구분선 제거)
      filtered = [...welcomeMsg, ...allHistoryMessages];
    }
    
    // 중요한 메시지만 보기
    if (showOnlyImportant) {
      filtered = filtered.filter(isImportantMessage);
    }
    
    return filtered;
  };

  // 정적 액션 제목 함수 제거

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error': return <ErrorIcon sx={{ fontSize: 16, color: '#f44336' }} />;
      case 'warning': return <WarningIcon sx={{ fontSize: 16, color: '#ff9800' }} />;
      default: return <InfoIcon sx={{ fontSize: 16, color: '#2196f3' }} />;
    }
  };

  // 로딩 애니메이션 컴포넌트
  const LoadingMessage = ({ message, type = 'analyzing' }) => {
    const [dots, setDots] = useState('');

    useEffect(() => {
      const interval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? '' : prev + '.');
      }, 500);
      return () => clearInterval(interval);
    }, []);

    const getLoadingIcon = () => {
      switch (type) {
        case 'executing':
          return <AutorenewIcon sx={{ fontSize: 16, animation: 'spin 1s linear infinite' }} />;
        case 'generating':
        case 'generating_summary':
          return <CircularProgress size={16} sx={{ mr: 1, color: '#4caf50' }} />;
        case 'generating_error_summary':
          return <CircularProgress size={16} sx={{ mr: 1, color: '#ff9800' }} />;
        case 'generating_followup':
          return <CircularProgress size={16} sx={{ mr: 1, color: '#9c27b0' }} />;
        case 'analyzing':
          return <CircularProgress size={16} sx={{ mr: 1, color: '#2196f3' }} />;
        default:
          return <CircularProgress size={16} sx={{ mr: 1 }} />;
      }
    };

    const getLoadingColor = () => {
      switch (type) {
        case 'generating_summary':
          return '#4caf50';
        case 'generating_error_summary':
          return '#ff9800';
        case 'generating_followup':
          return '#9c27b0';
        case 'analyzing':
          return '#2196f3';
        default:
          return '#666';
      }
    };

    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        p: 1,
        backgroundColor: type.includes('generating') ? '#f8f9fa' : 'transparent',
        borderRadius: type.includes('generating') ? 1 : 0,
        border: type.includes('generating') ? '1px solid #e9ecef' : 'none'
      }}>
        {getLoadingIcon()}
        <Typography 
          variant="body2" 
          sx={{ 
            fontStyle: 'italic',
            color: getLoadingColor(),
            fontWeight: type.includes('generating') ? 'medium' : 'normal'
          }}
        >
          {message}{dots}
        </Typography>
      </Box>
    );
  };

  const formatTime = (timestamp) => {
    return timestamp.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Box 
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* 🎛️ Message Controls */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* 세션 종료 버튼 */}
        {selectedInstance && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => {
              if (window.confirm('세션을 종료하시겠습니까? 터미널 연결이 끊어집니다.')) {
                if (socket) {
                  socket.emit('disconnect-session');
                }
                // 상태 초기화
                setMessages([]);
                setHistoryMessages([]);
                setHistoryCount(0);
                setHistoryLoaded(false);
                setShowHistory(false);
              }
            }}
            sx={{ 
              fontSize: '0.75rem', 
              textTransform: 'none', 
              borderRadius: '12px',
              borderColor: 'rgba(244, 67, 54, 0.5)',
              color: 'rgba(244, 67, 54, 0.9)',
              '&:hover': {
                borderColor: 'rgba(244, 67, 54, 0.8)',
                backgroundColor: 'rgba(244, 67, 54, 0.1)'
              }
            }}
          >
            🔌 세션 종료
          </Button>
        )}
        
        {/* 폰트 크기 조절 버튼 */}
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', ml: 'auto' }}>
          <Tooltip title="폰트 크기 줄이기">
            <IconButton
              size="small"
              onClick={decreaseFontSize}
              sx={{
                width: 28,
                height: 28,
                backgroundColor: '#f8f9fa',
                border: '1px solid #dadce0',
                '&:hover': {
                  backgroundColor: '#e8eaed'
                }
              }}
            >
              <TextDecreaseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#5f6368', minWidth: 35, textAlign: 'center' }}>
            {Math.round(fontSize * 100)}%
          </Typography>
          <Tooltip title="폰트 크기 키우기">
            <IconButton
              size="small"
              onClick={increaseFontSize}
              sx={{
                width: 28,
                height: 28,
                backgroundColor: '#f8f9fa',
                border: '1px solid #dadce0',
                '&:hover': {
                  backgroundColor: '#e8eaed'
                }
              }}
            >
              <TextIncreaseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
        
        {/* 히스토리 관리 버튼들 */}
        {selectedInstance && (
          <>
            {/* 캘린더 버튼 */}
            <Tooltip title="날짜별 대화 기록 보기">
              <IconButton
                size="small"
                onClick={() => setShowCalendar(!showCalendar)}
                sx={{
                  width: 28,
                  height: 28,
                  backgroundColor: showCalendar ? 'rgba(64, 224, 208, 0.2)' : '#f8f9fa',
                  border: '1px solid #dadce0',
                  '&:hover': {
                    backgroundColor: showCalendar ? 'rgba(64, 224, 208, 0.3)' : '#e8eaed'
                  }
                }}
              >
                <CalendarMonthIcon sx={{ fontSize: 16, color: showCalendar ? '#40e0d0' : 'inherit' }} />
              </IconButton>
            </Tooltip>
            
            {historyCount > 0 && (
              <>
                <Tooltip title={showHistory ? "이전 대화 숨기기" : "이전 대화 보기"}>
                  <Button
                    size="small"
                    variant={showHistory ? "contained" : "outlined"}
                    startIcon={<HistoryIcon sx={{ fontSize: 14 }} />}
                    onClick={() => {
                      if (!showHistory && !historyLoaded) {
                        // 히스토리를 아직 로드하지 않았으면 로드 요청
                        refreshHistory();
                      }
                      setShowHistory(!showHistory);
                    }}
                    sx={{ 
                      fontSize: '0.75rem', 
                      textTransform: 'none', 
                      borderRadius: '12px',
                      borderColor: 'rgba(255, 193, 7, 0.5)',
                      color: showHistory ? '#fff' : 'rgba(255, 193, 7, 0.9)',
                      backgroundColor: showHistory ? 'rgba(255, 193, 7, 0.8)' : 'transparent',
                      '&:hover': {
                        borderColor: 'rgba(255, 193, 7, 0.8)',
                        backgroundColor: showHistory ? 'rgba(255, 193, 7, 0.9)' : 'rgba(255, 193, 7, 0.1)'
                      }
                    }}
                  >
                    {showHistory ? '이전 대화 숨기기' : `이전 대화 (${historyCount})`}
                  </Button>
                </Tooltip>
                <Tooltip title="서버에 저장된 대화 기록 삭제">
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteSweepIcon sx={{ fontSize: 14 }} />}
                    onClick={clearServerHistory}
                    sx={{ fontSize: '0.75rem', textTransform: 'none', borderRadius: '12px' }}
                  >
                    기록 삭제
                  </Button>
                </Tooltip>
              </>
            )}
            {/* 히스토리 새로고침 버튼 - 항상 표시 */}
            <Tooltip title="히스토리 새로고침">
              <IconButton
                size="small"
                onClick={refreshHistory}
                sx={{
                  width: 28,
                  height: 28,
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #dadce0',
                  '&:hover': {
                    backgroundColor: '#e8eaed'
                  }
                }}
              >
                <AutorenewIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
        
        {/* Redis 상태 및 메시지 카운트 */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={redisConnected ? 'Redis 연결됨' : 'Redis 연결 안됨'}>
            <StorageIcon 
              sx={{ 
                fontSize: 16, 
                color: redisConnected ? '#4caf50' : '#f44336',
                opacity: 0.8
              }} 
            />
          </Tooltip>
          {historyCount > 0 && (
            <Chip
              size="small"
              label={`저장: ${historyCount}`}
              sx={{ 
                fontSize: '0.65rem', 
                height: 20,
                backgroundColor: 'rgba(64, 224, 208, 0.2)',
                color: 'rgba(255, 255, 255, 0.8)'
              }}
            />
          )}
          <Typography variant="caption" className="premium-caption">
            {getFilteredMessages().length}개 표시
          </Typography>
        </Box>
      </Box>

      {/* 💬 Messages Area */}
      <Box 
        className="chat-messages" 
        sx={{ 
          flex: 1, 
          overflowY: 'auto', 
          overflowX: 'hidden',
          p: 1, 
          background: 'transparent',
          borderRadius: '6px',
          mb: 1,
          maxHeight: 'calc(100vh - 250px)',
          minHeight: '450px'
        }}
      >
        {getFilteredMessages().map((message, index) => (
          <Box
            key={index}
            sx={{
              display: 'flex',
              justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
              alignItems: 'flex-start',
              mb: 0.8,
              gap: 1
            }}
          >
            {/* 봇 메시지일 때만 아이콘 표시 (왼쪽) */}
            {message.type === 'bot' && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                width: 40,
                height: 40,
                flexShrink: 0,
                mt: 0.2
              }}>
                {message.severity ? getSeverityIcon(message.severity) : 
                  <Box
                    component="img"
                    src="/Gemini_Generated_Image_opry79opry79opry.png"
                    alt="AI Bot"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'block';
                    }}
                    sx={{ 
                      width: 40, 
                      height: 40, 
                      objectFit: 'cover',
                      borderRadius: '50%',
                      backgroundColor: 'transparent'
                    }}
                  />
                }
              </Box>
            )}
            
            <Paper
              elevation={0}
              className="chat-message"
              sx={{
                p: 1.5,
                maxWidth: '80%',
                minWidth: '150px',
                backgroundColor: message.type === 'user' ? 
                  'linear-gradient(135deg, rgba(138, 43, 226, 0.9) 0%, rgba(30, 144, 255, 0.8) 50%, rgba(64, 224, 208, 0.9) 100%)' : 
                  message.isDateDivider ? 'linear-gradient(145deg, rgba(100, 181, 246, 0.2) 0%, rgba(100, 181, 246, 0.1) 100%)' :
                  message.isHistoryDivider ? 'linear-gradient(145deg, rgba(255, 193, 7, 0.2) 0%, rgba(255, 193, 7, 0.1) 100%)' :
                  message.isFromHistory ? 'linear-gradient(145deg, rgba(100, 100, 120, 0.6) 0%, rgba(80, 80, 100, 0.5) 100%)' :
                  message.isSummary ? 'linear-gradient(145deg, rgba(76, 175, 80, 0.15) 0%, rgba(76, 175, 80, 0.08) 100%)' :
                  message.hasDynamicActions ? 'linear-gradient(145deg, rgba(138, 43, 226, 0.15) 0%, rgba(138, 43, 226, 0.08) 100%)' : 
                  'linear-gradient(145deg, rgba(15, 15, 25, 0.9) 0%, rgba(25, 25, 40, 0.8) 100%)',
                color: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '8px',
                opacity: message.isFromHistory ? 0.85 : (message.isAutoGenerated && !isImportantMessage(message) ? 0.8 : 1),
                border: message.isDateDivider ? '1px solid rgba(100, 181, 246, 0.5)' :
                        message.isHistoryDivider ? '1px solid rgba(255, 193, 7, 0.5)' :
                        message.isFromHistory ? '1px solid rgba(255, 255, 255, 0.05)' :
                        isImportantMessage(message) ? '1px solid rgba(64, 224, 208, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px) saturate(180%)',
                boxShadow: message.type === 'user' ? 
                  '0 4px 16px rgba(138, 43, 226, 0.2)' : 
                  '0 4px 16px rgba(0, 0, 0, 0.1)',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                {/* 아이콘을 텍스트박스 밖으로 이동했으므로 여기서는 제거 */}
                
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {/* 메시지 접기/펼치기 버튼 (긴 메시지용) */}
                  {message.content.length > 500 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <IconButton
                        size="small"
                        onClick={() => toggleMessageCollapse(index)}
                        sx={{ mr: 1 }}
                      >
                        {collapsedMessages.has(index) ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                      </IconButton>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {collapsedMessages.has(index) ? '메시지 펼치기' : '메시지 접기'}
                      </Typography>
                    </Box>
                  )}

                  <Collapse in={!collapsedMessages.has(index)} timeout="auto">
                    {message.isLoading ? (
                      // 로딩 상태
                      <LoadingMessage 
                        message={message.content} 
                        type={message.loadingType || 'analyzing'} 
                      />
                    ) : message.isStreaming ? (
                      // 스트리밍 상태 - 실시간 타이핑 효과
                      <Box>
                        <Box
                          sx={{
                            maxWidth: '100%',
                            overflow: 'hidden',
                            '& p': {
                              marginBottom: '6px',
                              lineHeight: 1.5,
                              fontSize: '0.875rem',
                              wordBreak: 'break-word'
                            },
                            '& strong, & b': {
                              fontWeight: 'bold',
                              fontSize: '0.875rem'
                            },
                            '& code': {
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              wordBreak: 'break-all'
                            }
                          }}
                        >
                          {message.content ? (
                            <ReactMarkdown
                              components={{
                                code: CodeBlock
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          ) : (
                            <Typography variant="body2" sx={{ fontStyle: 'italic', opacity: 0.7 }}>
                              소금이가 생각하는 중...
                            </Typography>
                          )}

                        </Box>
                      </Box>
                    ) : message.executingCommands ? (
                      // 실행 중인 명령어 표시
                      <Box>
                        <Box
                          sx={{
                            maxWidth: '100%',
                            overflow: 'hidden',
                            '& p': {
                              marginBottom: '6px',
                              lineHeight: 1.5,
                              fontSize: `${fontSize}rem`,
                              wordBreak: 'break-word'
                            },
                            '& strong, & b': {
                              fontWeight: 'bold',
                              fontSize: `${fontSize}rem`
                            },
                            '& code': {
                              backgroundColor: '#f5f5f5',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                              fontSize: `${fontSize * 0.9}rem`,
                              wordBreak: 'break-all'
                            },
                            '& pre': {
                              backgroundColor: '#f8f9fa',
                              padding: '12px',
                              borderRadius: '8px',
                              overflow: 'auto',
                              border: '1px solid #e9ecef',
                              maxWidth: '100%'
                            },
                            '& pre code': {
                              backgroundColor: 'transparent',
                              padding: 0,
                              wordBreak: 'break-all',
                              whiteSpace: 'pre-wrap',
                              fontSize: `${fontSize * 0.9}rem`
                            }
                          }}
                        >
                          <ReactMarkdown
                            components={{
                              code: CodeBlock
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </Box>
                      </Box>
                    ) : message.content.includes('**') || message.content.includes('`') ? (
                      // 마크다운 렌더링 (헤더 제외)
                      <Box
                        sx={{
                          maxWidth: '100%',
                          overflow: 'hidden',
                          '& p': {
                            marginBottom: '6px',
                            lineHeight: 1.5,
                            fontSize: `${fontSize}rem`,
                            wordBreak: 'break-word'
                          },
                          '& strong, & b': {
                            fontWeight: 'bold',
                            fontSize: `${fontSize}rem`
                          },
                          '& ul, & ol': {
                            paddingLeft: '20px',
                            marginBottom: '8px',
                            fontSize: `${fontSize}rem`
                          },
                          '& li': {
                            marginBottom: '4px',
                            wordBreak: 'break-word'
                          },
                          '& code': {
                            backgroundColor: '#f5f5f5',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: `${fontSize * 0.9}rem`,
                            wordBreak: 'break-all'
                          },
                          '& pre': {
                            backgroundColor: '#f8f9fa',
                            padding: '12px',
                            borderRadius: '8px',
                            overflow: 'auto',
                            border: '1px solid #e9ecef',
                            maxWidth: '100%'
                          },
                          '& pre code': {
                            backgroundColor: 'transparent',
                            padding: 0,
                            wordBreak: 'break-all',
                            whiteSpace: 'pre-wrap',
                            fontSize: `${fontSize * 0.9}rem`
                          },
                          '& blockquote': {
                            borderLeft: '4px solid #1976d2',
                            paddingLeft: '12px',
                            margin: '8px 0',
                            fontStyle: 'italic',
                            wordBreak: 'break-word',
                            fontSize: `${fontSize}rem`
                          },
                          ...(message.isSummary && {
                            backgroundColor: '#f8f9fa',
                            padding: '16px',
                            borderRadius: '12px',
                            border: '2px solid #e3f2fd'
                          })
                        }}
                      >
                        <ReactMarkdown 
                          components={{
                            code: CodeBlock,
                            // 헤더를 일반 텍스트로 변환
                            h1: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold', fontSize: `${fontSize}rem` }}>{children}</Typography>,
                            h2: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold', fontSize: `${fontSize}rem` }}>{children}</Typography>,
                            h3: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold', fontSize: `${fontSize}rem` }}>{children}</Typography>,
                            h4: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold', fontSize: `${fontSize}rem` }}>{children}</Typography>,
                            h5: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold', fontSize: `${fontSize}rem` }}>{children}</Typography>,
                            h6: ({ children }) => <Typography component="span" sx={{ fontWeight: 'bold', fontSize: `${fontSize}rem` }}>{children}</Typography>
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </Box>
                    ) : (
                      // 일반 텍스트
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          wordBreak: 'break-word', 
                          whiteSpace: 'pre-line',
                          lineHeight: 1.5,
                          overflowWrap: 'break-word',
                          fontSize: `${fontSize}rem`
                        }}
                      >
                        {message.content}
                      </Typography>
                    )}
                  </Collapse>
                  
                  {/* 진행 상황 표시 (progressData) */}
                  {message.progressData && message.collapsible && (
                    <Box sx={{ mt: 2 }}>
                      <Paper
                        elevation={1}
                        sx={{
                          p: 1.5,
                          backgroundColor: '#f8f9fa',
                          border: '1px solid #e9ecef',
                          borderRadius: 2
                        }}
                      >
                        <Box 
                          sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleProgressCollapse(index)}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                            📋 명령어 실행 상세
                          </Typography>
                          <IconButton size="small">
                            {message.collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
                          </IconButton>
                        </Box>
                        <Collapse in={!message.collapsed}>
                          <Box sx={{ mt: 1 }}>
                            {message.progressData.commands.map((cmd, cmdIndex) => (
                              <Box 
                                key={cmdIndex}
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 1,
                                  mb: 0.5,
                                  p: 0.5,
                                  backgroundColor: message.progressData.statuses[cmdIndex] === 'running' ? '#fff3cd' : 'transparent',
                                  borderRadius: 1
                                }}
                              >
                                <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                                  {getStatusIcon(message.progressData.statuses[cmdIndex])}
                                </Typography>
                                <Typography 
                                  variant="caption" 
                                  sx={{ 
                                    fontFamily: 'monospace',
                                    fontSize: '0.7rem',
                                    flex: 1,
                                    color: message.progressData.statuses[cmdIndex] === 'warning' ? '#ff9800' : '#495057'
                                  }}
                                >
                                  {cmd}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Collapse>
                      </Paper>
                    </Box>
                  )}

                  {/* 확인 버튼 (요약/후속작업) */}
                  {message.needsConfirmation && message.confirmationButtons && (
                    <Box sx={{ mt: 2 }}>
                      <Paper
                        elevation={2}
                        sx={{ 
                          p: 2, 
                          backgroundColor: '#e8f5e9',
                          border: '1px solid #a5d6a7',
                          borderRadius: 2
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                          {message.confirmationButtons.map((button, btnIndex) => (
                            <Button
                              key={btnIndex}
                              variant={button.value === 'yes' ? 'contained' : 'outlined'}
                              color="primary"
                              size="small"
                              onClick={() => handleConfirmationResponse(
                                button.value, 
                                message.confirmationType, 
                                message.confirmationData,
                                index
                              )}
                              sx={{ 
                                fontSize: '0.75rem',
                                textTransform: 'none',
                                borderRadius: 2,
                                minWidth: '100px'
                              }}
                            >
                              {button.label}
                            </Button>
                          ))}
                        </Box>
                      </Paper>
                    </Box>
                  )}
                  
                  {/* 정적 액션 버튼 제거 */}

                  {/* 동적 액션 버튼들 - AI 응답과 함께 표시 */}
                  {message.hasDynamicActions && message.dynamicActions && (
                    <Box sx={{ mt: 2 }}>
                      {message.actionContext && (
                        <Typography variant="caption" sx={{ 
                          display: 'block', 
                          mb: 1, 
                          fontStyle: 'italic',
                          color: 'text.secondary'
                        }}>
                          💡 {message.actionContext}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {message.dynamicActions.map((action, index) => (
                        <Paper
                          key={action.id || index}
                          elevation={1}
                          sx={{ 
                            p: 1.5, 
                            backgroundColor: '#f8f9fa',
                            border: '1px solid #e9ecef'
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="subtitle2" sx={{ 
                                fontWeight: 'bold', 
                                color: '#495057',
                                fontSize: '0.85rem'
                              }}>
                                {action.title}
                              </Typography>
                              <Typography variant="caption" sx={{ 
                                color: '#6c757d', 
                                display: 'block', 
                                mt: 0.5,
                                fontSize: '0.75rem'
                              }}>
                                {action.description}
                              </Typography>
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" sx={{ 
                                  color: '#495057', 
                                  fontWeight: 'medium',
                                  fontSize: '0.7rem'
                                }}>
                                  실행할 명령어:
                                </Typography>
                                {action.commands.map((cmd, cmdIndex) => (
                                  <Typography 
                                    key={cmdIndex}
                                    variant="caption" 
                                    sx={{ 
                                      display: 'block', 
                                      fontFamily: 'monospace',
                                      backgroundColor: '#e9ecef',
                                      padding: '2px 6px',
                                      borderRadius: '3px',
                                      mt: 0.5,
                                      fontSize: '0.65rem'
                                    }}
                                  >
                                    {cmd}
                                  </Typography>
                                ))}
                              </Box>
                            </Box>
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={clickedActions.has(action.id) ? <AutorenewIcon /> : <PlayArrowIcon />}
                              onClick={() => handleExecuteDynamicAction(action)}
                              disabled={clickedActions.has(action.id)}
                              sx={{ 
                                fontSize: '0.65rem',
                                textTransform: 'none',
                                borderRadius: 2,
                                backgroundColor: clickedActions.has(action.id) ? '#6c757d' : '#28a745',
                                '&:hover': {
                                  backgroundColor: clickedActions.has(action.id) ? '#6c757d' : '#218838'
                                },
                                ml: 1,
                                minWidth: '60px',
                                height: '28px'
                              }}
                            >
                              {clickedActions.has(action.id) ? '실행 중' : '실행'}
                            </Button>
                          </Box>
                        </Paper>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {/* 분석 프롬프트 - 예/아니오 버튼 */}
                  {message.isAnalysisPrompt && (
                    <Box sx={{ mt: 2 }}>
                      <Paper
                        elevation={2}
                        sx={{ 
                          p: 2, 
                          backgroundColor: '#e3f2fd',
                          border: '1px solid #90caf9',
                          borderRadius: 2
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            onClick={() => handleAnalysisResponse('yes', message.analysisData)}
                            sx={{ 
                              fontSize: '0.75rem',
                              textTransform: 'none',
                              borderRadius: 2,
                              minWidth: '80px'
                            }}
                          >
                            🔍 예, 분석 실행
                          </Button>
                          <Button
                            variant="outlined"
                            color="primary"
                            size="small"
                            onClick={() => handleAnalysisResponse('no', message.analysisData)}
                            sx={{ 
                              fontSize: '0.75rem',
                              textTransform: 'none',
                              borderRadius: 2,
                              minWidth: '80px'
                            }}
                          >
                            ❌ 아니오, 건너뛰기
                          </Button>
                        </Box>
                      </Paper>
                    </Box>
                  )}

                  {/* 권한 프롬프트 - 예/아니오 버튼 */}
                  {message.isPermissionPrompt && (
                    <Box sx={{ mt: 2 }}>
                      <Paper
                        elevation={2}
                        sx={{ 
                          p: 2, 
                          backgroundColor: '#fff3cd',
                          border: '1px solid #ffeaa7',
                          borderRadius: 2
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 1 }}>
                          <Button
                            variant="contained"
                            color="error"
                            size="small"
                            onClick={() => handlePermissionResponse('yes', message.permissionError, message.actionId)}
                            sx={{ 
                              fontSize: '0.75rem',
                              textTransform: 'none',
                              borderRadius: 2,
                              minWidth: '80px'
                            }}
                          >
                            🔓 예, 루트 권한으로 전환
                          </Button>
                          <Button
                            variant="outlined"
                            color="primary"
                            size="small"
                            onClick={() => handlePermissionResponse('no', message.permissionError, message.actionId)}
                            sx={{ 
                              fontSize: '0.75rem',
                              textTransform: 'none',
                              borderRadius: 2,
                              minWidth: '80px'
                            }}
                          >
                            🔒 아니오, 현재 권한 유지
                          </Button>
                        </Box>
                      </Paper>
                    </Box>
                  )}
                  
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      opacity: 0.7, 
                      display: 'block', 
                      mt: 0.5,
                      fontSize: '0.65rem'
                    }}
                  >
                    {formatTime(message.timestamp)}
                    {message.isFromHistory && (
                      <Chip 
                        label="이전 대화" 
                        size="small" 
                        sx={{ ml: 1, height: 14, fontSize: '0.55rem', backgroundColor: 'rgba(255, 193, 7, 0.3)' }}
                      />
                    )}
                    {message.isHistoryDivider && (
                      <Chip 
                        label="히스토리" 
                        size="small" 
                        sx={{ ml: 1, height: 14, fontSize: '0.55rem', backgroundColor: 'rgba(255, 193, 7, 0.5)' }}
                      />
                    )}
                    {message.isAutoGenerated && (
                      <Chip 
                        label="자동 감지" 
                        size="small" 
                        sx={{ ml: 1, height: 14, fontSize: '0.55rem' }}
                      />
                    )}
                    {message.isAction && (
                      <Chip 
                        label="액션" 
                        size="small" 
                        color="primary"
                        sx={{ ml: 1, height: 14, fontSize: '0.55rem' }}
                      />
                    )}
                    {message.isSummary && (
                      <Chip 
                        label="요약" 
                        size="small" 
                        color="success"
                        sx={{ ml: 1, height: 14, fontSize: '0.55rem' }}
                      />
                    )}
                    {message.isProgress && (
                      <Chip 
                        label="진행 중" 
                        size="small" 
                        color="warning"
                        sx={{ ml: 1, height: 14, fontSize: '0.55rem' }}
                      />
                    )}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Box>
        ))}
        
        <div ref={messagesEndRef} />
      </Box>

      {/* 입력 영역 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* 🖥️ Instance Info Display */}
        {selectedInstance && (
          <Paper 
            elevation={0} 
            className="white-bg-area"
            sx={{ 
              p: 1.5, 
              mb: 1.5, 
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(64, 224, 208, 0.3)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <Box sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(64, 224, 208, 0.6), transparent)'
            }} />
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              mb: 1,
              cursor: 'pointer'
            }}
            onClick={() => setInstanceInfoCollapsed(!instanceInfoCollapsed)}
            >
              <Typography 
                variant="h6" 
                sx={{ 
                  fontWeight: 700, 
                  color: '#1976d2',
                  fontSize: '0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                🖥️ 연결된 인스턴스: {selectedInstance.name}
              </Typography>
              <IconButton size="small">
                {instanceInfoCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
              </IconButton>
            </Box>
            <Collapse in={!instanceInfoCollapsed}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <Chip 
                  label={`ID: ${selectedInstance.instanceId}`} 
                  size="small" 
                  sx={{ 
                    fontSize: '0.7rem',
                    height: '20px',
                    backgroundColor: '#e3f2fd',
                    color: '#1976d2',
                    fontWeight: 600
                  }}
                />
                <Chip 
                  label={`타입: ${selectedInstance.instanceType}`} 
                  size="small" 
                  variant="outlined" 
                  sx={{ 
                    fontSize: '0.7rem',
                    height: '20px',
                    borderColor: '#1976d2',
                    color: '#1976d2',
                    fontWeight: 600
                  }}
                />
                <Chip 
                  label={`OS: ${selectedInstance.platformDetails || selectedInstance.platform}`} 
                  size="small" 
                  sx={{ 
                    fontSize: '0.7rem',
                    height: '20px',
                    backgroundColor: '#1976d2',
                    color: 'white',
                    fontWeight: 600
                  }}
                />
              </Box>
              {selectedInstance.architecture && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip 
                    label={`아키텍처: ${selectedInstance.architecture}`} 
                    size="small" 
                    sx={{ 
                      fontSize: '0.7rem',
                      height: '20px',
                      backgroundColor: '#f3e5f5',
                      color: '#7b1fa2',
                      fontWeight: 600
                    }}
                  />
                  {selectedInstance.region && (
                    <Chip 
                      label={`리전: ${selectedInstance.region}`} 
                      size="small" 
                      sx={{ 
                        fontSize: '0.7rem',
                        height: '20px',
                        backgroundColor: '#e1f5fe',
                        color: '#0277bd',
                        fontWeight: 600
                      }}
                    />
                  )}
                  {selectedInstance.state && (
                    <Chip 
                      label={`상태: ${selectedInstance.state}`} 
                      size="small" 
                      sx={{ 
                        fontSize: '0.7rem',
                        height: '20px',
                        backgroundColor: selectedInstance.state === 'running' ? '#e8f5e8' : '#fafafa',
                        color: selectedInstance.state === 'running' ? '#2e7d32' : '#666',
                        fontWeight: 600
                      }}
                    />
                  )}
                </Box>
              )}
            </Collapse>
          </Paper>
        )}


        
        <Box className="chat-input-container" sx={{ padding: '6px !important' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="메시지를 입력하세요..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            multiline
            maxRows={3}
            disabled={!socket}
            className="modern-input"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                '&:hover': {
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                },
                '&.Mui-focused': {
                  borderColor: 'rgba(64, 224, 208, 0.6)',
                  boxShadow: '0 0 10px rgba(64, 224, 208, 0.2)'
                }
              }
            }}
          />
          <IconButton 
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || !socket || isAnalyzing}
            className="modern-button-primary"
            sx={{ 
              width: 40,
              height: 40,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, rgba(64, 224, 208, 0.9) 0%, rgba(138, 43, 226, 0.8) 100%)',
              '&:hover': {
                background: 'linear-gradient(145deg, rgba(64, 224, 208, 1) 0%, rgba(138, 43, 226, 0.9) 100%)',
                transform: 'scale(1.05)'
              },
              '&:disabled': {
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.3)'
              }
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>

      {/* 캘린더 Drawer */}
      <Drawer
        anchor="right"
        open={showCalendar}
        onClose={() => setShowCalendar(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: 350,
            boxSizing: 'border-box'
          }
        }}
      >
        <HistoryCalendar
          socket={socket}
          selectedInstance={selectedInstance}
          onDateSelect={(date) => {
            setShowHistory(true);
          }}
        />
      </Drawer>
    </Box>
  );
};

export default ChatBot;