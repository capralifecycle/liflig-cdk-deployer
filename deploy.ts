import * as S3 from "aws-sdk/clients/s3"
import * as del from "del"
import * as execa from "execa"
import * as fs from "fs"
import * as globby from "globby"
import * as path from "path"
import * as tempy from "tempy"

const s3 = new S3()

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

async function readCloudAssemblyDetails(
  inputFile: string,
): Promise<CloudAssemblyDetails> {
  return JSON.parse(
    await fs.promises.readFile(inputFile, "utf-8"),
  ) as CloudAssemblyDetails
}

async function collectVariables(
  files: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  for (const file of files) {
    const data = JSON.parse(
      await fs.promises.readFile(file, "utf-8"),
    ) as Record<string, string>

    for (const [key, value] of Object.entries(data)) {
      result[key] = value
    }
  }

  console.log(`Found ${Object.keys(result).length} variables`)
  for (const [key, value] of Object.entries(result)) {
    console.log(`  ${key}: ${value}`)
  }

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
  cloudAssemblyDir,
  deployRoleArn,
  stackNames,
  parameters,
}: {
  cloudAssemblyDir: string
  deployRoleArn: string | undefined
  stackNames: string[]
  parameters: string[]
}): Promise<void> {
  const deployRoleArnArgs = deployRoleArn ? ["--role-arn", deployRoleArn] : []

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
    ...deployRoleArnArgs,
    "deploy",
    ...parametersExpanded,
    "--exclusively",
    ...stackNames,
  ]

  await exec("cdk", args)
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
  const deployRoleArn = optionalEnv("CDK_DEPLOY_ROLE_ARN")
  const currentStageName = requireEnv("CDK_STAGE")

  // TODO: Download zip for CodePipeline input artifact?
  const inputDataDir = requireEnv("INPUT_DATA_DIR")

  const cloudAssemblyDir = tempy.directory({ prefix: "cdk-deployer-" })

  const cloudAssemblyDetails = await readCloudAssemblyDetails(
    path.join(inputDataDir, "cloud-assembly.json"),
  )

  const variables = await collectVariables(
    (await globby("variables*.json", { cwd: inputDataDir })).map((it) =>
      path.join(inputDataDir, it),
    ),
  )

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
    cloudAssemblyDir,
    deployRoleArn,
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
