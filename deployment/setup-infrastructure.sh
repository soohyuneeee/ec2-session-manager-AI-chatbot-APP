#!/bin/bash

# ECS 인프라 설정 스크립트
set -e

AWS_REGION="ap-northeast-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_NAME="ec2-session-manager-cluster"
SERVICE_NAME="ec2-session-manager-service"
TASK_FAMILY="ec2-session-manager"
DOMAIN_NAME="${1:-}"  # 첫 번째 인자로 도메인 받기

echo "🏗️  ECS 인프라 설정 시작..."
echo "📍 AWS Account: $AWS_ACCOUNT_ID"
echo "📍 Region: $AWS_REGION"

# 1. VPC 및 서브넷 정보 가져오기
echo ""
echo "🔍 VPC 정보 조회 중..."
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)

# VPC가 없으면 첫 번째 VPC 사용
if [ -z "$DEFAULT_VPC" ] || [ "$DEFAULT_VPC" = "None" ]; then
    echo "⚠️  기본 VPC를 찾을 수 없습니다. 첫 번째 VPC를 사용합니다..."
    DEFAULT_VPC=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)
fi

if [ -z "$DEFAULT_VPC" ] || [ "$DEFAULT_VPC" = "None" ]; then
    echo "❌ VPC를 찾을 수 없습니다. VPC를 먼저 생성하세요."
    exit 1
fi

echo "✅ VPC: $DEFAULT_VPC"

SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$DEFAULT_VPC" --query 'Subnets[*].SubnetId' --output text --region $AWS_REGION)
SUBNET_1=$(echo $SUBNETS | awk '{print $1}')
SUBNET_2=$(echo $SUBNETS | awk '{print $2}')

if [ -z "$SUBNET_1" ] || [ -z "$SUBNET_2" ]; then
    echo "❌ 최소 2개의 서브넷이 필요합니다."
    exit 1
fi

echo "✅ Subnets: $SUBNET_1, $SUBNET_2"

# 2. 보안 그룹 생성
echo ""
echo "🔒 보안 그룹 생성 중..."
SG_ID=$(aws ec2 create-security-group \
    --group-name ec2-session-manager-sg \
    --description "Security group for EC2 Session Manager" \
    --vpc-id $DEFAULT_VPC \
    --region $AWS_REGION \
    --query 'GroupId' \
    --output text 2>/dev/null || \
    aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=ec2-session-manager-sg" \
        --query 'SecurityGroups[0].GroupId' \
        --output text \
        --region $AWS_REGION)

echo "✅ Security Group: $SG_ID"

# HTTP/HTTPS 인바운드 규칙 추가
aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION 2>/dev/null || echo "  (80 포트 규칙 이미 존재)"

aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION 2>/dev/null || echo "  (443 포트 규칙 이미 존재)"

aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port 3003 \
    --cidr 0.0.0.0/0 \
    --region $AWS_REGION 2>/dev/null || echo "  (3003 포트 규칙 이미 존재)"

# 3. CloudWatch 로그 그룹 생성
echo ""
echo "📊 CloudWatch 로그 그룹 생성 중..."
aws logs create-log-group \
    --log-group-name /ecs/ec2-session-manager \
    --region $AWS_REGION 2>/dev/null || echo "✅ 로그 그룹 이미 존재함"

aws logs put-retention-policy \
    --log-group-name /ecs/ec2-session-manager \
    --retention-in-days 7 \
    --region $AWS_REGION

echo "✅ CloudWatch 로그 그룹 설정 완료"

# 4. IAM 역할 생성 (ECS Task Execution Role)
echo ""
echo "👤 IAM 역할 생성 중..."

# Task Execution Role
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
    --role-name ecsTaskExecutionRole \
    --assume-role-policy-document file://trust-policy.json 2>/dev/null || echo "  (ecsTaskExecutionRole 이미 존재)"

aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>/dev/null || true

# Secrets Manager 접근 권한 추가
cat > secrets-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:$AWS_REGION:$AWS_ACCOUNT_ID:secret:ec2-session-manager/*"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-name SecretsManagerAccess \
    --policy-document file://secrets-policy.json

echo "✅ ecsTaskExecutionRole 설정 완료"

# Task Role (애플리케이션이 사용)
aws iam create-role \
    --role-name ecsTaskRole \
    --assume-role-policy-document file://trust-policy.json 2>/dev/null || echo "  (ecsTaskRole 이미 존재)"

# EC2, SSM, Bedrock 권한 추가
cat > task-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeRegions",
        "ssm:StartSession",
        "ssm:TerminateSession",
        "ssm:DescribeSessions",
        "sts:AssumeRole",
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "logs:DescribeLogGroups",
        "logs:StartQuery",
        "logs:GetQueryResults",
        "cloudwatch:GetMetricData"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
    --role-name ecsTaskRole \
    --policy-name EC2SessionManagerPolicy \
    --policy-document file://task-policy.json

echo "✅ ecsTaskRole 설정 완료"

# 정리
rm -f trust-policy.json secrets-policy.json task-policy.json

# 5. ECS 클러스터 생성
echo ""
echo "🎯 ECS 클러스터 생성 중..."
aws ecs create-cluster \
    --cluster-name $CLUSTER_NAME \
    --region $AWS_REGION 2>/dev/null || echo "✅ 클러스터 이미 존재함"

# 6. Application Load Balancer 생성
echo ""
echo "⚖️  Application Load Balancer 생성 중..."
ALB_ARN=$(aws elbv2 create-load-balancer \
    --name ec2-session-manager-alb \
    --subnets $SUBNET_1 $SUBNET_2 \
    --security-groups $SG_ID \
    --region $AWS_REGION \
    --query 'LoadBalancers[0].LoadBalancerArn' \
    --output text 2>/dev/null || \
    aws elbv2 describe-load-balancers \
        --names ec2-session-manager-alb \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text \
        --region $AWS_REGION)

echo "✅ ALB: $ALB_ARN"

ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' \
    --output text \
    --region $AWS_REGION)

echo "✅ ALB DNS: $ALB_DNS"

# 7. Target Group 생성
echo ""
echo "🎯 Target Group 생성 중..."
TG_ARN=$(aws elbv2 create-target-group \
    --name ec2-session-manager-tg \
    --protocol HTTP \
    --port 3003 \
    --vpc-id $DEFAULT_VPC \
    --target-type ip \
    --health-check-path /api/redis/status \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 5 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region $AWS_REGION \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text 2>/dev/null || \
    aws elbv2 describe-target-groups \
        --names ec2-session-manager-tg \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text \
        --region $AWS_REGION)

echo "✅ Target Group: $TG_ARN"

# 8. ALB Listener 생성
echo ""
echo "👂 ALB Listener 생성 중..."
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN \
    --region $AWS_REGION 2>/dev/null || echo "✅ Listener 이미 존재함"

# 9. ECS 서비스 생성
echo ""
echo "🚀 ECS 서비스 생성 중..."
aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --task-definition $TASK_FAMILY \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=app,containerPort=3003" \
    --region $AWS_REGION 2>/dev/null || echo "✅ 서비스 이미 존재함"

echo ""
echo "✅ 인프라 설정 완료!"
echo ""
echo "📊 접속 정보:"
echo "  ALB DNS: http://$ALB_DNS"
echo ""

# Route53 설정 (도메인이 제공된 경우)
if [ -n "$DOMAIN_NAME" ]; then
    echo "🌐 Route53 설정 중..."
    
    # 도메인에서 루트 도메인 추출 (ssm.soohyuneeee.com -> soohyuneeee.com)
    ROOT_DOMAIN=$(echo $DOMAIN_NAME | awk -F. '{print $(NF-1)"."$NF}')
    echo "  루트 도메인: $ROOT_DOMAIN"
    
    # Hosted Zone ID 찾기 (첫 번째 매칭되는 것 사용)
    HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
        --query "HostedZones[?Name=='${ROOT_DOMAIN}.'].Id" \
        --output text | awk '{print $1}' | cut -d'/' -f3)
    
    if [ -n "$HOSTED_ZONE_ID" ] && [ "$HOSTED_ZONE_ID" != "None" ]; then
        echo "  Hosted Zone ID: $HOSTED_ZONE_ID"
        cat > route53-change.json <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "$DOMAIN_NAME",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query 'LoadBalancers[0].CanonicalHostedZoneId' --output text --region $AWS_REGION)",
          "DNSName": "$ALB_DNS",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
EOF
        
        aws route53 change-resource-record-sets \
            --hosted-zone-id $HOSTED_ZONE_ID \
            --change-batch file://route53-change.json
        
        rm -f route53-change.json
        
        echo "✅ Route53 레코드 생성 완료: $DOMAIN_NAME -> $ALB_DNS"
        echo ""
        echo "🌐 도메인 접속: http://$DOMAIN_NAME"
    else
        echo "⚠️  Hosted Zone을 찾을 수 없습니다: $DOMAIN_NAME"
        echo "   Route53에서 Hosted Zone을 먼저 생성하세요."
    fi
fi

echo ""
echo "📝 다음 단계:"
echo "1. Secrets Manager에 시크릿 생성:"
echo "   ./setup-secrets.sh"
echo ""
echo "2. 애플리케이션 배포:"
echo "   ./deploy.sh"
