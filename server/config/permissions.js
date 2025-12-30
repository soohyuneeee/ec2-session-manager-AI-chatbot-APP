// SaltwareCrossAccount 역할의 AWS API 권한 제약사항 정의

const CROSS_ACCOUNT_AWS_PERMISSIONS = {
  // 허용된 AWS API 액션들
  allowed: [
    // EC2 읽기 권한
    'ec2:DescribeInstances',
    'ec2:DescribeInstanceStatus', 
    'ec2:DescribeRegions',
    'ec2:DescribeAvailabilityZones',
    'ec2:DescribeVpcs',
    'ec2:DescribeSubnets',
    'ec2:DescribeSecurityGroups',
    'ec2:DescribeKeyPairs',
    'ec2:DescribeImages',
    
    // SSM 세션 관리 권한
    'ssm:StartSession',
    'ssm:TerminateSession',
    'ssm:ResumeSession',
    'ssm:DescribeSessions',
    'ssm:GetConnectionStatus',
    'ssm:DescribeInstanceInformation',
    'ssm:DescribeInstanceProperties',
    
    // CloudWatch 읽기 권한 (MCP 도구용)
    'logs:DescribeLogGroups',
    'logs:DescribeLogStreams',
    'logs:StartQuery',
    'logs:GetQueryResults',
    'cloudwatch:GetMetricData',
    'cloudwatch:GetMetricStatistics',
    'cloudwatch:ListMetrics'
  ],
  
  // 금지된 AWS API 액션들
  forbidden: [
    // EC2 인스턴스 관리
    'ec2:RunInstances',
    'ec2:TerminateInstances',
    'ec2:StopInstances',
    'ec2:StartInstances',
    'ec2:RebootInstances',
    'ec2:ModifyInstanceAttribute',
    'ec2:CreateTags',
    'ec2:DeleteTags',
    
    // 네트워크 관리
    'ec2:CreateVpc',
    'ec2:DeleteVpc',
    'ec2:CreateSubnet',
    'ec2:DeleteSubnet',
    'ec2:CreateSecurityGroup',
    'ec2:DeleteSecurityGroup',
    'ec2:AuthorizeSecurityGroupIngress',
    'ec2:RevokeSecurityGroupIngress',
    
    // IAM 관리
    'iam:CreateRole',
    'iam:DeleteRole',
    'iam:AttachRolePolicy',
    'iam:DetachRolePolicy',
    'iam:CreateUser',
    'iam:DeleteUser',
    
    // S3 쓰기 권한
    's3:PutObject',
    's3:DeleteObject',
    's3:CreateBucket',
    's3:DeleteBucket',
    
    // Lambda 관리
    'lambda:CreateFunction',
    'lambda:DeleteFunction',
    'lambda:UpdateFunctionCode',
    'lambda:InvokeFunction',
    
    // RDS 관리
    'rds:CreateDBInstance',
    'rds:DeleteDBInstance',
    'rds:ModifyDBInstance',
    
    // CloudFormation 관리
    'cloudformation:CreateStack',
    'cloudformation:DeleteStack',
    'cloudformation:UpdateStack'
  ]
};

const CROSS_ACCOUNT_PERMISSIONS = {
  // 허용된 액션들 (기본적으로 모든 명령어 허용)
  allowed: [
    // 기본 시스템 명령어
    'ls', 'pwd', 'whoami', 'id', 'uname', 'uptime', 'date',
    'cat', 'head', 'tail', 'grep', 'find', 'which', 'echo',
    
    // 네트워크 조회
    'netstat', 'ss', 'ping', 'curl', 'wget', 'nslookup', 'dig',
    
    // 프로세스 조회
    'ps', 'top', 'htop', 'pgrep', 'pstree',
    
    // 시스템 정보 조회
    'df', 'du', 'free', 'lscpu', 'lsblk', 'lsof', 'mount',
    'systemctl', 'service', 'journalctl',
    
    // 파일 조회 및 편집
    'file', 'stat', 'wc', 'sort', 'uniq', 'diff',
    'vi', 'vim', 'nano', 'emacs',
    
    // 환경 변수 조회
    'env', 'printenv', 'set',
    
    // 패키지 관리 (권한 오류 시 사용자가 sudo 선택 가능)
    'yum', 'apt', 'dnf', 'amazon-linux-extras', 'snap',
    
    // 파일 시스템 관리
    'mkdir', 'rmdir', 'rm', 'mv', 'cp', 'chmod', 'chown', 'touch',
    
    // 기타 유용한 명령어들
    'history', 'last', 'w', 'who', 'sudo', 'su'
  ],
  
  // 금지된 액션들 (빈 배열 - 모든 명령어 허용)
  forbidden: [],
  
  // 경고가 필요한 액션들 (권한 오류 가능성이 있는 명령어들)
  warning: [
    'sudo', 'su', 'systemctl start', 'systemctl stop', 'systemctl restart',
    'systemctl enable', 'systemctl disable', 'service start', 'service stop',
    'yum install', 'apt install', 'chmod', 'chown', 'mount', 'umount'
  ]
};

// 명령어가 허용되는지 확인하는 함수 (모든 명령어 허용)
function isCommandAllowed(command) {
  const cmd = command.toLowerCase().trim();
  
  // 경고가 필요한 명령어인지 확인 (권한 오류 가능성)
  const needsWarning = CROSS_ACCOUNT_PERMISSIONS.warning.some(warningCmd => 
    cmd.includes(warningCmd.toLowerCase())
  );
  
  if (needsWarning) return { allowed: true, type: 'warning', reason: '관리자 권한이 필요할 수 있습니다' };
  
  // 기본적으로 모든 명령어 허용
  return { allowed: true, type: 'allowed' };
}

// 명령어 목록을 필터링하는 함수 (모든 명령어 통과)
function filterCommandsByPermissions(commands) {
  // 모든 명령어 허용 - 필터링 없음
  return commands;
}

// AWS API 권한 체크 함수
function isAWSActionAllowed(awsAction) {
  const action = awsAction.toLowerCase();
  
  // 허용된 AWS API인지 확인
  const isAllowed = CROSS_ACCOUNT_AWS_PERMISSIONS.allowed.some(allowedAction => 
    action === allowedAction.toLowerCase()
  );
  
  if (isAllowed) return { allowed: true, type: 'allowed' };
  
  // 금지된 AWS API인지 확인
  const isForbidden = CROSS_ACCOUNT_AWS_PERMISSIONS.forbidden.some(forbiddenAction => 
    action === forbiddenAction.toLowerCase()
  );
  
  if (isForbidden) return { allowed: false, type: 'forbidden', reason: 'SaltwareCrossAccount 역할에 권한이 없습니다' };
  
  // 기본적으로 금지 (명시적으로 허용되지 않은 것은 차단)
  return { allowed: false, type: 'unknown', reason: '명시적으로 허용되지 않은 AWS API입니다' };
}

// AWS 서비스별 사용 가능한 기능 설명
function getAWSPermissionConstraints() {
  return `
**현재 AWS API 권한 제약사항 (SaltwareCrossAccount 역할):**

✅ **허용된 AWS API:**
- **EC2**: 인스턴스 조회, 상태 확인, 리전/VPC 정보 조회
- **SSM**: 세션 시작/종료, 인스턴스 정보 조회
- **CloudWatch**: 메트릭 조회, 로그 그룹 조회 (읽기 전용)

❌ **제한된 AWS API:**
- **EC2**: 인스턴스 생성/삭제/시작/중지, 네트워크 설정 변경
- **IAM**: 역할/사용자 관리, 정책 변경
- **S3**: 객체 업로드/삭제, 버킷 생성/삭제
- **Lambda**: 함수 생성/삭제/실행
- **RDS**: 데이터베이스 생성/삭제/수정
- **CloudFormation**: 스택 생성/삭제/수정

💡 **AWS 리소스 관리가 필요한 작업은 시스템 관리자에게 문의하세요.**
`;
}

// 권한 제약사항을 설명하는 텍스트 생성 (터미널 명령어용)
function getPermissionConstraints() {
  return `
**현재 권한 상태 (SaltwareCrossAccount 역할):**

✅ **모든 명령어 사용 가능:**
- 시스템 정보 조회 (df, free, ps, netstat 등)
- 파일 관리 (cat, head, tail, grep, mkdir, rm 등)
- 네트워크 관리 (ping, curl, wget 등)
- 패키지 관리 (yum, apt, amazon-linux-extras 등)
- 서비스 관리 (systemctl, service 등)
- 시스템 설정 (chmod, chown 등)

⚠️ **권한 오류 발생 시:**
- 관리자 권한이 필요한 작업에서 권한 오류가 발생할 수 있습니다
- 권한 오류 시 루트 권한으로 전환할지 선택할 수 있습니다

💡 **자유롭게 명령어를 사용하세요. 권한이 필요하면 자동으로 안내해드립니다.**
`;
}

module.exports = {
  CROSS_ACCOUNT_PERMISSIONS,
  CROSS_ACCOUNT_AWS_PERMISSIONS,
  isCommandAllowed,
  isAWSActionAllowed,
  filterCommandsByPermissions,
  getPermissionConstraints,
  getAWSPermissionConstraints
};