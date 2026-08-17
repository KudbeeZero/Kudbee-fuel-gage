# Capture current IAM state for EC2-SSM-ROLE
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outputFile = "c:\Users\domin\Downloads\testLM\Kudbee-fuel-gage\scripts\iam-state-$timestamp.json"

@{
    Timestamp = $timestamp
    Account = (aws sts get-caller-identity --query 'Account' --output text 2>&1)
    RolePolicies = (aws iam list-attached-role-policies --role-name EC2-SSM-ROLE --output json 2>&1)
    InstanceAssociations = (aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=i-0a8157bc8ea33b36b,i-0685561c90845986d --output json 2>&1)
    SSMInstances = (aws ssm describe-instance-information --filters Key=InstanceIds,Values=i-0a8157bc8ea33b36b,i-0685561c90845986d --output json 2>&1)
    EC2InstanceProfiles = (aws ec2 describe-instances --instance-ids i-0a8157bc8ea33b36b,i-0685561c90845986d --query 'Reservations[].Instances[].IamInstanceProfile' --output json 2>&1)
} | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputFile -Encoding utf8

Write-Host "State captured to: $outputFile"
Get-Content $outputFile
