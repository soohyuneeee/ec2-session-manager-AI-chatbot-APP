# Redis 서비스 분리 가이드

## 개요
Redis와 App을 별도의 ECS 서비스로 분리하여, App 배포 시 Redis 데이터가 유지되도록 합니다.

## 아키텍처

```
┌─────────────────────────────────────────┐
│         ECS Cluster                     │
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Redis Service│    │  App Service │  │
│  │              │    │              │  │
│  │ - 항상 실행  │◄───│ - 업데이트   │  │
│  │ - 데이터보존 │    │   가능       │  │
│  └──────────────┘    └──────────────┘  │
│         ▲                    │          │
│         │                    │          │
│         └────────────────────┘          │
│      redis.ec2-session-manager.local    │
└─────────────────────────────────────────┘
```

## 장점

1. **데이터 영구 보존**: App 배포 시 Redis 데이터 유지
2. **비용 절감**: EFS 불필요 (월 $0)
3. **독립적 관리**: Redis와 App을 별도로 관리
4. **빠른 배포**: App만 업데이트하므로 배포 시간 단축

## 설정 방법

### 1. 초기 설정 (한 번만 실행)

```bash
cd deployment
./setup-separate-services.sh
```

이 스크립트는:
- Cloud Map 네임스페이스 생성
- Redis 서비스 디스커버리 설정
- 보안 그룹 생성
- Redis 서비스 생성 (한 번만)
- App 서비스 생성

### 2. ALB 타겟 그룹 변경

기존 ALB의 타겟 그룹을 `ec2-session-manager-app` 서비스로 변경:

```bash
# 기존 서비스 삭제 (선택사항)
aws ecs delete-service \
  --cluster ec2-session-manager-cluster \
  --service ec2-session-manager-service \
  --force \
  --region ap-northeast-2

# ALB 타겟 그룹을 새 App 서비스로 연결
# (AWS 콘솔에서 수동으로 변경하거나 아래 명령어 사용)
```

### 3. 환경 변수 확인

App이 Redis에 연결할 수 있도록 환경 변수 확인:

```bash
REDIS_HOST=redis.ec2-session-manager.local
REDIS_PORT=6379
```

## 배포 프로세스

### 일반 배포 (App만 업데이트)

```bash
# GitHub에 푸시하면 자동으로 App만 업데이트됨
git push origin main
```

GitHub Actions가:
1. Docker 이미지 빌드
2. ECR에 푸시
3. **App 서비스만** 업데이트
4. Redis는 그대로 유지 ✅

### Redis 업데이트 (필요한 경우만)

Redis를 업데이트해야 하는 경우:

```bash
# Redis 서비스 업데이트
aws ecs update-service \
  --cluster ec2-session-manager-cluster \
  --service ec2-session-manager-redis \
  --force-new-deployment \
  --region ap-northeast-2
```

⚠️ **주의**: Redis를 재시작하면 데이터가 사라집니다!

## 비용

- **Redis 서비스**: Fargate 256 CPU / 512 MB = 월 $7.50
- **App 서비스**: Fargate 256 CPU / 512 MB = 월 $7.50
- **총 비용**: 월 $15 (기존과 동일)
- **EFS 비용**: $0 (사용 안 함)

## 모니터링

### Redis 상태 확인

```bash
# Redis 서비스 상태
aws ecs describe-services \
  --cluster ec2-session-manager-cluster \
  --services ec2-session-manager-redis \
  --region ap-northeast-2

# Redis 로그 확인
aws logs tail /ecs/ec2-session-manager-redis --follow --region ap-northeast-2
```

### App 상태 확인

```bash
# App 서비스 상태
aws ecs describe-services \
  --cluster ec2-session-manager-cluster \
  --services ec2-session-manager-app \
  --region ap-northeast-2

# App 로그 확인
aws logs tail /ecs/ec2-session-manager-app --follow --region ap-northeast-2
```

## 트러블슈팅

### Redis 연결 실패

1. 보안 그룹 확인:
```bash
# App 서비스가 Redis 보안 그룹을 포함하는지 확인
aws ecs describe-services \
  --cluster ec2-session-manager-cluster \
  --services ec2-session-manager-app \
  --region ap-northeast-2 \
  --query "services[0].networkConfiguration.awsvpcConfiguration.securityGroups"
```

2. 서비스 디스커버리 확인:
```bash
# Redis DNS 레코드 확인
aws servicediscovery list-services --region ap-northeast-2
```

### 데이터 백업 (선택사항)

Redis 데이터를 백업하려면:

```bash
# Redis 컨테이너에 접속
aws ecs execute-command \
  --cluster ec2-session-manager-cluster \
  --task REDIS_TASK_ID \
  --container redis \
  --interactive \
  --command "/bin/sh"

# Redis 백업
redis-cli BGSAVE
```

## 롤백

기존 단일 서비스로 돌아가려면:

```bash
# 새 서비스 삭제
aws ecs delete-service --cluster ec2-session-manager-cluster --service ec2-session-manager-redis --force --region ap-northeast-2
aws ecs delete-service --cluster ec2-session-manager-cluster --service ec2-session-manager-app --force --region ap-northeast-2

# 기존 서비스 재생성
./deploy.sh
```
