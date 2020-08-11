import { Stack, Construct, Duration } from "@aws-cdk/core";
import { LogGroup, RetentionDays } from "@aws-cdk/aws-logs";

import { AppStackProps } from "./commons";
import { ZassoAppFuncs } from "./zasso-app-lambda-stack";
import {
  RunLambdaTask,
  EvaluateExpression,
} from "@aws-cdk/aws-stepfunctions-tasks";
import {
  Choice,
  Condition,
  Task,
  Wait,
  WaitTime,
  StateMachine,
  Succeed,
  TaskInput,
  LogLevel,
} from "@aws-cdk/aws-stepfunctions";

export interface ZassoSfnStackProps extends AppStackProps {
  funcs: ZassoAppFuncs;
}

export class ZassoSfnStack extends Stack {
  stateMachine: StateMachine;
  constructor(scope: Construct, id: string, props: ZassoSfnStackProps) {
    super(scope, id, props);

    // Parameters
    // 平日の決まった時刻からランダムに待ち時間をおいてからミーティングを作成する
    // ランダム待ち時間の最小時間（デフォルトは 10分
    const waitMinutesMin = this.node.tryGetContext("waitMinutesMin") ?? 10;
    // ランダム待ち時間の最小時間（デフォルトは 50分）
    const waitMinutesMax = this.node.tryGetContext("waitMinutesMax") ?? 50;
    // 雑談時間（デフォルトは 10分）
    const meetingDurationMunutes =
      this.node.tryGetContext("meetingDurationMinutes") ?? 10;

    const { appName, stage, funcs } = props;

    const success = new Succeed(this, "Job end succeed");

    const getTodayInfoTask = new Task(this, "Get today's info", {
      task: new RunLambdaTask(funcs.getTodayInfoFn),
      resultPath: "$.todayInfo", // e.g. $.todayInfo.Payload.isWeekday
    });

    const taskGetRandomWait = new Task(this, "Get random wait", {
      task: new RunLambdaTask(funcs.getRandomFn, {
        payload: TaskInput.fromObject({
          min: waitMinutesMin * 60,
          max: waitMinutesMax * 60,
        }),
      }),
      resultPath: "$.waitSec",
    });

    const waitX = new Wait(this, "Wait X Seconds", {
      time: WaitTime.secondsPath("$.waitSec.Payload"),
    });

    const taskCreateMeeting = new Task(this, "Create a meeting", {
      task: new RunLambdaTask(funcs.createMeetingFn, {
        payload: TaskInput.fromObject({
          "bearer.$": "$.zoom-jwt-token",
          "slackChannel.$": "$.slack-channel",
          "slackWebHookUrl.$": "$.slack-webhook-url",
          meetingDuration: `${meetingDurationMunutes}`,
        }),
      }),
      resultPath: "$.meeting", // e.g. $.meeting.Payload.id
    });

    const taskMeetingDurationMin2Sec = new EvaluateExpression(
      this,
      `"Convert minutes to seconds"`,
      {
        expression: "$.meeting.Payload.duration * 60",
        resultPath: "$.meetingDurationSeconds",
      }
    );

    const waitMeetingEnd = new Wait(
      this,
      "Wait until the meeting has finished",
      {
        time: WaitTime.secondsPath("$.meetingDurationSeconds"),
      }
    );

    const taskStopMeeting = new Task(this, "Stop the meeting", {
      task: new RunLambdaTask(funcs.stopMeetingFn, {
        payload: TaskInput.fromObject({
          "bearer.$": "$.zoom-jwt-token",
          "meetingId.$": "$.meeting.Payload.id",
        }),
      }),
      resultPath: "$.stopMeetingRet",
    });

    const taskDeleteMeeting = new Task(this, "Delete the meeting", {
      task: new RunLambdaTask(funcs.deleteMeetingFn, {
        payload: TaskInput.fromObject({
          "bearer.$": "$.zoom-jwt-token",
          "meetingId.$": "$.meeting.Payload.id",
        }),
      }),
      resultPath: "$.deleteMeetingRet",
    });

    const sequence = taskGetRandomWait
      .next(waitX)
      .next(taskCreateMeeting)
      .next(taskMeetingDurationMin2Sec)
      .next(waitMeetingEnd)
      .next(taskStopMeeting)
      .next(taskDeleteMeeting)
      .next(success);

    const definition = getTodayInfoTask.next(
      new Choice(this, "Is week day!?")
        .when(
          // 平日ではない場合は、そのままEnd
          Condition.booleanEquals("$.todayInfo.Payload.isWeekday", false),
          success
        )
        .otherwise(sequence)
    );

    this.stateMachine = new StateMachine(
      this,
      `${appName}-${stage}-state-machine`,
      {
        stateMachineName: `${appName}-${stage}-state-machine`,
        definition,
        timeout: Duration.minutes(waitMinutesMax + meetingDurationMunutes + 5), // ランダム待ち時間最大値 + 雑談時間 + 終了処理に余裕をもたせて+5分
        logs: {
          destination: new LogGroup(this, `${appName}-${stage}-sm-lg`, {
            retention: RetentionDays.ONE_WEEK,
          }),
          includeExecutionData: true,
          level: LogLevel.ALL,
        },
      }
    );
  }
}
