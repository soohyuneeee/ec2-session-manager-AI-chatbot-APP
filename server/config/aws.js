const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { SSMClient } = require('@aws-sdk/client-ssm');
const { EC2Client } = require('@aws-sdk/client-ec2');
const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
const { fromEnv } = require('@aws-sdk/credential-providers');
const { getAccountCredentials } = require('./accounts');
require('dotenv').config();

// 크로스 어카운트 자격 증명 캐시
let crossAccountCredentials = null;
let credentialsExpiry = null;

// STS 클라이언트 (역할 assume을 위해)
const stsClient = new STSClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: fromEnv()
});

// 크로스 어카운트 역할 assume 함수
async function assumeCrossAccountRole() {
  try {
    const roleArn = process.env.CROSS_ACCOUNT_ROLE_ARN;
    if (!roleArn || roleArn.includes('TARGET_ACCOUNT_ID')) {
      return null;
    }

    // 자격 증명이 유효한지 확인 (만료 5분 전에 갱신)
    if (crossAccountCredentials && credentialsExpiry && 
        new Date() < new Date(credentialsExpiry.getTime() - 5 * 60 * 1000)) {
      return crossAccountCredentials;
    }

    const assumeRoleParams = {
      RoleArn: roleArn,
      RoleSessionName: process.env.CROSS_ACCOUNT_SESSION_NAME || 'ec2-session-manager-cross-account',
      DurationSeconds: 3600 // 1시간
    };

    // External ID가 설정된 경우 추가
    if (process.env.CROSS_ACCOUNT_EXTERNAL_ID) {
      assumeRoleParams.ExternalId = process.env.CROSS_ACCOUNT_EXTERNAL_ID;
    }

    const command = new AssumeRoleCommand(assumeRoleParams);
    const result = await stsClient.send(command);
    
    crossAccountCredentials = {
      accessKeyId: result.Credentials.AccessKeyId,
      secretAccessKey: result.Credentials.SecretAccessKey,
      sessionToken: result.Credentials.SessionToken
    };
    
    credentialsExpiry = result.Credentials.Expiration;
    
    return crossAccountCredentials;
  } catch (error) {
    console.error('❌ 크로스 어카운트 역할 assume 실패:', error.message);
    throw error;
  }
}

// 크로스 어카운트 자격 증명으로 AWS 클라이언트 생성 함수
async function createCrossAccountClient(ClientClass, options = {}) {
  try {
    const credentials = await assumeCrossAccountRole();
    
    if (!credentials) {
      // 크로스 어카운트 역할이 설정되지 않은 경우 기본 자격 증명 사용
      return new ClientClass({
        region: process.env.AWS_REGION || 'ap-northeast-2',
        credentials: fromEnv(),
        ...options
      });
    }

    return new ClientClass({
      region: process.env.AWS_REGION || 'ap-northeast-2',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken
      },
      ...options
    });
  } catch (error) {
    console.error('❌ 크로스 어카운트 클라이언트 생성 실패:', error.message);
    // 실패 시 기본 자격 증명으로 fallback
    return new ClientClass({
      region: process.env.AWS_REGION || 'ap-northeast-2',
      credentials: fromEnv(),
      ...options
    });
  }
}

// SSM 클라이언트 (크로스 어카운트)
let ssmClient = null;

// EC2 클라이언트들 (여러 리전 지원, 크로스 어카운트)
const ec2Clients = {};

// Bedrock 클라이언트 (기본 자격 증명 사용)
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
  credentials: fromEnv()
});

// 크로스 어카운트 SSM 클라이언트 가져오기
async function getSSMClient(accountId = null, externalId = null) {
  // 계정 ID가 지정된 경우 해당 계정의 자격 증명 사용
  if (accountId) {
    console.log(`🔐 계정 ${accountId}의 SSM 클라이언트 생성 중...`);
    const credentials = await getAccountCredentials(accountId, externalId);
    console.log(`✅ 계정 ${accountId}의 자격 증명 획득 완료`);
    return new SSMClient({
      region: process.env.AWS_REGION || 'ap-northeast-2',
      credentials
    });
  }
  
  // 기본 동작 (레거시 호환)
  console.log(`🔐 기본 계정의 SSM 클라이언트 사용`);
  if (!ssmClient) {
    ssmClient = await createCrossAccountClient(SSMClient);
  }
  return ssmClient;
}

// 크로스 어카운트 EC2 클라이언트 가져오기
async function getEC2Client(region = null) {
  const targetRegion = region || process.env.AWS_REGION || 'ap-northeast-2';
  
  if (!ec2Clients[targetRegion]) {
    ec2Clients[targetRegion] = await createCrossAccountClient(EC2Client, { region: targetRegion });
  }
  
  return ec2Clients[targetRegion];
}

// 자격 증명 갱신 함수 (주기적 호출용)
async function refreshCredentials() {
  try {
    crossAccountCredentials = null;
    credentialsExpiry = null;
    ssmClient = null;
    // EC2 클라이언트들도 초기화
    Object.keys(ec2Clients).forEach(region => {
      delete ec2Clients[region];
    });
    
    await assumeCrossAccountRole();
  } catch (error) {
    console.error('❌ 자격 증명 갱신 실패:', error.message);
  }
}

// AWS CLI 프로파일 설정 함수
async function setupAWSProfile() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  
  try {
    const roleArn = process.env.CROSS_ACCOUNT_ROLE_ARN;
    if (!roleArn || roleArn.includes('TARGET_ACCOUNT_ID')) {
      return;
    }

    const awsDir = path.join(os.homedir(), '.aws');
    const configPath = path.join(awsDir, 'config');
    
    // .aws 디렉토리 생성
    if (!fs.existsSync(awsDir)) {
      fs.mkdirSync(awsDir, { recursive: true });
    }

    // AWS CLI 설정 파일 내용
    let configContent = '';
    
    // 기존 설정 파일이 있으면 읽기
    if (fs.existsSync(configPath)) {
      configContent = fs.readFileSync(configPath, 'utf8');
    }

    // SaltwareCrossAccount 프로파일이 없으면 추가
    if (!configContent.includes('[profile SaltwareCrossAccount]')) {
      const crossAccountConfig = `
[profile SaltwareCrossAccount]
region = ${process.env.AWS_REGION || 'ap-northeast-2'}
role_arn = ${roleArn}
source_profile = default
role_session_name = ${process.env.CROSS_ACCOUNT_SESSION_NAME || 'ec2-session-manager-cross-account'}
${process.env.CROSS_ACCOUNT_EXTERNAL_ID ? `external_id = ${process.env.CROSS_ACCOUNT_EXTERNAL_ID}` : ''}
`;

      configContent += crossAccountConfig;
      fs.writeFileSync(configPath, configContent);
      console.log('✅ AWS CLI 프로파일 설정 완료');
    }

    // credentials 파일도 확인
    const credentialsPath = path.join(awsDir, 'credentials');
    let credentialsContent = '';
    
    if (fs.existsSync(credentialsPath)) {
      credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
    }

    // default 프로파일이 없으면 추가
    if (!credentialsContent.includes('[default]')) {
      const defaultCredentials = `
[default]
aws_access_key_id = ${process.env.AWS_ACCESS_KEY_ID}
aws_secret_access_key = ${process.env.AWS_SECRET_ACCESS_KEY}
`;

      credentialsContent += defaultCredentials;
      fs.writeFileSync(credentialsPath, credentialsContent);
    }

  } catch (error) {
    console.error('❌ AWS CLI 프로파일 설정 실패:', error.message);
  }
}

// 서버 시작 시 AWS 프로파일 설정
setupAWSProfile();

// 30분마다 자격 증명 갱신
setInterval(refreshCredentials, 30 * 60 * 1000);

module.exports = {
  stsClient,
  getSSMClient,
  getEC2Client,
  bedrockClient,
  assumeCrossAccountRole,
  refreshCredentials,
  setupAWSProfile,
  // 하위 호환성을 위해 유지
  ec2Clients
};