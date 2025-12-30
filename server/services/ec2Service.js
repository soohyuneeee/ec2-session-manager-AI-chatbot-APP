const { getEC2Client } = require('../config/aws');
const { DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { EC2Client } = require('@aws-sdk/client-ec2');
const { SSMClient, DescribeInstanceInformationCommand } = require('@aws-sdk/client-ssm');
const { filterCommandsByPermissions, getPermissionConstraints } = require('../config/permissions');
const { getAccountList, getAccountCredentials, getBaseAccountInfo } = require('../config/accounts');

// AWS 접근 정보 조회 (간단 버전)
async function getAWSRoleInfo() {
  try {
    // 환경 변수에서 기본 정보 가져오기
    const region = process.env.AWS_REGION || 'ap-northeast-2';
    const crossAccountRole = process.env.CROSS_ACCOUNT_ROLE_ARN;
    
    if (crossAccountRole) {
      // Cross Account Role이 설정된 경우
      const roleNameMatch = crossAccountRole.match(/role\/([^\/]+)/);
      const roleName = roleNameMatch ? roleNameMatch[1] : 'Unknown';
      const accountIdMatch = crossAccountRole.match(/:(\d+):/);
      const accountId = accountIdMatch ? accountIdMatch[1] : 'Unknown';
      
      return {
        hasRole: true,
        roleName: roleName,
        roleArn: crossAccountRole,
        accountId: accountId,
        region: region,
        description: 'Session Manager 접근용 IAM Role',
        permissions: [
          'EC2 인스턴스 조회',
          'Session Manager 세션 시작',
          'Session Manager 세션 종료'
        ],
        securityNote: 'IAM Role 기반 접근으로 안전하게 관리됩니다'
      };
    } else {
      // 일반 자격 증명 사용
      return {
        hasRole: false,
        region: region,
        description: 'AWS 자격 증명으로 Session Manager 접근',
        permissions: [
          'EC2 인스턴스 조회',
          'Session Manager 세션 시작',
          'Session Manager 세션 종료'
        ],
        securityNote: 'AWS 자격 증명으로 안전하게 관리됩니다'
      };
    }
  } catch (error) {
    console.error('❌ AWS 접근 정보 조회 실패:', error.message);
    return {
      hasRole: false,
      error: error.message,
      permissions: [
        'EC2 인스턴스 조회',
        'Session Manager 세션 시작'
      ],
      securityNote: 'AWS 자격 증명으로 접근 중입니다'
    };
  }
}

// EC2 인스턴스 조회 함수 (크로스 어카운트 지원 + 병렬 처리)
async function getEC2InstancesByRegion() {
  const regions = [
    'us-east-1', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1',
    'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
    'ap-south-1', 'sa-east-1', 'ca-central-1'
  ];
  
  const startTime = Date.now();
  
  // 모든 리전을 병렬로 조회
  const regionPromises = regions.map(async (region) => {
    try {
      // 크로스 어카운트 EC2 클라이언트 가져오기
      const ec2Client = await getEC2Client(region);
      
      const params = {
        Filters: [
          {
            Name: 'instance-state-name',
            Values: ['running', 'stopped']
          }
        ]
      };
      
      const command = new DescribeInstancesCommand(params);
      const result = await ec2Client.send(command);
      const instances = [];
      
      result.Reservations.forEach(reservation => {
        reservation.Instances.forEach(instance => {
          const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
          instances.push({
            instanceId: instance.InstanceId,
            name: nameTag?.Value || 'Unnamed',
            state: instance.State.Name,
            instanceType: instance.InstanceType,
            platform: instance.Platform || 'Linux/Unix',
            platformDetails: instance.PlatformDetails,
            architecture: instance.Architecture,
            launchTime: instance.LaunchTime,
            privateIpAddress: instance.PrivateIpAddress,
            publicIpAddress: instance.PublicIpAddress,
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            securityGroups: instance.SecurityGroups,
            keyName: instance.KeyName,
            region: region
          });
        });
      });
      
      if (instances.length > 0) {
        return { region, instances };
      } else {
        return { region, instances: [] };
      }
    } catch (error) {
      if (error.code !== 'UnauthorizedOperation') {
        console.error(`❌ 리전 ${region} 조회 오류:`, error.message);
      }
      return { region, instances: [] };
    }
  });
  
  // 모든 리전 조회 완료 대기
  const results = await Promise.all(regionPromises);
  
  // 결과를 객체로 변환
  const instancesByRegion = {};
  results.forEach(({ region, instances }) => {
    if (instances.length > 0) {
      instancesByRegion[region] = instances;
    }
  });
  
  const totalInstances = Object.values(instancesByRegion).reduce((sum, instances) => sum + instances.length, 0);
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const regionsWithInstances = Object.keys(instancesByRegion).length;
  
  console.log(`✅ EC2 조회 완료: ${totalInstances}개 인스턴스 (${regionsWithInstances}개 리전, ${elapsedTime}초)`);
  
  return instancesByRegion;
}

// OS별 추천 액션 생성 함수 (권한 제약 적용)
function generateOSSpecificActions(instanceInfo) {
  const actions = [];
  const platform = instanceInfo.platform?.toLowerCase() || '';
  const platformDetails = instanceInfo.platformDetails?.toLowerCase() || '';
  
  // 권한 제약사항 안내 액션 추가
  actions.push({
    id: 'permission_info',
    title: '🔒 현재 권한 제약사항 안내',
    description: 'SaltwareCrossAccount 역할의 제한된 권한으로 실행 중입니다',
    commands: [
      'echo "=== 현재 권한 제약사항 ==="',
      'echo "✅ 허용: 시스템 정보 조회, 파일 읽기, 네트워크 테스트"', 
      'echo "❌ 제한: 패키지 설치, 서비스 관리, 파일 수정"',
      'echo "💡 관리자 권한이 필요한 작업은 시스템 관리자에게 문의하세요"'
    ]
  });
  
  // Windows 인스턴스
  if (platform.includes('windows') || platformDetails.includes('windows')) {
    actions.push(
      {
        id: 'windows_system_info',
        title: 'Windows 시스템 정보 확인',
        description: 'Windows 시스템 정보와 상태를 확인합니다 (읽기 전용)',
        commands: [
          'systeminfo | findstr /C:"OS Name" /C:"OS Version" /C:"Total Physical Memory"',
          'Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, TotalPhysicalMemory',
          'Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object Name, Status | Sort-Object Name'
        ]
      },
      {
        id: 'windows_network_check',
        title: 'Windows 네트워크 상태 확인',
        description: 'Windows 디스크 공간과 성능을 확인합니다',
        commands: [
          'Get-WmiObject -Class Win32_LogicalDisk | Select-Object DeviceID, Size, FreeSpace',
          'Get-Counter "\\Processor(_Total)\\% Processor Time"',
          'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10'
        ]
      }
    );
  }
  // Amazon Linux
  else if (platformDetails.includes('amazon linux')) {
    actions.push(
      {
        id: 'amazon_linux_system_check',
        title: 'Amazon Linux 시스템 점검',
        description: 'Amazon Linux 시스템 상태와 패키지를 확인합니다',
        commands: [
          'cat /etc/os-release',
          'uptime',
          'df -h',
          'free -h',
          'yum list installed | head -20'
        ]
      },
      {
        id: 'amazon_linux_services_check',
        title: 'Amazon Linux 서비스 상태 확인',
        description: '현재 실행 중인 서비스와 네트워크 상태를 확인합니다 (읽기 전용)',
        commands: [
          'systemctl list-units --type=service --state=running | head -10',
          'netstat -tlnp | head -10',
          'ps aux | head -10'
        ]
      },
      {
        id: 'amazon_linux_logs_check',
        title: 'Amazon Linux 로그 확인',
        description: '시스템 로그와 최근 활동을 확인합니다 (읽기 전용)',
        commands: [
          'journalctl --since "1 hour ago" --no-pager | tail -20',
          'tail -n 20 /var/log/messages 2>/dev/null || echo "로그 파일 접근 제한"',
          'last | head -10'
        ]
      }
    );
  }
  // Ubuntu/Debian
  else if (platformDetails.includes('ubuntu') || platformDetails.includes('debian')) {
    actions.push(
      {
        id: 'ubuntu_system_check',
        title: 'Ubuntu/Debian 시스템 점검',
        description: 'Ubuntu/Debian 시스템 상태를 확인합니다',
        commands: [
          'lsb_release -a',
          'uptime',
          'df -h',
          'free -h',
          'apt list --installed | head -20'
        ]
      },
      {
        id: 'ubuntu_services_check',
        title: 'Ubuntu/Debian 서비스 상태 확인',
        description: '현재 실행 중인 서비스와 네트워크 상태를 확인합니다 (읽기 전용)',
        commands: [
          'systemctl list-units --type=service --state=running | head -10',
          'ss -tlnp | head -10',
          'ps aux | head -10'
        ]
      },
      {
        id: 'ubuntu_network_check',
        title: 'Ubuntu/Debian 네트워크 확인',
        description: '네트워크 연결과 설정을 확인합니다 (읽기 전용)',
        commands: [
          'ip addr show',
          'ping -c 3 8.8.8.8',
          'curl -I http://www.google.com'
        ]
      }
    );
  }
  // CentOS/RHEL
  else if (platformDetails.includes('centos') || platformDetails.includes('red hat')) {
    actions.push(
      {
        id: 'centos_system_check',
        title: 'CentOS/RHEL 시스템 점검',
        description: 'CentOS/RHEL 시스템 상태를 확인합니다',
        commands: [
          'cat /etc/redhat-release',
          'uptime',
          'df -h',
          'free -h',
          'yum list installed | head -20'
        ]
      },
      {
        id: 'centos_services_check',
        title: 'CentOS/RHEL 서비스 상태 확인',
        description: '현재 실행 중인 서비스와 시스템 상태를 확인합니다 (읽기 전용)',
        commands: [
          'systemctl list-units --type=service --state=running | head -10',
          'netstat -tlnp | head -10',
          'ps aux | head -10'
        ]
      }
    );
  }
  // 기본 Linux 액션
  else {
    actions.push(
      {
        id: 'linux_system_check',
        title: 'Linux 시스템 점검',
        description: '일반적인 Linux 시스템 상태를 확인합니다',
        commands: [
          'uname -a',
          'cat /etc/os-release',
          'uptime',
          'df -h',
          'free -h',
          'ps aux | head -10'
        ]
      },
      {
        id: 'linux_network_check',
        title: 'Linux 네트워크 상태 확인',
        description: '네트워크 연결과 포트 상태를 확인합니다',
        commands: [
          'ip addr show',
          'netstat -tlnp',
          'ss -tlnp',
          'ping -c 3 8.8.8.8'
        ]
      }
    );
  }
  
  // 공통 보안 점검 액션
  actions.push({
    id: 'security_check',
    title: '보안 상태 점검',
    description: '시스템 보안 상태와 로그를 확인합니다',
    commands: [
      'sudo last | head -10',
      'sudo journalctl --since "1 hour ago" --no-pager | tail -20',
      'sudo netstat -tlnp | grep :22',
      'sudo fail2ban-client status 2>/dev/null || echo "fail2ban not installed"'
    ]
  });
  
  // 권한 체크 및 필터링 적용
  const filteredActions = actions.map(action => {
    if (action.commands) {
      const filteredCommands = filterCommandsByPermissions(action.commands);
      
      // 필터링된 명령어가 있으면 설명에 추가
      if (filteredCommands.length < action.commands.length) {
        const removedCount = action.commands.length - filteredCommands.length;
        action.description += ` (${removedCount}개 명령어가 권한 제약으로 제외됨)`;
      }
      
      action.commands = filteredCommands;
    }
    return action;
  }).filter(action => action.commands && action.commands.length > 0);
  
  return filteredActions;
}

module.exports = {
  getEC2InstancesByRegion,
  generateOSSpecificActions,
  getAWSRoleInfo,
  getEC2InstancesByAccount,
  getEC2InstancesByRegionForAccount
};

/**
 * 멀티 계정의 EC2 인스턴스 조회
 * @returns {Object} 계정별 인스턴스 목록
 */
async function getEC2InstancesByAccount() {
  try {
    const accounts = getAccountList();
    const baseAccount = await getBaseAccountInfo();
    
    // 기본 계정 추가
    const allAccounts = [
      {
        accountId: baseAccount.accountId,
        accountName: '기본 계정',
        externalId: null,
        isBase: true
      },
      ...accounts
    ];
    
    console.log(`🔍 ${allAccounts.length}개 계정에서 인스턴스 조회 시작...`);
    
    // 각 계정별로 인스턴스 조회
    const accountPromises = allAccounts.map(async (account) => {
      try {
        const credentials = await getAccountCredentials(
          account.isBase ? null : account.accountId,
          account.externalId
        );
        
        // 해당 계정의 인스턴스 조회
        const instancesByRegion = await getEC2InstancesByRegionForAccount(credentials, account);
        
        return {
          accountId: account.accountId,
          accountName: account.accountName,
          instancesByRegion,
          totalInstances: Object.values(instancesByRegion).reduce((sum, instances) => sum + instances.length, 0)
        };
      } catch (error) {
        console.error(`❌ 계정 ${account.accountName} (${account.accountId}) 조회 실패:`, error.message);
        return {
          accountId: account.accountId,
          accountName: account.accountName,
          instancesByRegion: {},
          totalInstances: 0,
          error: error.message
        };
      }
    });
    
    const results = await Promise.all(accountPromises);
    
    // 결과를 계정별로 정리
    const instancesByAccount = {};
    results.forEach(result => {
      if (result.totalInstances > 0) {
        instancesByAccount[result.accountId] = {
          accountName: result.accountName,
          instancesByRegion: result.instancesByRegion,
          totalInstances: result.totalInstances
        };
      }
    });
    
    const totalAccounts = Object.keys(instancesByAccount).length;
    const totalInstances = Object.values(instancesByAccount).reduce((sum, acc) => sum + acc.totalInstances, 0);
    
    console.log(`✅ 멀티 계정 조회 완료: ${totalInstances}개 인스턴스 (${totalAccounts}개 계정)`);
    
    return instancesByAccount;
  } catch (error) {
    console.error('❌ 멀티 계정 인스턴스 조회 실패:', error.message);
    throw error;
  }
}

/**
 * SSM 연결 상태 확인
 * @param {Object} credentials - AWS 자격 증명
 * @param {string} region - 리전
 * @param {Array} instanceIds - 인스턴스 ID 목록
 * @returns {Object} 인스턴스별 SSM 연결 상태
 */
async function checkSSMConnectivity(credentials, region, instanceIds) {
  if (!instanceIds || instanceIds.length === 0) {
    return {};
  }

  try {
    const ssmClient = new SSMClient({
      region,
      credentials
    });

    const command = new DescribeInstanceInformationCommand({
      Filters: [
        {
          Key: 'InstanceIds',
          Values: instanceIds
        }
      ]
    });

    const result = await ssmClient.send(command);
    
    // SSM에 연결된 인스턴스 맵 생성
    const ssmConnectedMap = {};
    result.InstanceInformationList?.forEach(info => {
      ssmConnectedMap[info.InstanceId] = {
        connected: info.PingStatus === 'Online',
        pingStatus: info.PingStatus,
        platformType: info.PlatformType,
        platformName: info.PlatformName,
        platformVersion: info.PlatformVersion,
        agentVersion: info.AgentVersion
      };
    });

    return ssmConnectedMap;
  } catch (error) {
    // SSM 권한이 없거나 오류 발생 시 빈 객체 반환
    console.warn(`⚠️ SSM 연결 상태 확인 실패 (${region}):`, error.message);
    return {};
  }
}

/**
 * 특정 계정의 모든 리전에서 인스턴스 조회
 * @param {Object} credentials - AWS 자격 증명
 * @param {Object} accountInfo - 계정 정보
 * @returns {Object} 리전별 인스턴스 목록
 */
async function getEC2InstancesByRegionForAccount(credentials, accountInfo) {
  const regions = [
    'us-east-1', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1',
    'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
    'ap-south-1', 'sa-east-1', 'ca-central-1'
  ];
  
  const regionPromises = regions.map(async (region) => {
    try {
      const ec2Client = new EC2Client({
        region,
        credentials
      });
      
      const params = {
        Filters: [
          {
            Name: 'instance-state-name',
            Values: ['running', 'stopped']
          }
        ]
      };
      
      const command = new DescribeInstancesCommand(params);
      const result = await ec2Client.send(command);
      const instances = [];
      
      result.Reservations.forEach(reservation => {
        reservation.Instances.forEach(instance => {
          const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
          instances.push({
            instanceId: instance.InstanceId,
            name: nameTag?.Value || 'Unnamed',
            state: instance.State.Name,
            instanceType: instance.InstanceType,
            platform: instance.Platform || 'Linux/Unix',
            platformDetails: instance.PlatformDetails,
            architecture: instance.Architecture,
            launchTime: instance.LaunchTime,
            privateIpAddress: instance.PrivateIpAddress,
            publicIpAddress: instance.PublicIpAddress,
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            securityGroups: instance.SecurityGroups,
            keyName: instance.KeyName,
            iamInstanceProfile: instance.IamInstanceProfile,
            region: region,
            accountId: accountInfo.accountId,
            accountName: accountInfo.accountName
          });
        });
      });
      
      if (instances.length > 0) {
        // SSM 연결 상태 확인
        const instanceIds = instances.map(i => i.instanceId);
        const ssmStatus = await checkSSMConnectivity(credentials, region, instanceIds);
        
        // 인스턴스에 SSM 상태 추가
        instances.forEach(instance => {
          const ssm = ssmStatus[instance.instanceId];
          instance.ssmConnected = ssm?.connected || false;
          instance.ssmPingStatus = ssm?.pingStatus || 'Unknown';
          instance.ssmAgentVersion = ssm?.agentVersion || null;
        });
        
        return { region, instances };
      } else {
        return { region, instances: [] };
      }
    } catch (error) {
      if (error.code !== 'UnauthorizedOperation') {
        console.error(`❌ 계정 ${accountInfo.accountName}, 리전 ${region} 조회 오류:`, error.message);
      }
      return { region, instances: [] };
    }
  });
  
  const results = await Promise.all(regionPromises);
  
  const instancesByRegion = {};
  results.forEach(({ region, instances }) => {
    if (instances.length > 0) {
      instancesByRegion[region] = instances;
    }
  });
  
  return instancesByRegion;
}