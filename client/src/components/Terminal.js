import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const Terminal = ({ socket, sessionId, onCloseSession }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket) return;

    let xterm = null;
    let fitAddon = null;
    let webLinksAddon = null;
    let resizeObserver = null;

    const initializeTerminal = async () => {
      try {
        // 터미널 컨테이너가 준비될 때까지 대기
        if (!terminalRef.current) {
          setTimeout(initializeTerminal, 100);
          return;
        }

        // XTerm 인스턴스 생성 (256색 지원 강화)
        xterm = new XTerm({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", "Courier New", monospace',
          letterSpacing: -0.5,
          lineHeight: 1.1,
          fontWeight: 'normal',
          fontWeightBold: 'bold',
          // 색상 테마 설정 (zsh 스타일, 256색 지원)
          theme: {
            background: '#1e1e1e',
            foreground: '#ffffff',
            cursor: '#ffffff',
            selection: '#3a3a3a',
            // ANSI 색상 팔레트 (zsh 호환, 더 선명한 색상)
            black: '#2e3436',
            red: '#ef2929',
            green: '#8ae234',
            yellow: '#fce94f',
            blue: '#729fcf',
            magenta: '#ad7fa8',
            cyan: '#34e2e2',
            white: '#eeeeec',
            brightBlack: '#555753',
            brightRed: '#ff6565',
            brightGreen: '#4fc414',
            brightYellow: '#ffff55',
            brightBlue: '#5555ff',
            brightMagenta: '#ff55ff',
            brightCyan: '#55ffff',
            brightWhite: '#ffffff'
          },
          // 고정 크기로 시작하여 dimensions 오류 방지
          cols: 90,
          rows: 30,
          scrollback: 1000,
          // 색상 및 스타일 지원 강화
          allowProposedApi: false,
          convertEol: true,
          // ANSI 색상 지원 활성화
          allowTransparency: false,
          drawBoldTextInBrightColors: true,
          macOptionIsMeta: true,
          rightClickSelectsWord: true,
          // 터미널 기능 강화
          altClickMovesCursor: true,
          cursorStyle: 'block',
          cursorWidth: 1,
          // 256색 지원
          termName: 'xterm-256color'
        });

        // 애드온 로드
        fitAddon = new FitAddon();
        webLinksAddon = new WebLinksAddon();

        xterm.loadAddon(fitAddon);
        xterm.loadAddon(webLinksAddon);

        // 터미널을 DOM에 연결
        xterm.open(terminalRef.current);

        // 참조 저장
        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        // 터미널이 완전히 마운트된 후 크기 조정
        const performInitialFit = () => {
          try {
            if (fitAddon && xterm && terminalRef.current && terminalRef.current.offsetWidth > 0) {
              fitAddon.fit();
              setIsTerminalReady(true);
              setError(null);
            } else {
              // 아직 준비되지 않았으면 다시 시도
              setTimeout(performInitialFit, 100);
            }
          } catch (err) {
            console.warn('Fit operation failed:', err);
            setIsTerminalReady(true); // 오류가 있어도 터미널은 사용 가능하게 함
          }
        };

        // 초기 fit 실행
        setTimeout(performInitialFit, 300);

        // 터미널 입력 처리 (단순화)
        xterm.onData((data) => {
          if (socket && socket.connected) {
            socket.emit('terminal-input', data);
          }
        });

        // 서버로부터 터미널 출력 수신
        const handleTerminalOutput = (data) => {
          try {
            if (xterm && typeof data === 'string') {
              xterm.write(data);
            }
          } catch (err) {
            console.warn('Write to terminal failed:', err);
          }
        };

        // 세션 종료 이벤트 수신 (서버에서 disconnect-session 완료 시)
        const handleSessionClosed = () => {
          console.log('세션이 종료되었습니다. 탭을 닫습니다.');
          if (onCloseSession) {
            onCloseSession();
          }
        };

        socket.on('terminal-output', handleTerminalOutput);
        socket.on('session-closed', handleSessionClosed);

        // 디바운싱을 위한 타이머와 이전 크기 저장
        let resizeTimeout = null;
        let lastWidth = 0;
        let lastHeight = 0;

        // ResizeObserver를 사용한 더 안전한 리사이즈 처리 (디바운싱 적용)
        if (window.ResizeObserver && terminalRef.current) {
          resizeObserver = new ResizeObserver((entries) => {
            // ResizeObserver 오류 방지를 위한 try-catch와 디바운싱
            if (resizeTimeout) {
              clearTimeout(resizeTimeout);
            }
            
            resizeTimeout = setTimeout(() => {
              try {
                // 실제 크기 변경이 있는지 확인
                const entry = entries[0];
                if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                  const newWidth = Math.floor(entry.contentRect.width);
                  const newHeight = Math.floor(entry.contentRect.height);
                  
                  // 크기가 실제로 변경되었을 때만 fit 실행
                  if (Math.abs(newWidth - lastWidth) > 5 || Math.abs(newHeight - lastHeight) > 5) {
                    lastWidth = newWidth;
                    lastHeight = newHeight;
                    
                    if (fitAddon && xterm && terminalRef.current) {
                      // ResizeObserver loop 오류 방지를 위해 requestAnimationFrame 사용
                      requestAnimationFrame(() => {
                        try {
                          fitAddon.fit();
                          if (socket && socket.connected) {
                            socket.emit('resize-terminal', {
                              cols: xterm.cols,
                              rows: xterm.rows
                            });
                          }
                        } catch (err) {
                          console.warn('Resize operation in RAF failed:', err);
                        }
                      });
                    }
                  }
                }
              } catch (err) {
                console.warn('Resize operation failed:', err);
              }
            }, 300); // 300ms 디바운싱으로 증가
          });
          
          resizeObserver.observe(terminalRef.current);
        }

        // 폴백: 윈도우 리사이즈 이벤트 (디바운싱 적용)
        let windowResizeTimeout = null;
        const handleWindowResize = () => {
          if (windowResizeTimeout) {
            clearTimeout(windowResizeTimeout);
          }
          
          windowResizeTimeout = setTimeout(() => {
            try {
              if (fitAddon && xterm && terminalRef.current && terminalRef.current.offsetWidth > 0) {
                requestAnimationFrame(() => {
                  try {
                    fitAddon.fit();
                    if (socket && socket.connected) {
                      socket.emit('resize-terminal', {
                        cols: xterm.cols,
                        rows: xterm.rows
                      });
                    }
                  } catch (err) {
                    console.warn('Window resize RAF failed:', err);
                  }
                });
              }
            } catch (err) {
              console.warn('Window resize handling failed:', err);
            }
          }, 200); // 200ms 디바운싱
        };

        window.addEventListener('resize', handleWindowResize);

        // 정리 함수 반환
        return () => {
          try {
            // 타이머 정리
            if (resizeTimeout) {
              clearTimeout(resizeTimeout);
            }
            if (windowResizeTimeout) {
              clearTimeout(windowResizeTimeout);
            }
            
            window.removeEventListener('resize', handleWindowResize);
            if (resizeObserver) {
              resizeObserver.disconnect();
            }
            if (socket) {
              socket.off('terminal-output', handleTerminalOutput);
              socket.off('session-closed', handleSessionClosed);
            }
            if (xterm) {
              xterm.dispose();
            }
          } catch (err) {
            console.warn('Cleanup failed:', err);
          }
          setIsTerminalReady(false);
        };

      } catch (error) {
        console.error('Terminal initialization failed:', error);
        setError(error.message);
        return () => {};
      }
    };

    const cleanup = initializeTerminal();

    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [socket]);

  if (error) {
    return (
      <div 
        style={{ 
          height: '100%', 
          width: '100%',
          backgroundColor: '#1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff6b6b',
          fontSize: '14px',
          padding: '20px',
          textAlign: 'center'
        }}
      >
        터미널 초기화 오류: {error}
        <br />
        <small>페이지를 새로고침해주세요.</small>
      </div>
    );
  }

  return (
    <div 
      style={{ 
        height: '100%', 
        width: '100%',
        backgroundColor: '#1e1e1e',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '4px'
      }}
    >
      
      <div 
        ref={terminalRef} 
        className="terminal-container"
        style={{ 
          height: '100%', 
          width: '100%',
          backgroundColor: '#1e1e1e',
          overflow: 'hidden',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", "Courier New", monospace',
          letterSpacing: '-0.5px',
          lineHeight: '1.1'
        }}
      />
      {!isTerminalReady && !error && (
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#ffffff',
            fontSize: '14px',
            zIndex: 10
          }}
        >
          터미널 초기화 중...
        </div>
      )}
    </div>
  );
};

export default Terminal;