import { Construct } from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import { LambdaStack, AppStackProps } from "./commons";

export interface ZassoAppFuncs {
  getTodayInfoFn: lambda.Function;
  getRandomFn: lambda.Function;
  createMeetingFn: lambda.Function;
  stopMeetingFn: lambda.Function;
  deleteMeetingFn: lambda.Function;
}

export class ZassoAppLambdaStack extends LambdaStack {
  funcs: ZassoAppFuncs;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, {
      ...props,
      defaultLayer: true,
      defaultRole: true,
    });

    this.funcs = {
      getTodayInfoFn: this.createLambda({
        assetPath: "lambda",
        handler: "util.getTodayInfo",
      }),
      getRandomFn: this.createLambda({
        assetPath: "lambda",
        handler: "util.getRandom",
      }),
      createMeetingFn: this.createLambda({
        assetPath: "lambda/core",
        handler: "zasso.createMeeting",
      }),
      stopMeetingFn: this.createLambda({
        assetPath: "lambda/core",
        handler: "zasso.stopMeeting",
      }),
      deleteMeetingFn: this.createLambda({
        assetPath: "lambda/core",
        handler: "zasso.deleteMeeting",
      }),
    };
  }
}
