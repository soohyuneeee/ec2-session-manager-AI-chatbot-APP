const redis = require('redis');

class HistoryService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      // Redis 클라이언트 생성 (redis v4+ 형식)
      this.client = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('Redis 재시도 횟수 초과');
              return new Error('Redis 재시도 횟수 초과');
            }
            return Math.min(retries * 100, 3000);
          }
        },
        password: process.env.REDIS_PASSWORD || undefined,
        database: process.env.REDIS_DB || 0
      });

      // 연결 이벤트 핸들러
      this.client.on('connect', () => {
        console.log('✅ Redis 연결됨');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        console.error('❌ Redis 연결 오류:', err);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('🔌 Redis 연결 종료됨');
        this.isConnected = false;
      });

      // Redis 연결
      await this.client.connect();
      console.log('🔗 Redis 클라이언트 연결 시도 완료');
      
    } catch (error) {
      console.error('Redis 초기화 오류:', error);
      this.isConnected = false;
    }
  }

  // 인스턴스별 대화 히스토리 키 생성
  getHistoryKey(instanceId) {
    return `chat:${instanceId}`;
  }

  // 대화 히스토리 저장
  async saveMessage(instanceId, message) {
    if (!this.isConnected || !this.client) {
      console.warn('Redis가 연결되지 않음 - 메시지 저장 건너뜀');
      return false;
    }

    try {
      const key = this.getHistoryKey(instanceId);
      const messageData = {
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
        date: new Date(message.timestamp || new Date()).toISOString().split('T')[0] // YYYY-MM-DD 형식
      };

      // 리스트에 메시지 추가 (최신 메시지가 뒤에 오도록)
      await this.client.rPush(key, JSON.stringify(messageData));
      
      // TTL 설정 (7일 후 자동 삭제)
      await this.client.expire(key, 7 * 24 * 60 * 60);
      
      // 최대 1000개 메시지만 유지 (오래된 것부터 삭제)
      await this.client.lTrim(key, -1000, -1);
      
      return true;
    } catch (error) {
      console.error('메시지 저장 오류:', error);
      return false;
    }
  }

  // 액션 실행 내역 저장
  async saveActionExecution(instanceId, actionData) {
    if (!this.isConnected || !this.client) {
      console.warn('Redis가 연결되지 않음 - 액션 실행 내역 저장 건너뜀');
      return false;
    }

    try {
      const key = this.getHistoryKey(instanceId);
      const actionMessage = {
        type: 'action_execution',
        content: actionData.actionTitle || '액션 실행',
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        actionId: actionData.actionId,
        commands: actionData.commands,
        results: actionData.results,
        status: actionData.status // 'success', 'error', 'warning'
      };

      await this.client.rPush(key, JSON.stringify(actionMessage));
      await this.client.expire(key, 7 * 24 * 60 * 60);
      await this.client.lTrim(key, -1000, -1);
      
      return true;
    } catch (error) {
      console.error('액션 실행 내역 저장 오류:', error);
      return false;
    }
  }

  // 대화 히스토리 조회 (일자별로 그룹화)
  async getHistory(instanceId, limit = 100) {
    if (!this.isConnected || !this.client) {
      console.warn('Redis가 연결되지 않음 - 빈 히스토리 반환');
      return [];
    }

    try {
      const key = this.getHistoryKey(instanceId);
      
      // 최근 메시지부터 가져오기 (limit 개수만큼)
      const messages = await this.client.lRange(key, -limit, -1);
      
      const parsedMessages = messages.map(msg => {
        try {
          return JSON.parse(msg);
        } catch (error) {
          console.error('메시지 파싱 오류:', error);
          return null;
        }
      }).filter(msg => msg !== null);

      // 일자별로 그룹화
      const groupedByDate = {};
      parsedMessages.forEach(msg => {
        const date = msg.date || new Date(msg.timestamp).toISOString().split('T')[0];
        if (!groupedByDate[date]) {
          groupedByDate[date] = [];
        }
        groupedByDate[date].push(msg);
      });

      // 날짜 순으로 정렬하여 반환
      return Object.keys(groupedByDate)
        .sort()
        .map(date => ({
          date,
          messages: groupedByDate[date]
        }));
      
    } catch (error) {
      console.error('히스토리 조회 오류:', error);
      return [];
    }
  }

  // 특정 날짜의 히스토리 조회
  async getHistoryByDate(instanceId, date) {
    if (!this.isConnected || !this.client) {
      console.warn('Redis가 연결되지 않음 - 빈 히스토리 반환');
      return [];
    }

    try {
      const key = this.getHistoryKey(instanceId);
      const messages = await this.client.lRange(key, 0, -1);
      
      const parsedMessages = messages.map(msg => {
        try {
          return JSON.parse(msg);
        } catch (error) {
          console.error('메시지 파싱 오류:', error);
          return null;
        }
      }).filter(msg => msg !== null);

      // 특정 날짜의 메시지만 필터링
      return parsedMessages.filter(msg => {
        const msgDate = msg.date || new Date(msg.timestamp).toISOString().split('T')[0];
        return msgDate === date;
      });
      
    } catch (error) {
      console.error('날짜별 히스토리 조회 오류:', error);
      return [];
    }
  }

  // 히스토리가 있는 날짜 목록 조회
  async getHistoryDates(instanceId) {
    if (!this.isConnected || !this.client) {
      console.warn('Redis가 연결되지 않음 - 빈 목록 반환');
      return [];
    }

    try {
      const key = this.getHistoryKey(instanceId);
      const messages = await this.client.lRange(key, 0, -1);
      
      const parsedMessages = messages.map(msg => {
        try {
          return JSON.parse(msg);
        } catch (error) {
          return null;
        }
      }).filter(msg => msg !== null);

      // 날짜 목록 추출 (중복 제거)
      const dates = [...new Set(parsedMessages.map(msg => {
        return msg.date || new Date(msg.timestamp).toISOString().split('T')[0];
      }))];

      return dates.sort();
      
    } catch (error) {
      console.error('히스토리 날짜 목록 조회 오류:', error);
      return [];
    }
  }

  // 특정 인스턴스의 히스토리 삭제
  async clearHistory(instanceId) {
    if (!this.isConnected || !this.client) {
      console.warn('Redis가 연결되지 않음 - 히스토리 삭제 건너뜀');
      return false;
    }

    try {
      const key = this.getHistoryKey(instanceId);
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('히스토리 삭제 오류:', error);
      return false;
    }
  }

  // 모든 인스턴스의 히스토리 목록 조회
  async getAllInstanceHistories() {
    if (!this.isConnected || !this.client) {
      console.warn('Redis가 연결되지 않음 - 빈 목록 반환');
      return [];
    }

    try {
      const keys = await this.client.keys('chat:*');
      const instances = keys.map(key => {
        const instanceId = key.replace('chat:', '');
        return instanceId;
      });
      
      return instances;
    } catch (error) {
      console.error('인스턴스 목록 조회 오류:', error);
      return [];
    }
  }

  // 인스턴스별 메시지 개수 조회
  async getMessageCount(instanceId) {
    if (!this.isConnected || !this.client) {
      return 0;
    }

    try {
      const key = this.getHistoryKey(instanceId);
      return await this.client.lLen(key);
    } catch (error) {
      console.error('메시지 개수 조회 오류:', error);
      return 0;
    }
  }

  // Redis 연결 상태 확인
  isRedisConnected() {
    return this.isConnected && this.client;
  }

  // Redis 연결 종료
  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }
}

// 싱글톤 인스턴스 생성
const historyService = new HistoryService();

module.exports = historyService;