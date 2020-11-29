#!/usr/bin/env groovy

// See https://github.com/capralifecycle/jenkins-pipeline-library
@Library("cals") _

def version = "1-experimental"

// Repo defined in https://github.com/capralifecycle/liflig-incubator-common-infra
def dockerImageName = "001112238813.dkr.ecr.eu-west-1.amazonaws.com/incub-common-liflig-cdk-deployer"

buildConfig(
  slack: [channel: "#cals-dev-info"],
) {
  dockerNode {
    sh "(set +x; eval \$(aws ecr get-login --no-include-email --region eu-west-1 --registry-ids 001112238813))"

    checkout scm

    stage("Check code") {
      insideToolImage("node:14") {
        sh "npm ci"
        sh "npx tsc"
      }
    }

    def img
    def lastImageId = dockerPullCacheImage(dockerImageName)

    stage("Build image") {
      img = docker.build(dockerImageName, "--cache-from $lastImageId .")
    }

    def isSameImage = dockerPushCacheImage(img, lastImageId)
    if (env.BRANCH_NAME == "master" && !isSameImage) {
      stage("Push image") {
        milestone 1
        img.push(version)
      }
    }
  }
}
