const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { setupSocketHandlers } = require('./handlers/socketHandlers');
const historyService = require('./services/historyService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? true : "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// 프로덕션 환경에서 정적 파일 제공
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

setupSocketHandlers(io);

// 자격 증명 갱신 엔드포인트 추가
const { refreshCredentials } = require('./config/aws');
app.post('/refresh-credentials', async (req, res) => {
  try {
    await refreshCredentials();
    res.json({ success: true, message: '자격 증명이 갱신되었습니다.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 히스토리 관리 API 엔드포인트들
app.get('/api/history/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { limit } = req.query;
    
    const history = await historyService.getHistory(instanceId, limit ? parseInt(limit) : 100);
    const messageCount = await historyService.getMessageCount(instanceId);
    
    res.json({
      success: true,
      instanceId,
      history,
      totalMessages: messageCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/history/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const success = await historyService.clearHistory(instanceId);
    
    res.json({
      success,
      instanceId,
      message: success ? '히스토리가 삭제되었습니다.' : '히스토리 삭제에 실패했습니다.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/histories', async (req, res) => {
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
    
    res.json({
      success: true,
      histories: historiesWithCounts
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/redis/status', (req, res) => {
  const isConnected = historyService.isRedisConnected();
  res.json({
    success: true,
    connected: isConnected,
    timestamp: new Date()
  });
});

// 프로덕션 환경에서 모든 요청을 React 앱으로 라우팅
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`🚀 EC2 세션 매니저 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.CROSS_ACCOUNT_ROLE_ARN && !process.env.CROSS_ACCOUNT_ROLE_ARN.includes('TARGET_ACCOUNT_ID')) {
    console.log(`🔐 크로스 어카운트 역할 설정됨: ${process.env.CROSS_ACCOUNT_ROLE_ARN}`);
    console.log(`📋 세션 이름: ${process.env.CROSS_ACCOUNT_SESSION_NAME || 'ec2-session-manager-cross-account'}`);
    if (process.env.CROSS_ACCOUNT_EXTERNAL_ID) {
      console.log(`🔑 External ID 설정됨: ${process.env.CROSS_ACCOUNT_EXTERNAL_ID}`);
    }
  } else {
    console.log(`⚠️ 크로스 어카운트 역할이 설정되지 않음 - 기본 자격 증명 사용`);
    console.log(`💡 크로스 어카운트 사용을 원하면 .env 파일에서 CROSS_ACCOUNT_ROLE_ARN을 설정하세요`);
  }
});