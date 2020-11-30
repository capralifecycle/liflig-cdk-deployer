import * as S3 from "aws-sdk/clients/s3"
import * as STS from "aws-sdk/clients/sts"
import * as del from "del"
import * as execa from "execa"
import * as fs from "fs"
import * as path from "path"
import * as tempy from "tempy"

const s3 = new S3()
const sts = new STS()

/**
 * The schema for cloud-assembly.json.
 */
interface CloudAssemblyDetails {
  cloudAssemblyBucketName: string
  cloudAssemblyBucketKey: string
  stages: {
    name: string
    stackNames: string[]
  }[]
  parameters: {
    name: string
    value: {
      type: "variable"
      variable: string
    }
  }[]
}

function exec(
  file: string,
  args?: readonly string[],
  options?: execa.Options,
): execa.ExecaChildProcess {
  console.log(`Running: ${file} ${args?.join(" ") ?? ""}`)
  const result = execa(file, args, options)
  result.stdout?.pipe(process.stdout)
  result.stderr?.pipe(process.stderr)
  return result
}

function collectParameters(
  details: CloudAssemblyDetails,
  variables: Record<string, string>,
): string[] {
  const result: string[] = []

  for (const parameter of details.parameters) {
    if (parameter.value.type !== "variable") {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      console.warn(`Unsupported parameter type: ${parameter.value.type}`)
      continue
    }

    const value = variables[parameter.value.variable]
    if (value === undefined) {
      throw new Error(`Variable not found: ${parameter.value.variable}`)
    }

    result.push(`${parameter.name}=${value}`)
  }

  console.log(`Built ${result.length} parameters`)
  for (const value of result) {
    console.log(`  ${value}`)
  }

  return result
}

async function fetchCloudAssembly(
  details: CloudAssemblyDetails,
  outputPath: string,
): Promise<void> {
  const bucketName = details.cloudAssemblyBucketName
  const bucketKey = details.cloudAssemblyBucketKey

  const tmpDir = tempy.directory({ prefix: "cdk-deployer-" })
  const tmpZip = path.join(tmpDir, "cloud-assembly.zip")

  console.log(`Fetching s3://${bucketName}/${bucketKey}`)

  const s3Result = await s3
    .getObject({
      Bucket: bucketName,
      Key: bucketKey,
    })
    .promise()

  await fs.promises.writeFile(
    tmpZip,
    s3Result.Body!.toString("binary"),
    "binary",
  )

  await exec("unzip", [tmpZip], {
    cwd: outputPath,
  })

  await del(tmpDir, { force: true })
}

async function cdkDeploy({
  cdkCredentials,
  cloudAssemblyDir,
  cloudFormationRoleArn,
  stackNames,
  parameters,
}: {
  cdkCredentials: Record<string, string>
  cloudAssemblyDir: string
  cloudFormationRoleArn: string | undefined
  stackNames: string[]
  parameters: string[]
}): Promise<void> {
  const cloudFormationRoleArnArgs = cloudFormationRoleArn
    ? ["--role-arn", cloudFormationRoleArn]
    : []

  const parametersExpanded: string[] = []
  for (const parameter of parameters) {
    parametersExpanded.push("--parameters")
    parametersExpanded.push(parameter)
  }

  const args = [
    "--app",
    cloudAssemblyDir,
    "--require-approval=never",
    "--verbose",
    ...cloudFormationRoleArnArgs,
    "deploy",
    ...parametersExpanded,
    "--exclusively",
    ...stackNames,
  ]

  await exec("node_modules/.bin/cdk", args, {
    env: cdkCredentials,
  })
}

function requireEnv(name: string): string {
  const result = process.env[name]
  if (result === undefined || result === "") {
    throw new Error(`Missing env: ${name}`)
  }
  return result
}

function optionalEnv(name: string): string | undefined {
  const result = process.env[name]
  if (result !== undefined && result !== "") {
    return result
  }
  return undefined
}

async function main() {
  if (process.env["IS_TEST"] !== undefined) {
    console.log("Running in test mode - exiting")
    return
  }

  const targetRoleArn = requireEnv("CDK_TARGET_ROLE_ARN")
  console.log(`Assuming role for ${targetRoleArn} to use for CDK deployment`)

  const assumeRoleResult = await sts
    .assumeRole({
      RoleArn: targetRoleArn,
      RoleSessionName: "liflig-cdk-deployer",
    })
    .promise()

  const cdkCredentials = {
    AWS_ACCESS_KEY_ID: assumeRoleResult.Credentials!.AccessKeyId,
    AWS_SECRET_ACCESS_KEY: assumeRoleResult.Credentials!.SecretAccessKey,
    AWS_SESSION_TOKEN: assumeRoleResult.Credentials!.SessionToken,
  }

  const cloudFormationRoleArn = optionalEnv("CDK_CLOUD_FORMATION_ROLE_ARN")
  const currentStageName = requireEnv("CDK_STAGE")

  const cloudAssemblyDir = tempy.directory({ prefix: "cdk-deployer-" })

  const cloudAssemblyDetails = JSON.parse(
    requireEnv("CDK_CLOUD_ASSEMBLY"),
  ) as CloudAssemblyDetails

  const variablesRaw = optionalEnv("CDK_VARIABLES")
  const variables = variablesRaw
    ? (JSON.parse(variablesRaw) as Record<string, string>)
    : {}

  const parameters = collectParameters(cloudAssemblyDetails, variables)

  const currentStage = cloudAssemblyDetails.stages.find(
    (it) => it.name === currentStageName,
  )

  if (!currentStage) {
    console.warn(
      `No definition for stage ${currentStageName} found - nothing to do`,
    )
    return
  }

  if (currentStage.stackNames.length === 0) {
    console.warn(
      `Found stage for ${currentStageName} but no stacks in list - nothing to do`,
    )
    return
  }

  await fetchCloudAssembly(cloudAssemblyDetails, cloudAssemblyDir)

  await cdkDeploy({
    cdkCredentials,
    cloudAssemblyDir,
    cloudFormationRoleArn: cloudFormationRoleArn,
    stackNames: currentStage.stackNames,
    parameters,
  })

  await del(cloudAssemblyDir, { force: true })
}

main().catch((error) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  console.error(error.stack || error.message || error)
  process.exitCode = 1
})
