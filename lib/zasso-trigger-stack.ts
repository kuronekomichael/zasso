import { StateMachine } from "@aws-cdk/aws-stepfunctions";
import { LambdaFunction } from "@aws-cdk/aws-events-targets";
import { Rule, Schedule, RuleTargetInput } from "@aws-cdk/aws-events";
import { Construct } from "@aws-cdk/core";
import { ILayerVersion } from "@aws-cdk/aws-lambda";
import {
  Role,
  ServicePrincipal,
  ManagedPolicy,
  PolicyStatement,
  PolicyDocument,
} from "@aws-cdk/aws-iam";

import { LambdaStack, AppStackProps } from "./commons";

interface ZassoTriggerStackProps extends AppStackProps {
  lambdaLayer?: ILayerVersion;
  stateMachine: StateMachine;
}

export class ZassoTriggerStack extends LambdaStack {
  constructor(scope: Construct, id: string, props: ZassoTriggerStackProps) {
    super(scope, id, {
      ...props,
      defaultRole: false,
      defaultLayer: false,
    });

    // 平日何時に実行するのかUTC時刻で指定(カンマ区切り)
    // UTCで指定する。例) 3,8 = 日本時間では12時,17時
    const hourToLaunch = this.node.tryGetContext("hourToLaunch") ?? "3,8";

    const iamPolicyDocSsmReadOnly = new PolicyDocument({
      statements: [
        // SSMの中でも、Zassoに関する特定のパス∧特定の環境下だけを読み込み可
        new PolicyStatement({
          actions: ["ssm:GetParametersByPath"],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/zasso/${props.stage}/account-manager/accounts/*`,
          ],
        }),
        // StateMachineを開始可能
        new PolicyStatement({
          actions: ["states:StartExecution"],
          resources: [props.stateMachine.stateMachineArn],
        }),
      ],
    });

    // Lambda用IAMロール
    const role = new Role(this, `iam-role-for-trigger-lambda`, {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        iamPolicyDocSsmReadOnly,
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    const lambdaFn = this.createLambda({
      assetPath: "lambda",
      handler: "launcher.launch",
      layer: props.lambdaLayer,
      role,
    });
    lambdaFn.addEnvironment("STAGE", props.stage);
    lambdaFn.addEnvironment(
      "STATE_MACHINE_ARN",
      props.stateMachine.stateMachineArn
    );

    const timerRule = new Rule(this, `${id}-timerRule`, {
      schedule: Schedule.expression(`cron(0 ${hourToLaunch} * * ? *)`),
      //                                  │ │               │ │ │ └ Year
      //                                  │ │               │ │ └ Day-of-week (?=いずれかの曜日)
      //                                  │ │               │ └ Month
      //                                  │ │               └ Day-of-month
      //                                  │ └ Hours(UTC)
      //                                  └ Minutes
    });

    timerRule.addTarget(
      new LambdaFunction(lambdaFn, {
        event: RuleTargetInput.fromObject({}),
      })
    );
  }
}
