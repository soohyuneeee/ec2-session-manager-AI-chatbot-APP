#!/bin/bash

# EC2 Session Manager ECS 배포 스크립트
set -e

# 설정
AWS_REGION="ap-northeast-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY="ec2-session-manager"
IMAGE_TAG="${1:-latest}"
ECS_CLUSTER="ec2-session-manager-cluster"
ECS_SERVICE="ec2-session-manager-service"
TASK_FAMILY="ec2-session-manager"

echo "🚀 EC2 Session Manager 배포 시작..."
echo "📍 AWS Account: $AWS_ACCOUNT_ID"
echo "📍 Region: $AWS_REGION"
echo "📍 Image Tag: $IMAGE_TAG"

# 1. ECR 로그인
echo ""
echo "🔐 ECR 로그인 중..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 2. ECR 리포지토리 생성 (없으면)
echo ""
echo "📦 ECR 리포지토리 확인 중..."
if ! aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION 2>/dev/null; then
    echo "📦 ECR 리포지토리 생성 중..."
    aws ecr create-repository \
        --repository-name $ECR_REPOSITORY \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256
    echo "✅ ECR 리포지토리 생성 완료"
else
    echo "✅ ECR 리포지토리 존재함"
fi

# 3. Docker 이미지 빌드
echo ""
echo "🔨 Docker 이미지 빌드 중 (linux/amd64)..."
docker buildx build --platform linux/amd64 -t $ECR_REPOSITORY:$IMAGE_TAG --load .

# 4. Docker 이미지 태그
echo ""
echo "🏷️  Docker 이미지 태그 중..."
docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

# 5. Docker 이미지 푸시
echo ""
echo "📤 Docker 이미지 푸시 중..."
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

# 6. ECS 태스크 정의 업데이트
echo ""
echo "📝 ECS 태스크 정의 업데이트 중..."

# task definition JSON 파일에서 YOUR_ACCOUNT_ID 치환
sed "s/YOUR_ACCOUNT_ID/$AWS_ACCOUNT_ID/g" ecs-task-definition.json > ecs-task-definition-updated.json

# 태스크 정의 등록
TASK_DEFINITION_ARN=$(aws ecs register-task-definition \
    --cli-input-json file://ecs-task-definition-updated.json \
    --region $AWS_REGION \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

echo "✅ 태스크 정의 등록 완료: $TASK_DEFINITION_ARN"

# 7. ECS 서비스 업데이트 (서비스가 있으면)
echo ""
echo "🔄 ECS 서비스 업데이트 중..."
if aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION 2>/dev/null | grep -q "ACTIVE"; then
    aws ecs update-service \
        --cluster $ECS_CLUSTER \
        --service $ECS_SERVICE \
        --task-definition $TASK_DEFINITION_ARN \
        --force-new-deployment \
        --region $AWS_REGION
    echo "✅ ECS 서비스 업데이트 완료"
else
    echo "⚠️  ECS 서비스가 없습니다. setup-infrastructure.sh를 먼저 실행하세요."
fi

# 정리
rm -f ecs-task-definition-updated.json

echo ""
echo "✅ 배포 완료!"
echo ""
echo "📊 배포 상태 확인:"
echo "aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION"
echo ""
echo "📋 로그 확인:"
echo "aws logs tail /ecs/ec2-session-manager --follow --region $AWS_REGION"
