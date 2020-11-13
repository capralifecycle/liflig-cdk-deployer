#!/usr/bin/env groovy

// See https://github.com/capralifecycle/jenkins-pipeline-library
@Library("cals") _

buildConfig(
  slack: [channel: "#cals-dev-info"],
) {
  dockerNode {
    checkout scm

    stage("Check code") {
      insideToolImage("node:14") {
        sh "npm ci"
        sh "npx tsc"
      }
    }

    stage("Build image") {
      sh "docker build ."
    }

    // TODO: Upload to ECR or Docker Hub
  }
}
