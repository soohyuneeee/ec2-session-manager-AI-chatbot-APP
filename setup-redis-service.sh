#!/bin/bash

# Redis 전용 ECS 서비스 설정 스크립트
set -e

AWS_REGION="ap-northeast-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_NAME="ec2-session-manager-cluster"
REDIS_SERVICE_NAME="ec2-session-manager-redis"
REDIS_TASK_FAMILY="ec2-session-manager-redis"

echo "🔴 Redis 전용 ECS 서비스 설정 시작..."
echo "📍 AWS Account: $AWS_ACCOUNT_ID"
echo "📍 Region: $AWS_REGION"

# 1. VPC 및 서브넷 정보 가져오기
echo ""
echo "🔍 VPC 정보 조회 중..."
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)

if [ -z "$DEFAULT_VPC" ] || [ "$DEFAULT_VPC" = "None" ]; then
    DEFAULT_VPC=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)
fi

SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$DEFAULT_VPC" --query 'Subnets[*].SubnetId' --output text --region $AWS_REGION)
SUBNET_1=$(echo $SUBNETS | awk '{print $1}')
SUBNET_2=$(echo $SUBNETS | awk '{print $2}')

echo "✅ VPC: $DEFAULT_VPC"
echo "✅ Subnets: $SUBNET_1, $SUBNET_2"

# 2. 보안 그룹 가져오기
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=ec2-session-manager-sg" \
    --query 'SecurityGroups[0].GroupId' \
    --output text \
    --region $AWS_REGION)

echo "✅ Security Group: $SG_ID"

# 3. CloudWatch 로그 그룹 생성
echo ""
echo "📊 CloudWatch 로그 그룹 생성 중..."
aws logs create-log-group \
    --log-group-name /ecs/ec2-session-manager-redis \
    --region $AWS_REGION 2>/dev/null || echo "✅ 로그 그룹 이미 존재함"

aws logs put-retention-policy \
    --log-group-name /ecs/ec2-session-manager-redis \
    --retention-in-days 7 \
    --region $AWS_REGION

# 4. Service Discovery 네임스페이스 생성
echo ""
echo "🌐 Service Discovery 네임스페이스 생성 중..."
NAMESPACE_ID=$(aws servicediscovery list-namespaces \
    --filters Name=TYPE,Values=DNS_PRIVATE \
    --query "Namespaces[?Name=='ec2-session-manager.local'].Id | [0]" \
    --output text \
    --region $AWS_REGION)

if [ -z "$NAMESPACE_ID" ] || [ "$NAMESPACE_ID" = "None" ]; then
    NAMESPACE_ID=$(aws servicediscovery create-private-dns-namespace \
        --name ec2-session-manager.local \
        --vpc $DEFAULT_VPC \
        --region $AWS_REGION \
        --query 'OperationId' \
        --output text)
    
    echo "⏳ 네임스페이스 생성 대기 중..."
    sleep 10
    
    NAMESPACE_ID=$(aws servicediscovery list-namespaces \
        --filters Name=TYPE,Values=DNS_PRIVATE \
        --query "Namespaces[?Name=='ec2-session-manager.local'].Id | [0]" \
        --output text \
        --region $AWS_REGION)
fi

echo "✅ Namespace ID: $NAMESPACE_ID"

# 5. Service Discovery 서비스 생성
echo ""
echo "🔍 Service Discovery 서비스 생성 중..."
SERVICE_DISCOVERY_ID=$(aws servicediscovery list-services \
    --filters Name=NAMESPACE_ID,Values=$NAMESPACE_ID \
    --query "Services[?Name=='redis'].Id | [0]" \
    --output text \
    --region $AWS_REGION)

if [ -z "$SERVICE_DISCOVERY_ID" ] || [ "$SERVICE_DISCOVERY_ID" = "None" ]; then
    SERVICE_DISCOVERY_ID=$(aws servicediscovery create-service \
        --name redis \
        --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=10}]" \
        --health-check-custom-config FailureThreshold=1 \
        --region $AWS_REGION \
        --query 'Service.Id' \
        --output text)
fi

echo "✅ Service Discovery ID: $SERVICE_DISCOVERY_ID"

# 6. Redis 태스크 정의 등록
echo ""
echo "📝 Redis 태스크 정의 등록 중..."
sed "s/YOUR_ACCOUNT_ID/$AWS_ACCOUNT_ID/g" ecs-task-definition-redis.json > ecs-task-definition-redis-updated.json

REDIS_TASK_ARN=$(aws ecs register-task-definition \
    --cli-input-json file://ecs-task-definition-redis-updated.json \
    --region $AWS_REGION \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

echo "✅ Redis 태스크 정의: $REDIS_TASK_ARN"

# 7. Redis ECS 서비스 생성
echo ""
echo "🚀 Redis ECS 서비스 생성 중..."
aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $REDIS_SERVICE_NAME \
    --task-definition $REDIS_TASK_FAMILY \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --service-registries "registryArn=arn:aws:servicediscovery:$AWS_REGION:$AWS_ACCOUNT_ID:service/$SERVICE_DISCOVERY_ID" \
    --region $AWS_REGION 2>/dev/null || echo "✅ Redis 서비스 이미 존재함"

# 정리
rm -f ecs-task-definition-redis-updated.json

echo ""
echo "✅ Redis 서비스 설정 완료!"
echo ""
echo "📊 Redis 연결 정보:"
echo "  Host: redis.ec2-session-manager.local"
echo "  Port: 6379"
echo ""
echo "📝 다음 단계:"
echo "1. App 서비스 업데이트:"
echo "   ./deploy-app-service.sh"
