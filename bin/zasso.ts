#!/usr/bin/env node
import 'source-map-support/register';
import { App, Construct, Stack } from '@aws-cdk/core';
import { SfnStack } from '../lib/sfn-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { TriggerLambdaStack } from '../lib/trigger-lambda-stack';
import { createBundle } from '../lib/nodejs-bundler';

class ZassoService extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const stackId = id.charAt(0).toUpperCase() + id.slice(1).toLowerCase();
    const lambdaStack = new LambdaStack(scope, `ZassoLambdaStack${stackId}`);

    const sfnStack = new SfnStack(scope, `ZassoSfnStack${stackId}`, {
      funcs: lambdaStack.funcs,
    });

    new TriggerLambdaStack(scope, `ZassoTriggerLambdaStack${stackId}`, {
      lambdaLayer: lambdaStack.lambdaLayer,
      stateMachine: sfnStack.stateMachine,
    });
  }
}

// Create bundle directory for Lamdba Layer
createBundle();

const app = new App();

new ZassoService(app, 'dev');
//FIXME: new ZassoService(app, 'prd');
