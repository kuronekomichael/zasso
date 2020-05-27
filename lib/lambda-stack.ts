import { RetentionDays } from '@aws-cdk/aws-logs';
import { Construct, Duration, Stack } from '@aws-cdk/core';
import { Role, ServicePrincipal, ManagedPolicy } from '@aws-cdk/aws-iam';
import {
  LayerVersion,
  Function,
  Tracing,
  Runtime,
  Code,
  AssetCode,
} from '@aws-cdk/aws-lambda';

import { NODE_LAMBDA_LAYER_DIR } from './nodejs-bundler';
import { TZ } from './constant';

export interface LambdaFuncs {
  launchFn: Function;
  getTodayInfoFn: Function;
  getRandomFn: Function;
  createMeetingFn: Function;
  stopMeetingFn: Function;
  deleteMeetingFn: Function;
}

export class LambdaStack extends Stack {
  iamRoleForLambda: Role;
  lambdaLayer: LayerVersion;
  funcs: LambdaFuncs;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Lambda用IAMロール
    this.iamRoleForLambda = new Role(this, `${id}-IAMRoleForLamda`, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // Node.jsの外部ライブラリ用 Lambda Layer
    this.lambdaLayer = new LayerVersion(this, `${id}-NodeModulesLayer`, {
      code: AssetCode.fromAsset(NODE_LAMBDA_LAYER_DIR),
      compatibleRuntimes: [Runtime.NODEJS_12_X],
    });

    // Lambdaを定義してリスト化
    this.funcs = {
      launchFn: this.createLambda('lambda', 'launcher.launch'),
      getTodayInfoFn: this.createLambda('lambda', 'util.getTodayInfo'),
      getRandomFn: this.createLambda('lambda', 'util.getRandom'),
      createMeetingFn: this.createLambda('lambda/core', 'zasso.createMeeting'),
      stopMeetingFn: this.createLambda('lambda/core', 'zasso.stopMeeting'),
      deleteMeetingFn: this.createLambda('lambda/core', 'zasso.deleteMeeting'),
    };
  }

  // Lambda Functionを作るだけ
  createLambda(assetPath: string, handler: string) {
    const functionName = `${this.stackName}-${handler}`.replace(/[^\w-]/g, '_');

    return new Function(this, `${assetPath}-${handler}`, {
      functionName,
      code: Code.asset(assetPath),
      handler,
      timeout: Duration.seconds(30), //TODO: 一律にタイムアウト30秒にしてるけど変えたほうがベター
      role: this.iamRoleForLambda,
      layers: [this.lambdaLayer],
      tracing: Tracing.ACTIVE,
      runtime: Runtime.NODEJS_12_X,
      logRetention: RetentionDays.ONE_WEEK,
      environment: {
        TZ,
      },
    });
  }
}
