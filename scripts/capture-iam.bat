@echo off
echo Capturing IAM state...
aws sts get-caller-identity --query 'Account' --output text > c:\Users\domin\Downloads\testLM\Kudbee-fuel-gage\scripts\account.txt 2>&1
aws iam list-attached-role-policies --role-name EC2-SSM-ROLE --output json > c:\Users\domin\Downloads\testLM\Kudbee-fuel-gage\scripts\role-policies.json 2>&1
aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=i-0a8157bc8ea33b36b,i-0685561c90845986d --output json > c:\Users\domin\Downloads\testLM\Kudbee-fuel-gage\scripts\instance-associations.json 2>&1
aws ssm describe-instance-information --filters Key=InstanceIds,Values=i-0a8157bc8ea33b36b,i-0685561c90845986d --output json > c:\Users\domin\Downloads\testLM\Kudbee-fuel-gage\scripts\ssm-instances.json 2>&1
echo Capture complete
