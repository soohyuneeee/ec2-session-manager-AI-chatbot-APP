# 멀티 계정 설정 가이드

## 개요

여러 AWS 계정의 EC2 인스턴스에 접근하기 위한 Switch Role 기반 멀티 계정 설정 가이드입니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     기본 계정 (Base Account)                  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  IAM User (env의 액세스키 주인)                       │   │
│  │  - AWS_ACCESS_KEY_ID                                 │   │
│  │  - AWS_SECRET_ACCESS_KEY                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                    │
│                          │ AssumeRole                         │
│                          ▼                                    │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  계정 A      │  │  계정 B      │  │  계정 C      │
│              │  │              │  │              │
│  Role:       │  │  Role:       │  │  Role:       │
│  Saltware    │  │  Saltware    │  │  Saltware    │
│  CrossAccount│  │  CrossAccount│  │  CrossAccount│
│              │  │              │  │              │
│  신뢰관계:   │  │  신뢰관계:   │  │  신뢰관계:   │
│  기본 계정   │  │  기본 계정   │  │  기본 계정   │
└──────────────┘  └──────────────┘  └──────────────┘
```

## 전제 조건

1. **기본 계정**: IAM User의 액세스키가 `.env`에 설정되어 있어야 함
2. **대상 계정들**: 각 계정에 `SaltwareCrossAccount` Role이 생성되어 있어야 함
3. **신뢰 관계**: 모든 대상 계정의 Role이 기본 계정을 신뢰해야 함

## 1. 대상 계정에 Role 생성

각 대상 계정에서 다음 작업을 수행합니다:

### 1.1 IAM Role 생성

```bash
# AWS CLI로 Role 생성
aws iam create-role \
  --role-name SaltwareCrossAccount \
  --assume-role-policy-document file://trust-policy.json
```

### 1.2 신뢰 정책 (trust-policy.json)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::BASE_ACCOUNT_ID:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "your-external-id-here"
        }
      }
    }
  ]
}
```

**주의**: `BASE_ACCOUNT_ID`를 기본 계정 ID로 변경하세요.

### 1.3 권한 정책 연결

```bash
# EC2 읽기 권한
aws iam attach-role-policy \
  --role-name SaltwareCrossAccount \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess

# SSM 세션 관리 권한
aws iam attach-role-policy \
  --role-name SaltwareCrossAccount \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
```

또는 커스텀 정책 생성:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:DescribeTags"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:StartSession",
        "ssm:TerminateSession",
        "ssm:ResumeSession",
        "ssm:DescribeSessions",
        "ssm:GetConnectionStatus"
      ],
      "Resource": "*"
    }
  ]
}
```

## 2. 기본 계정 설정

### 2.1 IAM User 권한 추가

기본 계정의 IAM User에 AssumeRole 권한 추가:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/SaltwareCrossAccount"
    }
  ]
}
```

## 3. 애플리케이션 설정

### 3.1 환경 변수 설정 (.env)

```bash
# 기본 계정 자격 증명
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2

# 멀티 계정 설정 (JSON 배열)
TARGET_ACCOUNTS='[
  {
    "id": "123456789012",
    "name": "Production",
    "externalId": "prod-external-id"
  },
  {
    "id": "987654321098",
    "name": "Development",
    "externalId": "dev-external-id"
  },
  {
    "id": "555666777888",
    "name": "Staging"
  }
]'
```

### 3.2 설정 예시

```javascript
// 최소 설정 (External ID 없음)
TARGET_ACCOUNTS='[{"id":"123456789012","name":"Production"}]'

// 여러 계정
TARGET_ACCOUNTS='[
  {"id":"111111111111","name":"Prod"},
  {"id":"222222222222","name":"Dev"},
  {"id":"333333333333","name":"Test"}
]'
```

## 4. 사용 방법

### 4.1 UI에서 계정 선택

1. 애플리케이션 시작
2. 왼쪽 패널에서 계정 드롭다운 표시
3. 원하는 계정 선택
4. 해당 계정의 인스턴스 목록 표시
5. 인스턴스 선택 후 세션 시작

### 4.2 API 사용

```javascript
// 멀티 계정 인스턴스 조회
socket.emit('get-ec2-instances-multi-account');

socket.on('ec2-instances-multi-account-loaded', (data) => {
  console.log('계정별 인스턴스:', data.instancesByAccount);
  console.log('총 인스턴스:', data.totalInstances);
  console.log('총 계정:', data.totalAccounts);
});

// 특정 계정의 인스턴스로 세션 시작
socket.emit('start-session', {
  instanceId: 'i-1234567890abcdef0',
  instanceInfo: {
    accountId: '123456789012',
    externalId: 'optional-external-id',
    ...
  }
});
```

## 5. 보안 고려사항

### 5.1 External ID 사용

External ID는 "Confused Deputy Problem"을 방지합니다:

```json
{
  "Condition": {
    "StringEquals": {
      "sts:ExternalId": "unique-random-string"
    }
  }
}
```

### 5.2 최소 권한 원칙

- 필요한 권한만 부여
- 읽기 전용 권한 우선
- 정기적인 권한 검토

### 5.3 세션 만료

- 임시 자격 증명은 1시간 후 자동 만료
- 자동 갱신 메커니즘 내장
- 만료 5분 전 자동 갱신

## 6. 트러블슈팅

### 6.1 AssumeRole 실패

**증상**: `AccessDenied` 오류

**해결**:
1. 신뢰 정책 확인
2. 기본 계정 ID 확인
3. External ID 일치 확인
4. IAM User 권한 확인

### 6.2 인스턴스 조회 실패

**증상**: 특정 계정의 인스턴스가 표시되지 않음

**해결**:
1. Role에 EC2 읽기 권한 확인
2. 리전 설정 확인
3. 인스턴스 상태 확인 (running/stopped만 조회)

### 6.3 세션 시작 실패

**증상**: `SessionManagerPlugin not found` 또는 연결 실패

**해결**:
1. SSM Agent가 인스턴스에 설치되어 있는지 확인
2. Role에 SSM 권한 확인
3. 인스턴스의 IAM Role 확인

## 7. 로그 확인

```bash
# 서버 로그에서 계정 전환 확인
grep "계정 전환" logs/server.log

# 성공 로그
✅ 계정 전환 성공: 123456789012

# 실패 로그
❌ 계정 전환 실패 (123456789012): AccessDenied
```

## 8. 테스트

### 8.1 수동 테스트

```bash
# AWS CLI로 AssumeRole 테스트
aws sts assume-role \
  --role-arn arn:aws:iam::123456789012:role/SaltwareCrossAccount \
  --role-session-name test-session \
  --external-id your-external-id

# 성공 시 임시 자격 증명 반환
```

### 8.2 애플리케이션 테스트

1. 로컬 서버 시작: `npm run dev`
2. 브라우저에서 `http://localhost:3000` 접속
3. 계정 드롭다운에서 각 계정 선택
4. 인스턴스 목록 확인
5. 세션 시작 테스트

## 9. 비용 최적화

- AssumeRole 호출은 무료
- 임시 자격 증명 캐싱으로 API 호출 최소화
- 30분마다 만료된 캐시 자동 정리

## 10. 참고 자료

- [AWS STS AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
- [IAM Role Trust Policies](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_terms-and-concepts.html)
- [External ID](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html)
