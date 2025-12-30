#!/bin/bash

# Redis와 App을 별도 서비스로 분리하는 스크립트
# Redis는 한 번만 배포하고, App만 업데이트

set -e

REGION="ap-northeast-2"
CLUSTER_NAME="ec2-session-manager-cluster"

# 기존 ECS 서비스에서 VPC와 서브넷 정보 가져오기
echo "🔍 기존 서비스 정보 조회 중..."
EXISTING_SERVICE_CONFIG=$(aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services ec2-session-manager-service \
  --region $REGION \
  --query "services[0].networkConfiguration.awsvpcConfiguration" \
  --output json 2>/dev/null || echo "{}")

if [ "$EXISTING_SERVICE_CONFIG" != "{}" ]; then
  VPC_ID=$(aws ec2 describe-subnets \
    --subnet-ids $(echo $EXISTING_SERVICE_CONFIG | jq -r '.subnets[0]') \
    --region $REGION \
    --query "Subnets[0].VpcId" --output text)
  SUBNETS=$(echo $EXISTING_SERVICE_CONFIG | jq -r '.subnets | join(",")')
  EXISTING_SG=$(echo $EXISTING_SERVICE_CONFIG | jq -r '.securityGroups[0]')
else
  # 기존 서비스가 없으면 기본 VPC 사용
  VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region $REGION)
  SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text --region $REGION | tr '\t' ',')
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🚀 Redis와 App 서비스 분리 설정 시작..."
echo "VPC: $VPC_ID"
echo "Subnets: $SUBNETS"
echo "Account: $ACCOUNT_ID"

# 1. Cloud Map 네임스페이스 생성 (서비스 디스커버리용)
echo "📡 Cloud Map 네임스페이스 생성 중..."
NAMESPACE_ID=$(aws servicediscovery list-namespaces --query "Namespaces[?Name=='ec2-session-manager.local'].Id" --output text --region $REGION)

if [ -z "$NAMESPACE_ID" ] || [ "$NAMESPACE_ID" == "None" ]; then
  OPERATION_ID=$(aws servicediscovery create-private-dns-namespace \
    --name ec2-session-manager.local \
    --vpc $VPC_ID \
    --region $REGION \
    --query "OperationId" --output text)
  
  echo "⏳ 네임스페이스 생성 대기 중 (Operation ID: $OPERATION_ID)..."
  
  # 작업 완료 대기 (최대 2분)
  for i in {1..24}; do
    STATUS=$(aws servicediscovery get-operation \
      --operation-id $OPERATION_ID \
      --region $REGION \
      --query "Operation.Status" --output text 2>/dev/null || echo "PENDING")
    
    if [ "$STATUS" == "SUCCESS" ]; then
      echo "✅ 네임스페이스 생성 완료"
      break
    elif [ "$STATUS" == "FAIL" ]; then
      echo "❌ 네임스페이스 생성 실패"
      exit 1
    fi
    
    echo "   대기 중... ($i/24) - 상태: $STATUS"
    sleep 5
  done
  
  # 네임스페이스 ID 다시 조회
  NAMESPACE_ID=$(aws servicediscovery list-namespaces --query "Namespaces[?Name=='ec2-session-manager.local'].Id" --output text --region $REGION)
fi

if [ -z "$NAMESPACE_ID" ] || [ "$NAMESPACE_ID" == "None" ]; then
  echo "❌ 네임스페이스 ID를 가져올 수 없습니다"
  exit 1
fi

echo "✅ 네임스페이스 ID: $NAMESPACE_ID"

# 2. Redis 서비스 디스커버리 생성
echo "🔍 Redis 서비스 디스커버리 생성 중..."
REDIS_SERVICE_ID=$(aws servicediscovery list-services --query "Services[?Name=='redis'].Id" --output text --region $REGION)

if [ -z "$REDIS_SERVICE_ID" ]; then
  REDIS_SERVICE_ID=$(aws servicediscovery create-service \
    --name redis \
    --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
    --health-check-custom-config FailureThreshold=1 \
    --region $REGION \
    --query "Service.Id" --output text)
fi

echo "✅ Redis 서비스 디스커버리 ID: $REDIS_SERVICE_ID"

# 3. 보안 그룹 생성 (Redis용)
echo "🔒 Redis 보안 그룹 생성 중..."
REDIS_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=ec2-session-manager-redis-sg" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text --region $REGION 2>/dev/null || echo "")

if [ "$REDIS_SG_ID" == "None" ] || [ -z "$REDIS_SG_ID" ]; then
  REDIS_SG_ID=$(aws ec2 create-security-group \
    --group-name ec2-session-manager-redis-sg \
    --description "Security group for Redis service" \
    --vpc-id $VPC_ID \
    --region $REGION \
    --query "GroupId" --output text)
  
  # Redis 포트 허용 (같은 VPC 내에서만)
  aws ec2 authorize-security-group-ingress \
    --group-id $REDIS_SG_ID \
    --protocol tcp \
    --port 6379 \
    --source-group $REDIS_SG_ID \
    --region $REGION
fi

echo "✅ Redis 보안 그룹: $REDIS_SG_ID"

# 4. 보안 그룹 생성 (App용)
echo "🔒 App 보안 그룹 생성 중..."
APP_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=ec2-session-manager-app-sg" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" --output text --region $REGION 2>/dev/null || echo "")

if [ "$APP_SG_ID" == "None" ] || [ -z "$APP_SG_ID" ]; then
  APP_SG_ID=$(aws ec2 create-security-group \
    --group-name ec2-session-manager-app-sg \
    --description "Security group for App service" \
    --vpc-id $VPC_ID \
    --region $REGION \
    --query "GroupId" --output text)
  
  # HTTP 포트 허용
  aws ec2 authorize-security-group-ingress \
    --group-id $APP_SG_ID \
    --protocol tcp \
    --port 3003 \
    --cidr 0.0.0.0/0 \
    --region $REGION
  
  # Redis 접근 허용
  aws ec2 authorize-security-group-ingress \
    --group-id $APP_SG_ID \
    --protocol tcp \
    --port 6379 \
    --source-group $REDIS_SG_ID \
    --region $REGION
fi

echo "✅ App 보안 그룹: $APP_SG_ID"

# 5. Task Definition 업데이트 (Account ID 치환)
echo "📝 Task Definition 업데이트 중..."
sed "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" deployment/redis-task-definition.json > /tmp/redis-task-definition.json
sed "s/YOUR_ACCOUNT_ID/$ACCOUNT_ID/g" deployment/app-task-definition.json > /tmp/app-task-definition.json
sed -i.bak "s/REDIS_SERVICE_DISCOVERY_NAME/redis.ec2-session-manager.local/g" /tmp/app-task-definition.json

# 6. Redis Task Definition 등록
echo "📋 Redis Task Definition 등록 중..."
aws ecs register-task-definition \
  --cli-input-json file:///tmp/redis-task-definition.json \
  --region $REGION

# 7. App Task Definition 등록
echo "📋 App Task Definition 등록 중..."
aws ecs register-task-definition \
  --cli-input-json file:///tmp/app-task-definition.json \
  --region $REGION

# 8. Redis 서비스 생성 (한 번만 실행, 업데이트 안 함)
echo "🚀 Redis 서비스 생성 중..."
REDIS_SERVICE_EXISTS=$(aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services ec2-session-manager-redis \
  --region $REGION \
  --query "services[0].status" --output text 2>/dev/null || echo "")

if [ "$REDIS_SERVICE_EXISTS" != "ACTIVE" ]; then
  aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name ec2-session-manager-redis \
    --task-definition ec2-session-manager-redis \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$REDIS_SG_ID],assignPublicIp=ENABLED}" \
    --service-registries "registryArn=arn:aws:servicediscovery:$REGION:$ACCOUNT_ID:service/$REDIS_SERVICE_ID" \
    --region $REGION
  
  echo "✅ Redis 서비스 생성 완료"
else
  echo "✅ Redis 서비스가 이미 실행 중입니다"
fi

# 9. App 서비스 생성/업데이트
echo "🚀 App 서비스 생성/업데이트 중..."
APP_SERVICE_EXISTS=$(aws ecs describe-services \
  --cluster $CLUSTER_NAME \
  --services ec2-session-manager-app \
  --region $REGION \
  --query "services[0].status" --output text 2>/dev/null || echo "")

if [ "$APP_SERVICE_EXISTS" != "ACTIVE" ]; then
  # 서비스 생성
  aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name ec2-session-manager-app \
    --task-definition ec2-session-manager-app \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$APP_SG_ID,$REDIS_SG_ID],assignPublicIp=ENABLED}" \
    --region $REGION
  
  echo "✅ App 서비스 생성 완료"
else
  # 서비스 업데이트 (배포 시 이것만 실행됨)
  aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service ec2-session-manager-app \
    --task-definition ec2-session-manager-app \
    --force-new-deployment \
    --region $REGION
  
  echo "✅ App 서비스 업데이트 완료"
fi

echo ""
echo "✅ 설정 완료!"
echo ""
echo "📝 다음 단계:"
echo "1. ALB를 ec2-session-manager-app 서비스에 연결"
echo "2. GitHub Actions에서 app-task-definition.json만 업데이트하도록 수정"
echo "3. Redis는 한 번만 배포되고, App만 업데이트됩니다"
echo ""
echo "🔍 Redis 접속 주소: redis.ec2-session-manager.local:6379"
