import React, { useState } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Paper,
  Container,
  Alert
} from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const AccountSelector = ({ onAccountSelect }) => {
  const [accountId, setAccountId] = useState('');
  const [externalId, setExternalId] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const validateAccountId = (id) => {
    // AWS 계정 ID는 12자리 숫자
    return /^\d{12}$/.test(id);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!accountId.trim()) {
      setError('계정 번호를 입력해주세요.');
      return;
    }

    if (!validateAccountId(accountId)) {
      setError('올바른 AWS 계정 번호를 입력해주세요. (12자리 숫자)');
      return;
    }

    setIsValidating(true);

    // 계정 정보 전달
    onAccountSelect({
      accountId: accountId.trim(),
      externalId: externalId.trim() || null,
      roleName: 'SaltwareCrossAccount'
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center' 
    }}>
      <Paper 
        elevation={3}
        sx={{ 
          p: 4, 
          width: '100%',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid rgba(79, 70, 229, 0.1)'
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <CloudIcon sx={{ 
            fontSize: 60, 
            color: '#4f46e5',
            mb: 2,
            filter: 'drop-shadow(0 4px 6px rgba(79, 70, 229, 0.3))'
          }} />
          <Typography 
            variant="h4" 
            sx={{ 
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1
            }}
          >
            ⚡ AI 세션 매니저
          </Typography>
          <Typography variant="body2" color="text.secondary">
            AWS 계정에 연결하여 EC2 인스턴스를 관리하세요
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="AWS 계정 번호"
            placeholder="123456789012"
            value={accountId}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 12);
              setAccountId(value);
              setError('');
            }}
            onKeyPress={handleKeyPress}
            disabled={isValidating}
            sx={{ mb: 2 }}
            helperText="12자리 AWS 계정 번호를 입력하세요"
            inputProps={{
              maxLength: 12,
              pattern: '[0-9]*',
              inputMode: 'numeric'
            }}
          />

          <TextField
            fullWidth
            label="External ID (선택사항)"
            placeholder="보안을 위한 External ID"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isValidating}
            sx={{ mb: 3 }}
            helperText="External ID가 설정된 경우에만 입력하세요"
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ 
            p: 2, 
            mb: 3,
            backgroundColor: '#f0f7ff',
            borderRadius: '8px',
            border: '1px solid #d0e7ff'
          }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 600, color: '#1565c0' }}>
              📋 연결 정보
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: '#424242', mb: 0.5 }}>
              • Role: <strong>SaltwareCrossAccount</strong>
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: '#424242', mb: 0.5 }}>
              • 권한: EC2 조회, Session Manager 접근
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: '#616161', fontSize: '0.7rem' }}>
              ⚠️ 대상 계정에 SaltwareCrossAccount Role이 있어야 합니다
            </Typography>
          </Box>

          <Button
            fullWidth
            variant="contained"
            size="large"
            type="submit"
            disabled={isValidating || !accountId}
            endIcon={<ArrowForwardIcon />}
            sx={{
              py: 1.5,
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)'
              },
              '&:disabled': {
                background: '#e2e8f0'
              }
            }}
          >
            {isValidating ? '연결 중...' : '계정 연결'}
          </Button>
        </Box>

        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            🔒 안전한 Switch Role 방식으로 연결됩니다
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default AccountSelector;
