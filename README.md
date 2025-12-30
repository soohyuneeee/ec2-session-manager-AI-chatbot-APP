# 🚀 EC2 Session Manager with AI Assistant

<div align="center">

**브라우저에서 바로 접속하는 AWS EC2 터미널 + AI 챗봇**

[![AWS](https://img.shields.io/badge/AWS-ECS%20%7C%20EC2%20%7C%20SSM-FF9900?style=flat-square&logo=amazon-aws)](https://aws.amazon.com/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--time-010101?style=flat-square&logo=socket.io)](https://socket.io/)

[데모 보기](#) · [문제 신고](https://github.com/soohyuneeee/ec2-session-manager-AI-chatbot-APP/issues) · [기능 요청](https://github.com/soohyuneeee/ec2-session-manager-AI-chatbot-APP/issues)

</div>

---

## 📖 소개

AWS EC2 인스턴스에 웹 브라우저만으로 접속하고, AI 챗봇의 도움을 받으며 작업할 수 있는 통합 플랫폼입니다. 
복잡한 SSH 설정 없이, 어디서든 브라우저만 있으면 EC2 인스턴스를 관리할 수 있습니다.

### ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🖥️ **웹 터미널** | XTerm.js 기반의 풀 기능 터미널 에뮬레이터 |
| 🤖 **AI 어시스턴트** | Claude를 활용한 실시간 명령어 분석 및 도움말 |
| 📅 **히스토리 관리** | 날짜별 대화 기록 저장 및 캘린더 뷰 |
| 🔄 **실시간 동기화** | Socket.IO를 통한 즉각적인 입출력 처리 |
| 🔐 **크로스 어카운트** | 여러 AWS 계정의 인스턴스 통합 관리 |
| 🚀 **자동 배포** | GitHub Actions를 통한 CI/CD 파이프라인 |

### 🎯 이런 분들에게 추천합니다

- 🏢 여러 AWS 계정의 EC2 인스턴스를 관리하는 DevOps 엔지니어
- 💻 SSH 클라이언트 설정 없이 빠르게 서버에 접속하고 싶은 개발자
- 🤝 팀원들과 터미널 세션을 공유하고 싶은 팀
- 📱 모바일이나 태블릿에서도 서버를 관리하고 싶은 분

---

## 🎬 데모

### 메인 화면
```
┌─────────────────────────────────────────────────────────────┐
│  EC2 인스턴스 목록        │  실시간 터미널  │  AI 챗봇      │
│  ├─ i-xxx (running)      │  $ ls -la       │  💬 도움이    │
│  ├─ i-yyy (running)      │  total 48       │     필요하신가요?│
│  └─ i-zzz (stopped)      │  drwxr-xr-x ... │                │
└─────────────────────────────────────────────────────────────┘
```

### 주요 화면 구성
- **왼쪽**: EC2 인스턴스 목록 및 연결 상태
- **중앙**: 실시간 터미널 (XTerm.js)
- **오른쪽**: AI 챗봇 및 명령어 분석
- **하단**: 날짜별 히스토리 캘린더

---

## 🏗️ 아키텍처

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Browser   │◄───────►│   ECS Fargate    │◄───────►│   AWS EC2   │
│  (React)    │  HTTPS  │  Node.js + Redis │   SSM   │  Instances  │
└─────────────┘         └──────────────────┘         └─────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ AWS Bedrock  │
                        │  (Claude AI) │
                        └──────────────┘
```

### 기술 스택

**Frontend**
- React 18 - UI 프레임워크
- XTerm.js - 터미널 에뮬레이터
- Socket.IO Client - 실시간 통신
- React Calendar - 히스토리 캘린더

**Backend**
- Node.js + Express - 웹 서버
- Socket.IO - 양방향 실시간 통신
- node-pty - 터미널 프로세스 관리
- Redis - 세션 및 히스토리 저장

**Infrastructure**
- AWS ECS Fargate - 컨테이너 오케스트레이션
- AWS ECR - Docker 이미지 저장소
- AWS ALB - 로드 밸런싱
- AWS Route53 - DNS 관리
- AWS Secrets Manager - 자격 증명 관리
- GitHub Actions - CI/CD 파이프라인

---

## 🚀 빠른 시작

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

---

## 📚 프로젝트 구조

```
ec2-session-manager-AI-chatbot-APP/
├── 📁 client/                    # React 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   │   ├── Terminal.js       # XTerm.js 터미널
│   │   │   ├── ChatBot.js        # AI 챗봇 인터페이스
│   │   │   ├── HistoryCalendar.js # 날짜별 히스토리
│   │   │   └── ConnectionPanel.js # 인스턴스 연결 패널
│   │   └── App.js
│   └── package.json
│
├── 📁 server/                    # Node.js 백엔드
│   ├── handlers/
│   │   └── socketHandlers.js    # Socket.IO 이벤트 핸들러
│   ├── services/
│   │   ├── aiService.js         # Claude AI 통합
│   │   ├── ec2Service.js        # EC2 인스턴스 관리
│   │   ├── executionService.js  # 명령어 실행
│   │   ├── historyService.js    # Redis 히스토리 관리
│   │   └── terminalAnalyzer.js  # 터미널 출력 분석
│   ├── config/
│   │   └── aws.js               # AWS 설정
│   └── index.js
│
├── 📁 .github/workflows/         # CI/CD
│   └── deploy.yml               # GitHub Actions 워크플로우
│
├── 📄 Dockerfile                 # 컨테이너 이미지 정의
├── 📄 docker-compose.yml         # 로컬 개발 환경
├── 📄 ecs-task-definition.json   # ECS 태스크 정의
└── 📄 deploy.sh                  # 배포 스크립트
```

---

## 🎨 주요 기능 상세

### 1. 웹 기반 터미널
- **풀 기능 터미널**: 색상, 커서 이동, 특수 문자 모두 지원
- **복사/붙여넣기**: 브라우저 클립보드 통합
- **크기 조절**: 반응형 터미널 크기 자동 조정
- **세션 유지**: 연결 끊김 시 자동 재연결

### 2. AI 어시스턴트
- **실시간 분석**: 명령어 실행 결과를 AI가 자동 분석
- **오류 감지**: 에러 발생 시 자동으로 해결 방법 제안
- **명령어 추천**: 작업 흐름에 맞는 다음 명령어 제안
- **요약 생성**: 긴 출력 결과를 간결하게 요약

### 3. 히스토리 관리
- **날짜별 저장**: 모든 대화를 날짜별로 자동 저장
- **캘린더 뷰**: 직관적인 캘린더에서 날짜 선택
- **검색 기능**: 과거 명령어 및 대화 검색
- **자동 정리**: 7일 이상 된 히스토리 자동 삭제

### 4. 크로스 어카운트 지원
- **멀티 어카운트**: 여러 AWS 계정의 인스턴스 통합 관리
- **역할 전환**: IAM Role을 통한 안전한 권한 관리
- **통합 뷰**: 모든 계정의 인스턴스를 한 화면에서 확인

---

## 🔧 고급 설정

### 환경 변수 상세

| 변수명 | 설명 | 필수 | 기본값 |
|--------|------|------|--------|
| `AWS_REGION` | AWS 리전 | ✅ | `ap-northeast-2` |
| `AWS_ACCESS_KEY_ID` | AWS 액세스 키 | ✅ | - |
| `AWS_SECRET_ACCESS_KEY` | AWS 시크릿 키 | ✅ | - |
| `BEDROCK_MODEL_ID` | Claude 모델 ARN | ✅ | - |
| `BEDROCK_REGION` | Bedrock 리전 | ✅ | `us-east-1` |
| `REDIS_HOST` | Redis 호스트 | ✅ | `localhost` |
| `REDIS_PORT` | Redis 포트 | ✅ | `6379` |
| `PORT` | 서버 포트 | ❌ | `3003` |
| `CROSS_ACCOUNT_ROLE_ARN` | 크로스 어카운트 역할 | ❌ | - |

### 프로덕션 배포

프로덕션 환경은 AWS ECS Fargate에서 실행됩니다:

```bash
# 1. 인프라 설정
./deployment/setup-infrastructure.sh ssm.soohyuneeee.com

# 2. 시크릿 설정
./deployment/setup-secrets.sh

# 3. 배포
./deployment/deploy.sh
```

자세한 내용은 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.

### CI/CD 설정

GitHub Actions를 통한 자동 배포:

1. GitHub Secrets 설정
2. `main` 브랜치에 푸시
3. 자동으로 빌드 및 배포

자세한 내용은 [CICD_SETUP.md](CICD_SETUP.md)를 참고하세요.

---

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

---

## 🤝 기여하기

기여는 언제나 환영합니다! 다음 방법으로 참여하실 수 있습니다:

1. 🐛 [이슈 제보](https://github.com/soohyuneeee/ec2-session-manager-AI-chatbot-APP/issues)
2. 💡 [기능 제안](https://github.com/soohyuneeee/ec2-session-manager-AI-chatbot-APP/issues)
3. 🔧 Pull Request 제출

### 개발 가이드라인

```bash
# 1. Fork & Clone
git clone https://github.com/YOUR_USERNAME/ec2-session-manager-AI-chatbot-APP.git

# 2. 브랜치 생성
git checkout -b feature/amazing-feature

# 3. 변경사항 커밋
git commit -m "Add amazing feature"

# 4. Push
git push origin feature/amazing-feature

# 5. Pull Request 생성
```

---

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

---

## 👨‍💻 만든 사람

**Soohyun Lee**
- GitHub: [@soohyuneeee](https://github.com/soohyuneeee)

---

## 🙏 감사의 말

이 프로젝트는 다음 오픈소스 프로젝트들을 사용합니다:
- [XTerm.js](https://xtermjs.org/) - 터미널 에뮬레이터
- [Socket.IO](https://socket.io/) - 실시간 통신
- [React](https://reactjs.org/) - UI 프레임워크
- [AWS SDK](https://aws.amazon.com/sdk-for-javascript/) - AWS 통합

---

<div align="center">

**⭐ 이 프로젝트가 도움이 되셨다면 Star를 눌러주세요! ⭐**

Made with ❤️ by Soohyun Lee

</div>