# EC2 Session Manager ECS 배포 가이드

이 가이드는 EC2 Session Manager 애플리케이션을 AWS ECS (Fargate)에 배포하는 방법을 설명합니다.

## 사전 요구사항

- AWS CLI 설치 및 구성
- Docker 설치
- 적절한 AWS 권한 (ECS, ECR, IAM, Secrets Manager, ElastiCache, Route53)

## 배포 순서

### 1. Redis 설정 (ElastiCache)

```bash
./setup-redis.sh
```

이 스크립트는:
- ElastiCache Redis 클러스터 생성
- 보안 그룹 및 서브넷 그룹 설정
- Redis 엔드포인트 정보 출력

출력된 Redis 엔드포인트를 `.env` 파일에 업데이트하세요:

```bash
REDIS_HOST=your-redis-endpoint.cache.amazonaws.com
REDIS_PORT=6379
```

### 2. Secrets Manager 설정

```bash
./setup-secrets.sh
```

이 스크립트는:
- `.env` 파일에서 환경 변수 읽기
- AWS Secrets Manager에 시크릿 생성
  - `ec2-session-manager/aws-credentials`: AWS 자격 증명
  - `ec2-session-manager/redis`: Redis 설정

### 3. ECS 인프라 설정

```bash
# 도메인 없이 설정
./setup-infrastructure.sh

# 또는 Route53 도메인과 함께 설정
./setup-infrastructure.sh your-domain.com
```

이 스크립트는:
- ECS 클러스터 생성
- Application Load Balancer (ALB) 생성
- Target Group 생성
- 보안 그룹 설정
- IAM 역할 생성 (Task Execution Role, Task Role)
- CloudWatch 로그 그룹 생성
- ECS 서비스 생성
- (선택) Route53 레코드 생성

### 4. 애플리케이션 배포

```bash
# latest 태그로 배포
./deploy.sh

# 또는 특정 태그로 배포
./deploy.sh v1.0.0
```

이 스크립트는:
- ECR 리포지토리 생성 (없으면)
- Docker 이미지 빌드
- ECR에 이미지 푸시
- ECS 태스크 정의 업데이트
- ECS 서비스 업데이트 (새 배포)

## 배포 후 확인

### 서비스 상태 확인

```bash
aws ecs describe-services \
  --cluster ec2-session-manager-cluster \
  --services ec2-session-manager-service \
  --region ap-northeast-2
```

### 로그 확인

```bash
# 실시간 로그 확인
aws logs tail /ecs/ec2-session-manager --follow --region ap-northeast-2

# 최근 로그 확인
aws logs tail /ecs/ec2-session-manager --since 1h --region ap-northeast-2
```

### 태스크 상태 확인

```bash
aws ecs list-tasks \
  --cluster ec2-session-manager-cluster \
  --service-name ec2-session-manager-service \
  --region ap-northeast-2
```

### ALB 상태 확인

```bash
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names ec2-session-manager-tg \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text \
    --region ap-northeast-2) \
  --region ap-northeast-2
```

## 접속

### ALB DNS로 접속

```bash
# ALB DNS 확인
aws elbv2 describe-load-balancers \
  --names ec2-session-manager-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --region ap-northeast-2
```

브라우저에서 `http://[ALB-DNS]` 로 접속

### 도메인으로 접속 (Route53 설정한 경우)

브라우저에서 `http://your-domain.com` 로 접속

## 업데이트 배포

코드 변경 후 재배포:

```bash
./deploy.sh
```

이 명령어는 자동으로:
1. 새 Docker 이미지 빌드
2. ECR에 푸시
3. ECS 서비스 강제 재배포

## 환경 변수 업데이트

환경 변수를 변경해야 하는 경우:

1. `.env` 파일 수정
2. Secrets Manager 업데이트:
   ```bash
   ./setup-secrets.sh
   ```
3. ECS 서비스 재배포:
   ```bash
   ./deploy.sh
   ```

## 비용 최적화

### 개발 환경

- ECS Task: 1개 (Fargate)
- Redis: cache.t3.micro
- ALB: 기본 설정

예상 비용: 월 $50-70

### 프로덕션 환경

고려사항:
- ECS Task 개수 증가 (Auto Scaling)
- Redis 클러스터 모드 활성화
- ALB에 HTTPS 리스너 추가 (ACM 인증서)
- CloudFront 추가 (정적 파일 캐싱)

## 문제 해결

### 태스크가 시작되지 않음

1. CloudWatch 로그 확인
2. 태스크 정의의 환경 변수 확인
3. IAM 역할 권한 확인
4. Secrets Manager 시크릿 확인

### Redis 연결 실패

1. ElastiCache 보안 그룹 확인
2. Redis 엔드포인트 확인
3. ECS 태스크와 Redis가 같은 VPC에 있는지 확인

### ALB Health Check 실패

1. 보안 그룹에서 3003 포트 허용 확인
2. 애플리케이션이 `/api/redis/status` 엔드포인트 제공하는지 확인
3. 컨테이너 로그 확인

## HTTPS 설정 (선택사항)

### 1. ACM 인증서 요청

```bash
aws acm request-certificate \
  --domain-name your-domain.com \
  --validation-method DNS \
  --region ap-northeast-2
```

### 2. ALB에 HTTPS 리스너 추가

```bash
CERT_ARN="arn:aws:acm:ap-northeast-2:YOUR_ACCOUNT_ID:certificate/YOUR_CERT_ID"
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names ec2-session-manager-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text \
  --region ap-northeast-2)
TG_ARN=$(aws elbv2 describe-target-groups \
  --names ec2-session-manager-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text \
  --region ap-northeast-2)

aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --region ap-northeast-2
```

### 3. HTTP를 HTTPS로 리다이렉트

```bash
HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN \
  --query 'Listeners[?Port==`80`].ListenerArn' \
  --output text \
  --region ap-northeast-2)

aws elbv2 modify-listener \
  --listener-arn $HTTP_LISTENER_ARN \
  --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
  --region ap-northeast-2
```

## 리소스 정리

모든 리소스를 삭제하려면:

```bash
# ECS 서비스 삭제
aws ecs update-service \
  --cluster ec2-session-manager-cluster \
  --service ec2-session-manager-service \
  --desired-count 0 \
  --region ap-northeast-2

aws ecs delete-service \
  --cluster ec2-session-manager-cluster \
  --service ec2-session-manager-service \
  --region ap-northeast-2

# ECS 클러스터 삭제
aws ecs delete-cluster \
  --cluster ec2-session-manager-cluster \
  --region ap-northeast-2

# ALB 삭제
aws elbv2 delete-load-balancer \
  --load-balancer-arn [ALB_ARN] \
  --region ap-northeast-2

# Target Group 삭제
aws elbv2 delete-target-group \
  --target-group-arn [TG_ARN] \
  --region ap-northeast-2

# Redis 클러스터 삭제
aws elasticache delete-cache-cluster \
  --cache-cluster-id ec2-session-manager-redis \
  --region ap-northeast-2

# ECR 리포지토리 삭제
aws ecr delete-repository \
  --repository-name ec2-session-manager \
  --force \
  --region ap-northeast-2

# Secrets Manager 시크릿 삭제
aws secretsmanager delete-secret \
  --secret-id ec2-session-manager/aws-credentials \
  --force-delete-without-recovery \
  --region ap-northeast-2

aws secretsmanager delete-secret \
  --secret-id ec2-session-manager/redis \
  --force-delete-without-recovery \
  --region ap-northeast-2
```

## 참고 자료

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS Fargate Documentation](https://docs.aws.amazon.com/fargate/)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS ElastiCache Documentation](https://docs.aws.amazon.com/elasticache/)
