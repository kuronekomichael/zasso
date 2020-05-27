import { StateMachine } from '@aws-cdk/aws-stepfunctions';
import { RetentionDays } from '@aws-cdk/aws-logs';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Rule, Schedule, RuleTargetInput } from '@aws-cdk/aws-events';
import { Construct, Duration, Stack, StackProps } from '@aws-cdk/core';
import {
  Function,
  Tracing,
  Runtime,
  Code,
  LayerVersion,
} from '@aws-cdk/aws-lambda';
import {
  Role,
  ServicePrincipal,
  ManagedPolicy,
  PolicyStatement,
  PolicyDocument,
} from '@aws-cdk/aws-iam';

import { TZ } from './constant';

interface TriggerLambdaStackProps extends StackProps {
  lambdaLayer: LayerVersion;
  stateMachine: StateMachine;
}

export class TriggerLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: TriggerLambdaStackProps) {
    super(scope, id, props);

    const iamPolicyDocSsmReadOnly = new PolicyDocument({
      statements: [
        // SSMの中でも、Zassoに関する特定のパス配下だけを読み込み可
        new PolicyStatement({
          actions: ['ssm:GetParametersByPath'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/zasso/*`,
          ],
        }),
        // StateMachineにパラメタを渡してスタート可
        new PolicyStatement({
          actions: ['states:StartExecution'],
          resources: [props.stateMachine.stateMachineArn],
        }),
      ],
    });

    // Lambda用IAMロール
    const iamRole = new Role(this, `${id}-IAMRoleForTriggerLamda`, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        iamPolicyDocSsmReadOnly,
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    const assetPath = 'lambda';
    const handler = 'launcher.launch';
    const functionName = `${this.stackName}-${handler}`.replace(/[^\w-]/g, '_');
    const lambdaFn = new Function(this, `${assetPath}-${handler}`, {
      functionName,
      code: Code.asset(assetPath),
      handler,
      timeout: Duration.seconds(30), // タイムアウト30秒
      role: iamRole,
      layers: [props.lambdaLayer],
      tracing: Tracing.ACTIVE,
      runtime: Runtime.NODEJS_12_X,
      logRetention: RetentionDays.ONE_WEEK,
      environment: {
        TZ,
      },
    });

    const timerRule = new Rule(this, `${id}-timerRule`, {
      schedule: Schedule.expression(`cron(0 3,6,8 * * ? *)`), // 12時,15時,17時(JST,+0900)
      //                                  │ │     │ │ │ └ Year
      //                                  │ │     │ │ └ Day-of-week (?=いずれかの曜日)
      //                                  │ │     │ └ Month
      //                                  │ │     └ Day-of-month
      //                                  │ └ Hours(UTC)
      //                                  └ Minutes
    });

    timerRule.addTarget(
      new LambdaFunction(lambdaFn, {
        event: RuleTargetInput.fromObject({
          stateMachineArn: props.stateMachine.stateMachineArn,
        }),
      })
    );
  }
}
