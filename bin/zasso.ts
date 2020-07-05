#!/usr/bin/env node
import "source-map-support/register";
import { App, Construct, Stack } from "@aws-cdk/core";
import { ZassoSfnStack } from "../lib/zasso-sfn-stack";
import { ZassoAppLambdaStack } from "../lib/zasso-app-lambda-stack";
import { ZassoTriggerStack } from "../lib/zasso-trigger-stack";
import { createBundle } from "../lib/commons";

const appName = "zasso";

class ZassoService extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stage = this.node.tryGetContext("stage");
    if (!(stage && (stage === "dev" || stage === "prd")))
      throw new Error(
        `Invalid stage: ${stage}. It's only "dev" or "prd". cdk deploy --context stage=dev`
      );

    // Create bundle directory for Lamdba Layer
    createBundle();

    const props = {
      appName,
      stage,
      description: `${appName}-${stage}`,
    };

    const lambdaStack = new ZassoAppLambdaStack(scope, `lambda-stack`, props);

    const sfnStack = new ZassoSfnStack(scope, `sfn-stack`, {
      ...props,
      funcs: lambdaStack.funcs,
    });
    sfnStack.addDependency(lambdaStack);

    new ZassoTriggerStack(scope, `trigger-lambda-stack`, {
      ...props,
      lambdaLayer: lambdaStack.defaultLayer,
      stateMachine: sfnStack.stateMachine,
    });
  }
}

new ZassoService(new App(), "zasso-service");
