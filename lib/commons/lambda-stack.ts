import { RetentionDays } from "@aws-cdk/aws-logs";
import { Construct, Duration } from "@aws-cdk/core";
import { Role, IRole, ServicePrincipal, ManagedPolicy } from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import { AppStack, AppStackProps, NODE_LAMBDA_LAYER_DIR } from ".";
import { TZ } from "../constant";
import * as path from "path";

export interface LambdaStackProps extends AppStackProps {
  defaultRole: boolean;
  defaultLayer: boolean;
}

export abstract class LambdaStack extends AppStack {
  defaultRole: IRole | undefined;
  defaultLayer: lambda.ILayerVersion | undefined;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Lambda用のIAM Role
    if (props.defaultRole) {
      this.defaultRole = new Role(this, `default-iam-role-for-lambda`, {
        description: `${props.appName}-${props.stage}-lambda-role`,
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      });
    }

    // Node.jsの外部ライブラリ用 Lambda Layer
    if (props.defaultLayer) {
      this.defaultLayer = new lambda.LayerVersion(
        this,
        `default-node-modules-layer`,
        {
          layerVersionName: `${props.appName}-${props.stage}-nodejs-layer`,
          code: lambda.AssetCode.fromAsset(NODE_LAMBDA_LAYER_DIR),
          compatibleRuntimes: [lambda.Runtime.NODEJS_12_X],
        }
      );
    }
  }

  // Lambda Functionを作るだけ
  createLambda({
    assetPath,
    handler,
    role,
    layer,
  }: {
    assetPath: string;
    handler: string;
    role?: IRole;
    layer?: lambda.ILayerVersion;
  }): lambda.Function {
    const description = `${this.appName}-${this.stage}:${assetPath}/${handler}`
      .replace(/[^\w-]/g, "_")
      .slice(0, 256); // descrptionは最大256文字まで
    const functionName = description.slice(0, 64); // 関数名は最大64文字まで

    const layers = [];
    if (layer) layers.push(layer);
    if (this.defaultLayer) layers.push(this.defaultLayer);

    return new lambda.Function(this, `${assetPath}-${handler}`, {
      description,
      functionName,
      code: lambda.Code.fromAsset(path.join(__dirname, "../..", assetPath)),
      handler,
      timeout: Duration.seconds(30),
      role: role ? role : this.defaultRole,
      layers,
      tracing: lambda.Tracing.ACTIVE,
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: RetentionDays.ONE_WEEK,
      environment: {
        TZ,
      },
    });
  }
}
