# EC2 Session Manager Web Interface

웹 브라우저에서 EC2 인스턴스에 세션 매니저로 접근하고, AI 채팅봇과 함께 사용할 수 있는 시스템입니다.

## 기능

- 🖥️ **웹 기반 터미널**: 브라우저에서 EC2 인스턴스에 직접 접근
- 🤖 **AI 채팅봇**: 터미널 활동을 실시간으로 분석하고 도움 제공
- 💾 **대화 히스토리**: Redis를 통한 인스턴스별 대화 기록 저장 및 관리
- 🔄 **실시간 통신**: Socket.IO를 통한 실시간 터미널 입출력
- 📱 **반응형 UI**: 터미널과 채팅봇을 나란히 배치한 직관적인 인터페이스

## 시스템 요구사항

### AWS 설정
- AWS CLI 설치 및 구성
- EC2 인스턴스에 SSM Agent 설치
- 다음 IAM 권한 필요:
  - `ssm:StartSession`
  - `ssm:TerminateSession`
  - `ec2:DescribeInstances`
  - `sts:AssumeRole` (크로스 어카운트 사용 시)

### 로컬 환경
- Node.js 16+ 
- npm 또는 yarn
- Docker (Redis 실행용)

## 설치 및 실행

### 1. Redis 서버 시작
```bash
# Docker Compose를 사용하여 Redis 실행
docker-compose up -d redis

# 또는 Docker로 직접 실행
docker run -d --name ec2-session-redis -p 6379:6379 redis:7-alpine
```

### 2. 의존성 설치
```bash
# 루트 디렉토리에서
npm run install-all
```

### 3. 환경 변수 설정
```bash
cp .env.example .env
```

`.env` 파일을 편집하여 AWS 자격 증명 및 Redis 설정을 입력:
```env
# 기본 AWS 설정
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# AWS Bedrock 설정
BEDROCK_MODEL_ID=arn:aws:bedrock:us-east-1:your_account_id:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0
BEDROCK_REGION=us-east-1

# 크로스 어카운트 역할 설정 (선택사항)
CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::target_account_id:role/crossAccountTest
CROSS_ACCOUNT_EXTERNAL_ID=optional_external_id
CROSS_ACCOUNT_SESSION_NAME=ec2-session-manager-cross-account

# Redis 설정 (대화 히스토리 저장용)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# 서버 설정
PORT=3003
```

#### 크로스 어카운트 설정 (선택사항)
다른 AWS 계정의 EC2 인스턴스에 접근하려면:

1. **대상 계정에서 역할 생성**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::SOURCE_ACCOUNT_ID:root"
         },
         "Action": "sts:AssumeRole",
         "Condition": {
           "StringEquals": {
             "sts:ExternalId": "optional_external_id"
           }
         }
       }
     ]
   }
   ```

2. **역할에 필요한 권한 정책 연결**:
   - `AmazonSSMManagedInstanceCore`
   - `AmazonEC2ReadOnlyAccess`
   - 또는 커스텀 정책:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ssm:StartSession",
           "ssm:TerminateSession",
           "ec2:DescribeInstances"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

3. **소스 계정에서 역할 assume 권한 부여**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "sts:AssumeRole",
         "Resource": "arn:aws:iam::TARGET_ACCOUNT_ID:role/crossAccountTest"
       }
     ]
   }
   ```

### 4. 애플리케이션 실행
```bash
npm run dev
```

이 명령어는 다음을 동시에 실행합니다:
- 백엔드 서버 (포트 3003)
- React 프론트엔드 (포트 3000)

### 5. 브라우저에서 접속
http://localhost:3000 에서 애플리케이션을 사용할 수 있습니다.

## 대화 히스토리 관리

### 기능
- **자동 저장**: 모든 터미널 입출력과 채팅 메시지가 Redis에 자동 저장
- **인스턴스별 관리**: 각 EC2 인스턴스별로 독립적인 히스토리 관리
- **지속성**: 세션 종료 후에도 히스토리 유지 (7일간)
- **용량 제한**: 인스턴스당 최대 1000개 메시지 저장

### API 엔드포인트
```bash
# 특정 인스턴스의 히스토리 조회
GET /api/history/:instanceId?limit=100

# 특정 인스턴스의 히스토리 삭제
DELETE /api/history/:instanceId

# 모든 인스턴스의 히스토리 목록 조회
GET /api/histories

# Redis 연결 상태 확인
GET /api/redis/status
```

### Socket.IO 이벤트
```javascript
// 히스토리 조회
socket.emit('get-history', { instanceId: 'i-1234567890abcdef0', limit: 100 });

// 히스토리 삭제
socket.emit('clear-history', { instanceId: 'i-1234567890abcdef0' });

// 전체 히스토리 목록 조회
socket.emit('get-all-histories');

// Redis 상태 확인
socket.emit('check-redis-status');
```

## 사용 방법

1. **Redis 시작**: `docker-compose up -d redis`로 Redis 서버 실행
2. **연결**: EC2 인스턴스 ID를 입력하고 "세션 시작" 클릭
3. **터미널 사용**: 왼쪽 터미널에서 일반적인 Linux 명령어 사용
4. **AI 채팅**: 오른쪽 채팅봇에게 질문하거나 도움 요청
5. **자동 분석**: 터미널에서 오류 발생 시 AI가 자동으로 감지하고 알림
6. **히스토리 확인**: 이전 대화 내용이 자동으로 로드되어 연속성 유지

## 프로젝트 구조

```
├── server/                 # 백엔드 (Node.js + Express + Socket.IO)
│   ├── index.js            # 메인 서버 파일
│   ├── handlers/           # Socket.IO 이벤트 핸들러
│   │   └── socketHandlers.js
│   └── services/           # 비즈니스 로직 서비스
│       └── historyService.js # Redis 히스토리 관리
├── client/                 # 프론트엔드 (React)
│   ├── src/
│   │   ├── components/     # React 컴포넌트
│   │   │   ├── Terminal.js # XTerm.js 터미널 컴포넌트
│   │   │   ├── ChatBot.js  # AI 채팅봇 컴포넌트
│   │   │   └── ConnectionPanel.js # 연결 설정 패널
│   │   ├── App.js          # 메인 앱 컴포넌트
│   │   └── index.js        # React 엔트리 포인트
├── docker-compose.yml      # Redis 컨테이너 설정
├── package.json            # 루트 패키지 설정
└── README.md
```

## 기술 스택

### 백엔드
- **Node.js + Express**: 웹 서버
- **Socket.IO**: 실시간 양방향 통신
- **AWS SDK**: AWS 서비스 연동
- **node-pty**: 터미널 프로세스 관리
- **Redis**: 대화 히스토리 저장

### 프론트엔드
- **React**: UI 프레임워크
- **Material-UI**: UI 컴포넌트 라이브러리
- **XTerm.js**: 웹 터미널 에뮬레이터
- **Socket.IO Client**: 실시간 통신

## 보안 고려사항

⚠️ **중요: 민감한 정보 보호**

### GitHub에 절대 커밋하면 안 되는 파일들
- `.env` - AWS 자격 증명 및 시크릿 포함
- `setup-secrets.sh` - 실제 시크릿 값 포함 가능
- `*-updated.json` - 계정 ID가 포함된 임시 파일
- `task-definition.json` - 배포 시 생성되는 임시 파일

이 파일들은 이미 `.gitignore`에 포함되어 있습니다.

### AWS 자격 증명 관리
- **로컬 개발**: `.env` 파일 사용 (절대 커밋하지 말 것)
- **CI/CD**: GitHub Secrets 사용 (`CICD_SETUP.md` 참고)
- **프로덕션**: AWS Secrets Manager 사용 (이미 설정됨)

### 권장 보안 설정
- ✅ HTTPS 사용 (프로덕션 환경)
- ✅ IAM 권한을 최소한으로 제한
- ✅ 방화벽 설정을 통해 접근 제한
- ✅ 정기적으로 액세스 키 로테이션
- ✅ CloudWatch 로그 모니터링
- ✅ VPC 보안 그룹 설정

### 실수로 커밋한 경우
만약 실수로 `.env` 파일이나 AWS 키를 커밋했다면:
1. **즉시 AWS 콘솔에서 해당 액세스 키 비활성화**
2. 새로운 액세스 키 생성
3. Git 히스토리에서 완전히 제거:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch .env" \
     --prune-empty --tag-name-filter cat -- --all
   ```
4. 강제 푸시: `git push origin --force --all`

## 문제 해결

### 연결 오류
- AWS 자격 증명 확인
- EC2 인스턴스 상태 확인
- SSM Agent 설치 상태 확인
- IAM 권한 확인

### Redis 연결 문제
- Docker 컨테이너 상태 확인: `docker ps`
- Redis 로그 확인: `docker logs ec2-session-redis`
- 포트 충돌 확인: `lsof -i :6379`

### 터미널 표시 문제
- 브라우저 콘솔에서 JavaScript 오류 확인
- 네트워크 연결 상태 확인

## 향후 개선 사항

- ✅ 인스턴스별 대화 히스토리 저장 (완료)
- OpenAI API 연동으로 더 정교한 AI 응답
- 다중 세션 지원
- 파일 업로드/다운로드 기능
- 히스토리 검색 기능
- 사용자 인증 시스템
- 히스토리 내보내기/가져오기