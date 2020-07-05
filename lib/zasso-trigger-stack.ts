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

    const timerRule = new Rule(this, `${id}-timerRule`, {
      schedule: Schedule.expression(`cron(0 3,8 * * ? *)`), // 12時,17時(JST,+0900)
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
