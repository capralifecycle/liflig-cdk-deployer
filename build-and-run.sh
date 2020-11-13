#!/bin/bash
set -eu

# Just a temporary script to test things locally.

docker build -t cdk-deployer .
docker run \
  --rm \
  -it \
  -e CDK_STAGE=dev \
  -e CDK_DEPLOY_ROLE_ARN= \
  -e INPUT_DATA_DIR=/data \
  -e AWS_DEFAULT_REGION \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_SESSION_TOKEN \
  -e AWS_SECURITY_TOKEN \
  -v "$PWD/data:/data" \
  cdk-deployer

# export CDK_STAGE=dev
# export CDK_DEPLOY_ROLE_ARN=
# export INPUT_DATA_DIR=data/
