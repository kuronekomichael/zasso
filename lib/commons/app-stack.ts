import { Construct, Stack, StackProps } from "@aws-cdk/core";

export interface AppStackProps extends StackProps {
  appName: string;
  stage: string;
}

export abstract class AppStack extends Stack {
  appName: string;
  stage: string;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    this.appName = props.appName;
    this.stage = props.appName;
  }
}
