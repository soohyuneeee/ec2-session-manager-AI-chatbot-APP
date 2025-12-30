import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Grid, Paper, Typography, AppBar, Toolbar, Box, IconButton, Tooltip, Tabs, Tab } from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import Terminal from './components/Terminal';
import ChatBot from './components/ChatBot';
import ConnectionPanel from './components/ConnectionPanel';
import AccountSelector from './components/AccountSelector';
import io from 'socket.io-client';
import './App.css';

// ResizeObserver 오류 억제 (개발 환경에서만)
if (process.env.NODE_ENV === 'development') {
  const resizeObserverErr = window.console.error;
  window.console.error = (...args) => {
    if (args[0] && args[0].includes && args[0].includes('ResizeObserver loop')) {
      return;
    }
    resizeObserverErr(...args);
  };
}

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [sessions, setSessions] = useState([]); // 여러 세션 관리
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [showConnectionPanel, setShowConnectionPanel] = useState(true);
  const [terminalWidth, setTerminalWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const socketRef = useRef(null);
  
  // 계정 선택 상태
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showAccountSelector, setShowAccountSelector] = useState(true);
  
  // 각 세션의 메시지와 히스토리 상태를 App에서 관리
  const [sessionStates, setSessionStates] = useState({}); // { sessionId: { messages: [], historyCount: 0, historyMessages: [] } }

  // 드래그 핸들러
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    
    // 최소 20%, 최대 80%로 제한
    const clampedWidth = Math.max(20, Math.min(80, newWidth));
    setTerminalWidth(clampedWidth);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    // 초기 socket은 인스턴스 목록 조회용으로만 사용
    const socketUrl = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:3003';
    const mainSocket = io(socketUrl);
    socketRef.current = mainSocket;

    mainSocket.on('connect', () => {
      setIsConnected(true);
      console.log('메인 서버에 연결됨');
    });

    mainSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('메인 서버 연결 해제됨');
    });

    return () => {
      mainSocket.close();
      // 모든 세션 socket도 정리
      sessions.forEach(session => {
        if (session.socket) {
          session.socket.close();
        }
      });
    };
  }, []);

  // 계정 선택 핸들러
  const handleAccountSelect = (accountInfo) => {
    console.log('계정 선택:', accountInfo);
    setSelectedAccount(accountInfo);
    setShowAccountSelector(false);
  };

  // 새 세션 추가 - 각 세션마다 독립적인 socket 생성
  const handleAddSession = (instance) => {
    // 이미 같은 인스턴스의 세션이 열려있는지 확인
    const existingSession = sessions.find(s => s.instance.instanceId === instance.instanceId);
    
    if (existingSession) {
      // 이미 열려있으면 해당 탭으로 이동
      setActiveSessionId(existingSession.id);
      setShowConnectionPanel(false);
      
      // 사용자에게 알림 (선택사항)
      console.log(`인스턴스 ${instance.name}의 세션이 이미 열려있습니다. 해당 탭으로 이동합니다.`);
      return;
    }
    
    const newSessionId = `session_${Date.now()}`;
    
    // 새로운 socket 연결 생성
    const socketUrl = process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : 'http://localhost:3003';
    const sessionSocket = io(socketUrl);
    
    sessionSocket.on('connect', () => {
      console.log(`세션 ${newSessionId} socket 연결됨:`, sessionSocket.id);
      
      // 연결 후 세션 시작 (계정 정보 포함)
      sessionSocket.emit('start-session', {
        instanceId: instance.instanceId,
        instanceInfo: {
          ...instance,
          accountId: selectedAccount?.accountId,
          externalId: selectedAccount?.externalId
        }
      });
    });
    
    const newSession = {
      id: newSessionId,
      instance: instance,
      socket: sessionSocket,
      active: true
    };
    
    // 세션 상태 초기화
    setSessionStates(prev => ({
      ...prev,
      [newSessionId]: {
        messages: [],
        historyCount: 0,
        historyMessages: [],
        historyLoaded: false
      }
    }));
    
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSessionId);
    setShowConnectionPanel(false);
  };

  // 세션 닫기
  const handleCloseSession = (sessionId, e) => {
    if (e) e.stopPropagation();
    
    const sessionToClose = sessions.find(s => s.id === sessionId);
    if (sessionToClose && sessionToClose.socket) {
      sessionToClose.socket.emit('disconnect-session');
      sessionToClose.socket.close(); // socket 연결 종료
    }
    
    // 세션 상태 삭제
    setSessionStates(prev => {
      const newStates = { ...prev };
      delete newStates[sessionId];
      return newStates;
    });
    
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      if (filtered.length === 0) {
        setShowConnectionPanel(true);
        setActiveSessionId(null);
      } else if (activeSessionId === sessionId) {
        // 닫힌 탭이 활성 탭이었다면 다음 탭으로 이동
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  };

  // 탭 변경
  const handleTabChange = (event, newValue) => {
    if (newValue === 'add') {
      setShowConnectionPanel(true);
    } else {
      setActiveSessionId(newValue);
      setShowConnectionPanel(false);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const hasAnySessions = sessions.length > 0;

  // 계정 선택 화면 표시
  if (showAccountSelector) {
    return <AccountSelector onAccountSelect={handleAccountSelect} />;
  }

  return (
    <div className="App">
      <AppBar 
        position="static" 
        elevation={0}
        sx={{ 
          background: 'rgba(20, 20, 30, 0.95)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <Toolbar sx={{ minHeight: '48px !important', py: 0 }}>
          <Typography 
            variant="h6" 
            component="div" 
            className="korean-text"
            sx={{ 
              flexGrow: 1,
              fontFamily: "'Spoqa Han Sans Neo', sans-serif",
              fontWeight: 700,
              fontSize: '1.25rem',
              background: 'linear-gradient(135deg, #40e0d0 0%, #8a2be2 50%, #1e90ff 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 20px rgba(64, 224, 208, 0.5), 0 0 40px rgba(138, 43, 226, 0.3)',
              letterSpacing: '-0.02em'
            }}
          >
            ⚡ AI 세션 매니저
          </Typography>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.25) 100%)',
            borderRadius: '20px',
            padding: '8px 16px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <Box sx={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              backgroundColor: isConnected ? (hasAnySessions ? '#22c55e' : '#eab308') : '#ef4444',
              boxShadow: isConnected ? (hasAnySessions ? '0 0 8px #22c55e' : '0 0 8px #eab308') : '0 0 8px #ef4444'
            }} />
            <Typography 
              variant="body2" 
              sx={{ 
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.9rem',
                textShadow: '0 1px 3px rgba(0, 0, 0, 0.3), 0 0 20px rgba(255, 255, 255, 0.5)',
                letterSpacing: '-0.02em'
              }}
            >
              {isConnected ? (hasAnySessions ? `${sessions.length}개 세션 활성` : '연결됨') : '연결 해제됨'}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Container 
        maxWidth={false} 
        sx={{ 
          height: 'calc(100vh - 48px)',
          padding: 0,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 세션 탭 */}
        {hasAnySessions && (
          <Box sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            flexShrink: 0
          }}>
            <Tabs 
              value={showConnectionPanel ? 'add' : activeSessionId} 
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: '40px',
                '& .MuiTab-root': {
                  minHeight: '40px',
                  textTransform: 'none',
                  fontSize: '0.875rem'
                }
              }}
            >
              {sessions.map((session) => (
                <Tab
                  key={session.id}
                  value={session.id}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>🖥️ {session.instance.name}</span>
                      <Box
                        component="span"
                        onClick={(e) => handleCloseSession(session.id, e)}
                        sx={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 20, 
                          height: 20,
                          borderRadius: '50%',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': { 
                            backgroundColor: 'rgba(244, 67, 54, 0.1)',
                            transform: 'scale(1.1)'
                          }
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </Box>
                    </Box>
                  }
                />
              ))}
              <Tab
                value="add"
                icon={<AddIcon />}
                iconPosition="start"
                label="새 세션"
                sx={{ minWidth: 100 }}
              />
            </Tabs>
          </Box>
        )}

        {showConnectionPanel ? (
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            <ConnectionPanel 
              socket={socketRef.current} 
              onInstanceSelect={handleAddSession}
              activeSessions={sessions}
              selectedAccount={selectedAccount}
            />
            />
          </Box>
        ) : (
          <Box 
            ref={containerRef}
            sx={{ 
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {sessions.map((session) => (
              <Box
                key={session.id}
                sx={{
                  width: '100%',
                  height: '100%',
                  display: session.id === activeSessionId ? 'flex' : 'none',
                  overflow: 'hidden'
                }}
              >
                {/* Terminal Zone */}
                <Box sx={{ 
                  width: `${terminalWidth}%`,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div className="terminal-container">
                    <Box sx={{ 
                      p: 1, 
                      borderBottom: '1px solid #e2e8f0',
                      background: 'linear-gradient(135deg, #f1f5f9 0%, #f8fafc 100%)'
                    }}>
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          fontSize: '0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          color: 'rgba(0, 0, 0, 0.87)',
                          fontWeight: 600
                        }}
                      >
                        💻 터미널
                        <Box 
                          component="span" 
                          className="modern-chip"
                          sx={{ 
                            fontSize: '0.7rem',
                            padding: '1px 6px'
                          }}
                        >
                          {Math.round(terminalWidth)}%
                        </Box>
                      </Typography>
                    </Box>
                    <Box sx={{ 
                      flex: 1, 
                      overflow: 'hidden', 
                      padding: '4px',
                      height: 'calc(100% - 40px)'
                    }}>
                      <Terminal 
                        socket={session.socket} 
                        sessionId={session.id}
                        onCloseSession={() => handleCloseSession(session.id)}
                      />
                    </Box>
                  </div>
                </Box>

                {/* Resizer */}
                <Box
                  onMouseDown={handleMouseDown}
                  sx={{
                    width: '8px',
                    height: '100%',
                    backgroundColor: isDragging ? '#4f46e5' : 'rgba(0, 0, 0, 0.1)',
                    cursor: 'col-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: isDragging ? 'none' : 'background-color 0.2s ease',
                    '&:hover': {
                      backgroundColor: '#4f46e5',
                      '& .drag-icon': {
                        opacity: 1
                      }
                    },
                    position: 'relative',
                    zIndex: 10
                  }}
                >
                  <DragIndicatorIcon 
                    className="drag-icon"
                    sx={{ 
                      color: 'white',
                      fontSize: '16px',
                      opacity: isDragging ? 1 : 0.7,
                      transition: 'opacity 0.2s ease'
                    }} 
                  />
                  
                  {/* Reset button */}
                  <Tooltip title="1:1 비율로 리셋">
                    <IconButton
                      onClick={() => setTerminalWidth(50)}
                      sx={{
                        position: 'absolute',
                        top: '8px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        '&:hover': {
                          backgroundColor: 'white'
                        }
                      }}
                      size="small"
                    >
                      <SwapHorizIcon sx={{ fontSize: '12px', color: '#4f46e5' }} />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* AI Assistant Zone */}
                <Box sx={{ 
                  width: `${100 - terminalWidth}%`,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div className="chat-container">
                    <Box sx={{ 
                      p: 1, 
                      borderBottom: '1px solid #e2e8f0',
                      background: 'linear-gradient(135deg, #f1f5f9 0%, #f8fafc 100%)'
                    }}>
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          fontSize: '0.9rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          color: 'rgba(0, 0, 0, 0.87)',
                          fontWeight: 600
                        }}
                      >
                        🤖 AI 어시스턴트 소금이
                        <Box 
                          component="span" 
                          className="modern-chip"
                          sx={{ 
                            fontSize: '0.7rem',
                            padding: '1px 6px'
                          }}
                        >
                          {Math.round(100 - terminalWidth)}%
                        </Box>
                      </Typography>
                    </Box>
                    <Box sx={{ 
                      flex: 1, 
                      overflow: 'hidden', 
                      padding: '4px',
                      height: 'calc(100% - 40px)'
                    }}>
                      <ChatBot 
                        socket={session.socket} 
                        selectedInstance={session.instance} 
                        sessionId={session.id}
                        sessionState={sessionStates[session.id] || { messages: [], historyCount: 0, historyMessages: [], historyLoaded: false }}
                        setSessionState={(updater) => {
                          setSessionStates(prev => ({
                            ...prev,
                            [session.id]: typeof updater === 'function' ? updater(prev[session.id] || { messages: [], historyCount: 0, historyMessages: [], historyLoaded: false }) : updater
                          }));
                        }}
                      />
                    </Box>
                  </div>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Container>
    </div>
  );
}

export default App;