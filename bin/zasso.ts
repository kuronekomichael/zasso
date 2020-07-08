#!/usr/bin/env node
import "source-map-support/register";
import { App, Construct } from "@aws-cdk/core";
import { ZassoSfnStack } from "../lib/zasso-sfn-stack";
import { ZassoAppLambdaStack } from "../lib/zasso-app-lambda-stack";
import { ZassoTriggerStack } from "../lib/zasso-trigger-stack";
import { createBundle, AppStack, AppStackProps } from "../lib/commons";

class ZassoService extends AppStack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // Create bundle directory for Lamdba Layer
    createBundle();

    const lambdaStack = new ZassoAppLambdaStack(
      scope,
      `${appName}-${stage}-lambda-stack`,
      { ...props }
    );

    const sfnStack = new ZassoSfnStack(scope, `${appName}-${stage}-sfn-stack`, {
      ...props,
      funcs: lambdaStack.funcs,
    });
    sfnStack.addDependency(lambdaStack);

    new ZassoTriggerStack(scope, `${appName}-${stage}-trigger-lambda-stack`, {
      ...props,
      lambdaLayer: lambdaStack.defaultLayer,
      stateMachine: sfnStack.stateMachine,
    });
  }
}

const app = new App();

const stage = app.node.tryGetContext("stage");
if (!(stage && (stage === "dev" || stage === "prd")))
  throw new Error(
    `Invalid stage: ${stage}. It's only "dev" or "prd". cdk deploy --context stage=dev`
  );

const appName = "zasso";

new ZassoService(app, `${appName}-service`, {
  appName,
  stage,
  description: `${appName}-${stage}`,
});
