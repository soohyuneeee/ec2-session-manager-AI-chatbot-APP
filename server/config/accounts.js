// 멀티 계정 관리 모듈
const { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
const { fromEnv } = require('@aws-sdk/credential-providers');
require('dotenv').config();

// 기본 STS 클라이언트 (env의 액세스키 사용)
const baseStsClient = new STSClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: fromEnv()
});

// 계정별 자격 증명 캐시
const accountCredentialsCache = new Map();

// 기본 계정 정보 캐시
let baseAccountInfo = null;

/**
 * 기본 계정 정보 조회
 */
async function getBaseAccountInfo() {
  if (baseAccountInfo) {
    return baseAccountInfo;
  }

  try {
    const command = new GetCallerIdentityCommand({});
    const result = await baseStsClient.send(command);
    
    baseAccountInfo = {
      accountId: result.Account,
      arn: result.Arn,
      userId: result.UserId,
      isBase: true
    };
    
    console.log(`✅ 기본 계정: ${baseAccountInfo.accountId}`);
    return baseAccountInfo;
  } catch (error) {
    console.error('❌ 기본 계정 정보 조회 실패:', error.message);
    throw error;
  }
}

/**
 * 대상 계정의 SaltwareCrossAccount Role Assume
 * @param {string} targetAccountId - 대상 계정 ID
 * @param {string} externalId - External ID (선택사항)
 * @returns {Object} 임시 자격 증명
 */
async function assumeAccountRole(targetAccountId, externalId = null) {
  try {
    // 캐시 확인 (만료 5분 전에 갱신)
    const cacheKey = `${targetAccountId}:${externalId || 'none'}`;
    const cached = accountCredentialsCache.get(cacheKey);
    
    if (cached && cached.expiry && new Date() < new Date(cached.expiry.getTime() - 5 * 60 * 1000)) {
      return cached.credentials;
    }

    // Role ARN 생성
    const roleArn = `arn:aws:iam::${targetAccountId}:role/SaltwareCrossAccount`;
    
    const assumeRoleParams = {
      RoleArn: roleArn,
      RoleSessionName: `saltware-session-${Date.now()}`,
      DurationSeconds: 3600 // 1시간
    };

    // External ID가 있으면 추가
    if (externalId) {
      assumeRoleParams.ExternalId = externalId;
    }

    console.log(`🔄 계정 전환 시도: ${targetAccountId}`);
    
    const command = new AssumeRoleCommand(assumeRoleParams);
    const result = await baseStsClient.send(command);
    
    const credentials = {
      accessKeyId: result.Credentials.AccessKeyId,
      secretAccessKey: result.Credentials.SecretAccessKey,
      sessionToken: result.Credentials.SessionToken
    };
    
    // 캐시 저장
    accountCredentialsCache.set(cacheKey, {
      credentials,
      expiry: result.Credentials.Expiration,
      accountId: targetAccountId
    });
    
    console.log(`✅ 계정 전환 성공: ${targetAccountId}`);
    return credentials;
  } catch (error) {
    console.error(`❌ 계정 전환 실패 (${targetAccountId}):`, error.message);
    throw error;
  }
}

/**
 * 계정 목록 조회 (환경 변수에서)
 * @returns {Array} 계정 목록
 */
function getAccountList() {
  const accountsEnv = process.env.TARGET_ACCOUNTS;
  
  if (!accountsEnv) {
    return [];
  }

  try {
    // JSON 형식: [{"id":"123456789012","name":"Production","externalId":"xxx"},...]
    const accounts = JSON.parse(accountsEnv);
    return accounts.map(acc => ({
      accountId: acc.id,
      accountName: acc.name || acc.id,
      externalId: acc.externalId || null,
      roleArn: `arn:aws:iam::${acc.id}:role/SaltwareCrossAccount`
    }));
  } catch (error) {
    console.error('❌ 계정 목록 파싱 실패:', error.message);
    return [];
  }
}

/**
 * 특정 계정의 자격 증명 가져오기
 * @param {string} accountId - 계정 ID (null이면 기본 계정)
 * @param {string} externalId - External ID
 * @returns {Object} 자격 증명
 */
async function getAccountCredentials(accountId = null, externalId = null) {
  // 기본 계정 사용
  if (!accountId) {
    console.log(`🔑 기본 계정 자격 증명 사용`);
    return fromEnv();
  }

  // 기본 계정 ID와 같으면 기본 자격 증명 사용
  const baseAccount = await getBaseAccountInfo();
  if (accountId === baseAccount.accountId) {
    console.log(`🔑 기본 계정 (${accountId}) 자격 증명 사용`);
    return fromEnv();
  }

  // 다른 계정이면 Switch Role
  console.log(`🔄 계정 ${accountId}로 Switch Role 시도...`);
  const credentials = await assumeAccountRole(accountId, externalId);
  console.log(`✅ 계정 ${accountId}로 Switch Role 성공`);
  return credentials;
}

/**
 * 캐시 초기화
 */
function clearCache() {
  accountCredentialsCache.clear();
  baseAccountInfo = null;
  console.log('🔄 계정 자격 증명 캐시 초기화');
}

// 30분마다 만료된 캐시 정리
setInterval(() => {
  const now = new Date();
  for (const [key, value] of accountCredentialsCache.entries()) {
    if (value.expiry && now >= value.expiry) {
      accountCredentialsCache.delete(key);
      console.log(`🗑️ 만료된 캐시 삭제: ${key}`);
    }
  }
}, 30 * 60 * 1000);

module.exports = {
  getBaseAccountInfo,
  assumeAccountRole,
  getAccountList,
  getAccountCredentials,
  clearCache
};
