import React, { useState, useEffect } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Paper,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  CardContent,
  CardActions,
  Chip,
  Grid,
  IconButton,
  Tooltip,
  Badge
} from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import InfoIcon from '@mui/icons-material/Info';

const ConnectionPanel = ({ socket, onInstanceSelect, activeSessions = [], selectedAccount = null }) => {
  const [instanceId, setInstanceId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [instancesByRegion, setInstancesByRegion] = useState({});
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);
  const [totalInstances, setTotalInstances] = useState(0);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [detailInstance, setDetailInstance] = useState(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [roleInfo, setRoleInfo] = useState(null);

  useEffect(() => {
    if (!socket) return;

    // AWS Role 정보 수신
    socket.on('aws-role-info-loaded', (data) => {
      setRoleInfo(data);
    });

    socket.on('aws-role-info-error', (data) => {
      console.error('AWS Role 정보 조회 실패:', data.error);
    });

    // EC2 인스턴스 로딩 상태
    socket.on('ec2-instances-loading', (data) => {
      setIsLoadingInstances(true);
      setError('');
    });

    // EC2 인스턴스 목록 수신
    socket.on('ec2-instances-loaded', (data) => {
      setInstancesByRegion(data.instancesByRegion);
      setTotalInstances(data.totalInstances);
      setIsLoadingInstances(false);
    });

    // EC2 인스턴스 조회 오류
    socket.on('ec2-instances-error', (data) => {
      setError(`인스턴스 조회 실패: ${data.error}`);
      setIsLoadingInstances(false);
    });



    // 세션 연결 오류
    socket.on('session-error', (data) => {
      setError(data.error);
      setIsConnecting(false);
    });

    // 세션 시작 성공
    socket.on('session-started', () => {
      setIsConnecting(false);
    });

    // 컴포넌트 마운트 시 EC2 인스턴스 목록 조회 및 Role 정보 조회
    loadEC2Instances();
    if (socket) {
      socket.emit('get-aws-role-info');
    }

    return () => {
      socket.off('aws-role-info-loaded');
      socket.off('aws-role-info-error');
      socket.off('ec2-instances-loading');
      socket.off('ec2-instances-loaded');
      socket.off('ec2-instances-error');

      socket.off('session-error');
      socket.off('session-started');
    };
  }, [socket]);

  const loadEC2Instances = () => {
    if (socket) {
      // 계정 정보와 함께 인스턴스 조회
      socket.emit('get-ec2-instances', {
        accountId: selectedAccount?.accountId,
        externalId: selectedAccount?.externalId
      });
    }
  };

  const handleInstanceSelect = (instance) => {
    setSelectedInstance(instance);
    setInstanceId(instance.instanceId);
    
    // 인스턴스 선택 시에도 상위 컴포넌트로 정보 전달
    if (onInstanceSelect) {
      onInstanceSelect(instance);
    }
  };

  const handleConnect = (targetInstanceId = null, targetInstance = null) => {
    const idToConnect = targetInstanceId || instanceId.trim();
    
    if (!idToConnect) {
      setError('EC2 인스턴스 ID를 입력하거나 선택해주세요.');
      return;
    }

    if (!socket) {
      setError('서버에 연결되지 않았습니다.');
      return;
    }

    setIsConnecting(true);
    setError('');

    // 인스턴스 정보 결정
    let instanceInfo = null;
    if (targetInstance) {
      // 버튼에서 직접 전달된 인스턴스 정보
      instanceInfo = targetInstance;
    } else if (selectedInstance && selectedInstance.instanceId === idToConnect) {
      // 선택된 인스턴스 정보
      instanceInfo = selectedInstance;
    } else {
      // 직접 입력한 경우 - 기본 정보 생성
      instanceInfo = {
        instanceId: idToConnect,
        name: idToConnect,
        platform: 'Linux/UNIX',
        platformDetails: 'Unknown',
        instanceType: 'Unknown',
        state: 'running',
        region: 'ap-northeast-2'
      };
    }

    // 인스턴스 정보만 상위 컴포넌트로 전달 (세션 시작은 App.js에서 처리)
    if (onInstanceSelect) {
      onInstanceSelect(instanceInfo);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleConnect();
    }
  };

  const getStateColor = (state) => {
    switch (state) {
      case 'running': return 'success';
      case 'stopped': return 'error';
      case 'pending': return 'warning';
      case 'stopping': return 'warning';
      default: return 'default';
    }
  };

  const getPlatformIcon = (platform, platformDetails) => {
    if (platform?.includes('windows') || platformDetails?.includes('Windows')) {
      return '🪟';
    } else if (platformDetails?.includes('Amazon Linux')) {
      return '🐧';
    } else if (platformDetails?.includes('Ubuntu')) {
      return '🟠';
    } else if (platformDetails?.includes('Red Hat')) {
      return '🔴';
    }
    return '💻';
  };

  const formatInstanceInfo = (instance) => {
    return {
      'Instance Type': instance.instanceType,
      'Platform': instance.platformDetails || instance.platform,
      'Architecture': instance.architecture,
      'Private IP': instance.privateIpAddress || 'N/A',
      'Public IP': instance.publicIpAddress || 'N/A',
      'Key Pair': instance.keyName || 'N/A',
      'Launch Time': new Date(instance.launchTime).toLocaleString('ko-KR')
    };
  };

  // 세션 시작 가능 여부 확인
  const canStartSession = (instance) => {
    // running 상태이고 SSM Agent가 연결되어 있어야 함
    return instance.state === 'running' && instance.ssmConnected === true;
  };
  
  // 세션 시작 불가 사유
  const getSessionBlockReason = (instance) => {
    if (instance.state !== 'running') {
      return `인스턴스가 ${instance.state === 'stopped' ? '중지' : instance.state} 상태입니다`;
    }
    
    if (instance.ssmConnected === false) {
      if (!instance.iamInstanceProfile) {
        return 'IAM Instance Profile이 연결되지 않았습니다';
      }
      return 'SSM Agent가 설치되지 않았거나 연결되지 않았습니다';
    }
    
    if (instance.ssmConnected === undefined || instance.ssmConnected === null) {
      return 'SSM 연결 상태를 확인할 수 없습니다 (권한 부족 가능)';
    }
    
    return null; // 시작 가능
  };
  
  // SSM 연결 상태 아이콘
  const getSSMStatusIcon = (instance) => {
    if (instance.state !== 'running') {
      return null; // 중지된 인스턴스는 SSM 상태 표시 안 함
    }
    
    if (instance.ssmConnected === true) {
      return '🟢'; // SSM 연결됨
    } else if (instance.ssmConnected === false) {
      return '🔴'; // SSM 연결 안 됨
    } else {
      return '⚪'; // SSM 상태 알 수 없음
    }
  };
  
  // SSM 연결 상태 툴팁
  const getSSMStatusTooltip = (instance) => {
    if (instance.state !== 'running') {
      return '인스턴스가 중지됨';
    }
    
    if (instance.ssmConnected === true) {
      return `SSM 연결됨 (Agent: ${instance.ssmAgentVersion || 'Unknown'})`;
    } else if (instance.ssmConnected === false) {
      return 'SSM Agent 미연결 - IAM Role 또는 Agent 설치 필요';
    } else {
      return 'SSM 연결 상태 확인 불가';
    }
  };
  
  // 인스턴스가 이미 열려있는지 확인
  const isSessionOpen = (instance) => {
    return activeSessions.some(session => session.instance.instanceId === instance.instanceId);
  };

  // 세부정보 패널 열기/닫기
  const handleInstanceDetail = (instance) => {
    if (detailInstance?.instanceId === instance.instanceId && showDetailPanel) {
      setShowDetailPanel(false);
      setDetailInstance(null);
    } else {
      setDetailInstance(instance);
      setShowDetailPanel(true);
    }
  };

  return (
    <Grid container spacing={2} sx={{ height: 'calc(100vh - 120px)', p: 2, backgroundColor: '#ffffff' }}>
      {/* 메인 패널 */}
      <Grid item xs={showDetailPanel ? 8 : 12}>
        <Box 
          className="connection-panel"
          sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%',
            gap: 2
          }}
        >
      {/* 선택된 계정 정보 */}
      {selectedAccount && (
        <Box 
          sx={{ 
            p: 1.5,
            backgroundColor: '#f0fdf4',
            borderBottom: '1px solid #bbf7d0',
            borderLeft: '4px solid #22c55e'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#16a34a' }}>
                🎯 대상 계정:
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#16a34a', fontWeight: 600 }}>
                {selectedAccount.accountId}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#5f6368' }}>
                Role:
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#424242' }}>
                {selectedAccount.roleName || 'SaltwareCrossAccount'}
              </Typography>
            </Box>
            
            {selectedAccount.externalId && (
              <Chip 
                label="External ID 사용" 
                size="small"
                sx={{ 
                  height: 18, 
                  fontSize: '0.65rem',
                  backgroundColor: '#dcfce7',
                  color: '#16a34a'
                }}
              />
            )}
          </Box>
          
          <Typography variant="caption" sx={{ display: 'block', color: '#616161', fontSize: '0.7rem' }}>
            ✅ Switch Role 방식으로 안전하게 연결됩니다
          </Typography>
        </Box>
      )}
      
      {/* AWS 접근 정보 */}
      {roleInfo && (
        <Box 
          sx={{ 
            p: 1.5,
            backgroundColor: '#f0f7ff',
            borderBottom: '1px solid #d0e7ff',
            borderLeft: '4px solid #1976d2'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 0.5 }}>
            {roleInfo.hasRole ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#1565c0' }}>
                    🔐 IAM Role:
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#1565c0', fontWeight: 600 }}>
                    {roleInfo.roleName}
                  </Typography>
                </Box>
                
                {roleInfo.accountId && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#5f6368' }}>
                      계정:
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#424242' }}>
                      {roleInfo.accountId}
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#1565c0' }}>
                  🔐 AWS Session Manager 접근
                </Typography>
              </Box>
            )}
            
            {roleInfo.region && (
              <Chip 
                label={roleInfo.region} 
                size="small"
                sx={{ 
                  height: 18, 
                  fontSize: '0.65rem',
                  backgroundColor: '#e3f2fd',
                  color: '#1565c0'
                }}
              />
            )}
          </Box>
          
          {roleInfo.permissions && roleInfo.permissions.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
              {roleInfo.permissions.map((perm, idx) => (
                <Chip 
                  key={idx}
                  label={perm} 
                  size="small"
                  sx={{ 
                    height: 20, 
                    fontSize: '0.65rem',
                    backgroundColor: '#e8f5e9',
                    color: '#2e7d32',
                    fontWeight: 500
                  }}
                />
              ))}
            </Box>
          )}
          
          <Typography variant="caption" sx={{ display: 'block', color: '#616161', fontSize: '0.7rem' }}>
            ✅ {roleInfo.securityNote}
          </Typography>
        </Box>
      )}
      
      {/* 헤더 */}
      <Box 
        sx={{ 
          p: 2,
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            EC2 인스턴스
          </Typography>
          {totalInstances > 0 && (
            <Chip 
              label={`${totalInstances}개`} 
              size="small" 
              color="primary"
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
          )}
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="새로고침">
            <IconButton 
              onClick={loadEC2Instances} 
              disabled={isLoadingInstances}
              size="small"
              sx={{
                backgroundColor: '#f8f9fa',
                border: '1px solid #dadce0',
                '&:hover': {
                  backgroundColor: '#e8eaed'
                }
              }}
            >
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setShowManualInput(!showManualInput)}
            sx={{ 
              textTransform: 'none',
              fontSize: '0.8rem',
              height: 32
            }}
          >
            {showManualInput ? '목록' : '직접 입력'}
          </Button>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 2, mb: 0 }}>
            {error}
          </Alert>
        )}

        {/* 수동 입력 모드 */}
        {showManualInput && (
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <TextField
              fullWidth
              size="small"
              label="인스턴스 ID"
              placeholder="i-1234567890abcdef0"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isConnecting}
            />
            <Button
              variant="contained"
              size="small"
              onClick={() => handleConnect()}
              disabled={isConnecting || !instanceId.trim()}
              startIcon={isConnecting ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
              sx={{ minWidth: '80px', textTransform: 'none' }}
            >
              {isConnecting ? '연결 중' : '연결'}
            </Button>
          </Box>
        )}
      </Box>

      {/* 로딩 상태 */}
      {isLoadingInstances && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CircularProgress sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            모든 리전에서 EC2 인스턴스를 조회하고 있습니다...
          </Typography>
        </Box>
      )}

      {/* 인스턴스 목록 */}
      {!isLoadingInstances && totalInstances > 0 && (
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {Object.entries(instancesByRegion).map(([region, instances]) => (
            <Accordion key={region} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Badge badgeContent={instances.length} color="primary">
                    <StorageIcon />
                  </Badge>
                  <Typography variant="h6">{region}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    ({instances.length}개 인스턴스)
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {instances.map((instance) => (
                    <Paper
                      key={instance.instanceId}
                      elevation={0}
                      sx={{
                        width: '220px',
                        p: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        background: selectedInstance?.instanceId === instance.instanceId ?
                          'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)' :
                          '#ffffff',
                        border: selectedInstance?.instanceId === instance.instanceId ?
                          '1px solid #4f46e5' : '1px solid #e2e8f0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          borderColor: '#4f46e5',
                          boxShadow: '0 2px 4px rgba(79, 70, 229, 0.15)'
                        }
                      }}
                      onClick={() => handleInstanceSelect(instance)}
                    >
                        {/* 상단: 인스턴스 정보 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                          <Box sx={{ 
                            fontSize: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 24,
                            height: 24,
                            borderRadius: '4px',
                            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                            flexShrink: 0
                          }}>
                            {getPlatformIcon(instance.platform, instance.platformDetails)}
                          </Box>
                          
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: 600,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '0.8rem',
                                lineHeight: 1.3
                              }}
                            >
                              {instance.name}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              color="text.secondary"
                              sx={{ 
                                fontSize: '0.7rem',
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.3
                              }}
                            >
                              {instance.instanceType}
                            </Typography>
                          </Box>
                          
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {getSSMStatusIcon(instance) && (
                              <Tooltip title={getSSMStatusTooltip(instance)}>
                                <span style={{ fontSize: '0.7rem', lineHeight: 1 }}>
                                  {getSSMStatusIcon(instance)}
                                </span>
                              </Tooltip>
                            )}
                            <Chip 
                              label={instance.state === 'running' ? '●' : '○'} 
                              color={getStateColor(instance.state)}
                              size="small"
                              sx={{ 
                                height: 18, 
                                fontSize: '0.65rem', 
                                minWidth: 18,
                                '& .MuiChip-label': { px: 0.5 }
                              }}
                            />
                          </Box>
                        </Box>

                        {/* 하단: 액션 버튼 */}
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="상세">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInstanceDetail(instance);
                              }}
                              sx={{
                                width: 26,
                                height: 26,
                                backgroundColor: '#f8f9fa',
                                border: '1px solid #dadce0',
                                borderRadius: '4px',
                                '&:hover': {
                                  backgroundColor: '#e8eaed'
                                }
                              }}
                            >
                              <InfoIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip 
                            title={!canStartSession(instance) ? getSessionBlockReason(instance) : ''}
                            placement="top"
                          >
                            <span style={{ width: '100%' }}>
                              <Button
                                fullWidth
                                size="small"
                                variant={isSessionOpen(instance) ? "outlined" : (canStartSession(instance) ? "contained" : "outlined")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canStartSession(instance)) {
                                    handleConnect(instance.instanceId, instance);
                                  }
                                }}
                                disabled={isConnecting || !canStartSession(instance)}
                                sx={{
                                  height: 26,
                                  fontSize: '0.7rem',
                                  textTransform: 'none',
                                  borderRadius: '4px',
                                  px: 1,
                                  minWidth: 0,
                                  ...(isSessionOpen(instance) ? {
                                    borderColor: '#22c55e',
                                    color: '#22c55e',
                                    '&:hover': {
                                      borderColor: '#16a34a',
                                      backgroundColor: 'rgba(34, 197, 94, 0.1)'
                                    }
                                  } : canStartSession(instance) ? {
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                                    '&:hover': {
                                      background: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)'
                                    }
                                  } : {
                                    opacity: 0.6,
                                    cursor: 'not-allowed',
                                    borderColor: '#e0e0e0',
                                    color: '#9e9e9e'
                                  })
                                }}
                              >
                                {isConnecting ? '...' :
                                 isSessionOpen(instance) ? '열림' :
                                 canStartSession(instance) ? '시작' :
                                 '불가'}
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>
                      </Paper>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      )}



      {/* 인스턴스가 없는 경우 */}
      {!isLoadingInstances && totalInstances === 0 && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CloudIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            실행 중인 EC2 인스턴스를 찾을 수 없습니다
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            AWS 자격 증명을 확인하거나 인스턴스 ID를 직접 입력해보세요.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadEC2Instances}
          >
            다시 조회
          </Button>
        </Box>
      )}
        </Box>
      </Grid>

      {/* 세부정보 패널 */}
      {showDetailPanel && detailInstance && (
        <Grid item xs={4}>
          <Box 
            sx={{ 
              height: 'calc(100vh - 120px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: '#ffffff',
              borderLeft: '1px solid #e2e8f0'
            }}
          >
            {/* 패널 헤더 */}
            <Box sx={{ 
              p: 3, 
              pb: 2, 
              borderBottom: '1px solid #e2e8f0',
              background: '#ffffff',
              flexShrink: 0
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography 
                  variant="h6" 
                  className="premium-title"
                  sx={{ 
                    fontSize: '1.125rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  {getPlatformIcon(detailInstance.platform, detailInstance.platformDetails)} 인스턴스 상세정보
                </Typography>
                <IconButton 
                  size="small" 
                  onClick={() => setShowDetailPanel(false)}
                  sx={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    '&:hover': {
                      backgroundColor: '#e2e8f0'
                    }
                  }}
                >
                  ✕
                </IconButton>
              </Box>
            </Box>

            {/* 패널 내용 */}
            <Box sx={{ 
              flex: 1, 
              overflow: 'auto', 
              p: 3,
              '&::-webkit-scrollbar': {
                width: '6px'
              },
              '&::-webkit-scrollbar-track': {
                background: 'rgba(0, 0, 0, 0.05)',
                borderRadius: '3px'
              },
              '&::-webkit-scrollbar-thumb': {
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '3px'
              },
              '&::-webkit-scrollbar-thumb:hover': {
                background: 'rgba(0, 0, 0, 0.3)'
              }
            }}>
              {/* 기본 정보 */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#4f46e5', fontWeight: 600 }}>
                  📋 기본 정보
                </Typography>
                <Box sx={{ 
                  background: '#f8fafc', 
                  borderRadius: '12px', 
                  p: 3, 
                  border: '1px solid #e2e8f0' 
                }}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {detailInstance.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {detailInstance.instanceId}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <Chip 
                      label={detailInstance.state} 
                      color={getStateColor(detailInstance.state)}
                      size="small"
                      className="modern-chip"
                    />
                    <Chip 
                      label={detailInstance.instanceType} 
                      size="small"
                      className="modern-chip"
                    />
                  </Box>
                </Box>
              </Box>

              {/* 상세 정보 */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, color: '#4f46e5', fontWeight: 600 }}>
                  🔧 시스템 정보
                </Typography>
                <Grid container spacing={2}>
                  {Object.entries(formatInstanceInfo(detailInstance)).map(([key, value]) => (
                    <Grid item xs={12} key={key}>
                      <Box sx={{ 
                        background: '#ffffff', 
                        borderRadius: '8px', 
                        p: 2, 
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                      }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                          {key}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'medium', mt: 0.5 }}>
                          {value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* 세션 시작 버튼 */}
              <Box sx={{ mt: 2 }}>
                <Button
                  className={canStartSession(detailInstance) ? "modern-button-primary" : "modern-button-secondary"}
                  fullWidth
                  size="medium"
                  startIcon={isConnecting ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                  onClick={() => {
                    if (canStartSession(detailInstance)) {
                      handleConnect(detailInstance.instanceId, detailInstance);
                    }
                  }}
                  disabled={isConnecting || !canStartSession(detailInstance)}
                  sx={{
                    py: 1,
                    fontSize: '0.875rem',
                    ...(canStartSession(detailInstance) ? {} : {
                      opacity: 0.6,
                      cursor: 'not-allowed'
                    })
                  }}
                >
                  {isConnecting ? '연결 중' : 
                   canStartSession(detailInstance) ? '세션 시작' : 
                   '세션 시작 불가'}
                </Button>
                
                {!canStartSession(detailInstance) && (
                  <Box sx={{ 
                    mt: 1, 
                    p: 1.5, 
                    backgroundColor: '#fff3cd', 
                    borderRadius: '8px',
                    border: '1px solid #ffc107'
                  }}>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        display: 'block', 
                        fontSize: '0.75rem',
                        color: '#856404',
                        fontWeight: 500
                      }}
                    >
                      ⚠️ {getSessionBlockReason(detailInstance)}
                    </Typography>
                    
                    {detailInstance.state === 'running' && detailInstance.ssmConnected === false && (
                      <Box sx={{ mt: 1 }}>
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            display: 'block', 
                            fontSize: '0.7rem',
                            color: '#856404',
                            lineHeight: 1.4
                          }}
                        >
                          💡 해결 방법:
                        </Typography>
                        <Typography 
                          variant="caption" 
                          sx={{ 
                            display: 'block', 
                            fontSize: '0.7rem',
                            color: '#856404',
                            lineHeight: 1.4,
                            ml: 1
                          }}
                        >
                          {!detailInstance.iamInstanceProfile 
                            ? '1. IAM Instance Profile 연결 (AmazonSSMManagedInstanceCore 정책 포함)'
                            : '1. SSM Agent 설치 확인'}
                          <br />
                          2. 네트워크 연결 확인 (VPC 엔드포인트 또는 IGW)
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </Grid>
      )}
    </Grid>
  );
};

export default ConnectionPanel;