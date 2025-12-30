# CI/CD 설정 가이드

## GitHub Actions를 통한 자동 배포

이 프로젝트는 GitHub Actions를 사용하여 `main` 또는 `master` 브랜치에 푸시할 때 자동으로 ECS에 배포됩니다.

## 필수 설정

### 1. GitHub Secrets 설정

GitHub 리포지토리 설정에서 다음 Secrets를 추가해야 합니다:

**Settings → Secrets and variables → Actions → New repository secret**

필요한 Secrets:
- `AWS_ACCESS_KEY_ID`: AWS 액세스 키 ID
- `AWS_SECRET_ACCESS_KEY`: AWS 시크릿 액세스 키

### 2. AWS IAM 권한

GitHub Actions에서 사용할 IAM 사용자에게 다음 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. IAM 사용자 생성 (선택사항)

CI/CD 전용 IAM 사용자를 생성하려면:

```bash
# IAM 사용자 생성
aws iam create-user --user-name github-actions-deployer

# 정책 생성
cat > github-actions-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:*",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name github-actions-deployer \
  --policy-name GitHubActionsDeployPolicy \
  --policy-document file://github-actions-policy.json

# 액세스 키 생성
aws iam create-access-key --user-name github-actions-deployer
```

생성된 액세스 키를 GitHub Secrets에 추가하세요.

## 배포 워크플로우

### 자동 배포 트리거

다음 경우에 자동으로 배포가 실행됩니다:
- `main` 또는 `master` 브랜치에 푸시
- GitHub Actions 탭에서 수동 실행 (workflow_dispatch)

### 배포 프로세스

1. **코드 체크아웃**: 최신 코드를 가져옵니다
2. **AWS 인증**: GitHub Secrets의 자격 증명으로 AWS에 로그인
3. **ECR 로그인**: Docker 이미지를 푸시하기 위해 ECR에 로그인
4. **이미지 빌드**: Docker 이미지를 빌드하고 태그를 지정
5. **이미지 푸시**: ECR에 이미지를 푸시 (commit SHA와 latest 태그)
6. **태스크 정의 업데이트**: 새 이미지로 ECS 태스크 정의 업데이트
7. **서비스 배포**: ECS 서비스를 새 태스크 정의로 업데이트
8. **안정성 대기**: 배포가 완료되고 서비스가 안정될 때까지 대기

### 배포 모니터링

GitHub Actions 탭에서 배포 진행 상황을 실시간으로 확인할 수 있습니다:
- 각 단계의 로그 확인
- 빌드 시간 및 배포 시간 확인
- 실패 시 에러 메시지 확인

## 수동 배포

필요한 경우 로컬에서 수동으로 배포할 수 있습니다:

```bash
./deploy.sh
```

## 롤백

문제가 발생한 경우 이전 버전으로 롤백:

```bash
# 이전 태스크 정의 버전 확인
aws ecs list-task-definitions --family-prefix ec2-session-manager --region ap-northeast-2

# 특정 버전으로 롤백
aws ecs update-service \
  --cluster ec2-session-manager-cluster \
  --service ec2-session-manager-service \
  --task-definition ec2-session-manager:VERSION_NUMBER \
  --region ap-northeast-2
```

## 브랜치 전략

### 권장 브랜치 전략

- `main` / `master`: 프로덕션 환경 (자동 배포)
- `develop`: 개발 환경 (선택사항)
- `feature/*`: 기능 개발 브랜치

### 개발 환경 추가 (선택사항)

개발 환경을 추가하려면 `.github/workflows/deploy-dev.yml`을 생성하고 `develop` 브랜치에 대한 배포를 설정하세요.

## 트러블슈팅

### 배포 실패 시

1. GitHub Actions 로그 확인
2. AWS ECS 서비스 이벤트 확인:
   ```bash
   aws ecs describe-services \
     --cluster ec2-session-manager-cluster \
     --services ec2-session-manager-service \
     --region ap-northeast-2
   ```
3. CloudWatch 로그 확인:
   ```bash
   aws logs tail /ecs/ec2-session-manager --follow --region ap-northeast-2
   ```

### 권한 오류

IAM 사용자에게 필요한 권한이 있는지 확인하세요. 특히 `iam:PassRole` 권한이 중요합니다.

### 이미지 빌드 실패

로컬에서 Docker 빌드를 테스트해보세요:
```bash
docker build --platform linux/amd64 -t test:latest .
```

## 보안 고려사항

- AWS 자격 증명을 절대 코드에 커밋하지 마세요
- GitHub Secrets를 사용하여 민감한 정보를 관리하세요
- CI/CD 전용 IAM 사용자는 최소 권한 원칙을 따르세요
- 정기적으로 액세스 키를 로테이션하세요
