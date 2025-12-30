# 빠른 시작 가이드

## 1단계: Secrets Manager 설정 (1분)

```bash
./setup-secrets.sh
```

## 2단계: 인프라 설정 (10분)

```bash
# 도메인 없이
./setup-infrastructure.sh

# 또는 도메인과 함께
./setup-infrastructure.sh your-domain.com
```

## 3단계: 애플리케이션 배포 (5분)

```bash
./deploy.sh
```

## 4단계: 접속 확인

ALB DNS 확인:
```bash
aws elbv2 describe-load-balancers \
  --names ec2-session-manager-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --region ap-northeast-2
```

브라우저에서 `http://[ALB-DNS]` 접속!

## 업데이트 배포

```bash
./deploy.sh
```

끝! 🎉

## 참고

- Redis는 ECS 태스크 내에서 컨테이너로 실행됩니다 (별도 ElastiCache 불필요)
- 모든 환경 변수는 Secrets Manager에서 안전하게 관리됩니다
- ALB를 통해 자동으로 로드 밸런싱 및 헬스 체크가 수행됩니다
