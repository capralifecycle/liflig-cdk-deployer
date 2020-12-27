# liflig-cdk-deployer

This represents a Docker image that will be run as a ECS task
to perform a deployment of AWS CDK stacks as part of a deployment
pipeline.

## How it works

1. Identify the stacks for the current environment to be deployed
1. Download the Cloud Assembly
1. Build parameters to be used during deployment
1. Run CDK to deploy the stacks for the given Cloud Assembly

## Configuration

Environment variables:

- `CDK_TARGET_ROLE_ARN` - IAM Role in the target account which
  is being deployed. The CDK command runs under this role,
  however the fetching of the Cloud Assembly runs under the
  ECS task role
- `CDK_CLOUD_FORMATION_ROLE_ARN` (optional) - IAM Role used by
  CloudFormation to create resources in the target account
- `CDK_ENV_NAME` - name of environment to be deployed
- `CDK_CLOUD_ASSEMBLY` - see below
- `CDK_VARIABLES` (optional) - see below

### The `CDK_CLOUD_ASSEMBLY` environment variable

JSON-serialized value including a reference to an already
synthesized CDK Cloud Assembly stored on S3, stack names for
the different environments and mapping for variables to stack parameters.

Example:

```json
{
  "cloudAssemblyBucketName": "name-of-bucket",
  "cloudAssemblyBucketKey": "cloud-assembly/ff56fbd62edaa5d9112cd41d981a4bf966f088361b9c4eab7620389905390bd2.zip",
  "environments": [
    { "name": "dev", "stackNames": ["myapp-dev-core", "myapp-dev-api"] }
  ],
  "parameters": [
    {
      "name": "myapp-dev-api:EcrTag",
      "value": { "type": "variable", "variable": "apiEcrTag" }
    }
  ]
}
```

### The `CDK_VARIABLES` environment variable

JSON-serialized value holding a map of strings with variables that
is combined with the parameters described in `CDK_CLOUD_ASSEMBLY`,
producing the parameters passed to CDK (and CloudFormation) during
deployment.

```json
{
  "apiEcrTag": "some-tag-used-in-ecr"
}
```

## Limitations

CDK supports both embedded file (S3) and Docker (ECR) assets. Since we
run on Fargate, embedded Docker assets is not supported.
