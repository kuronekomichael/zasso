import { Stack, StackProps, Construct, Duration } from '@aws-cdk/core';
import { LogGroup, RetentionDays } from '@aws-cdk/aws-logs';

import { LambdaFuncs } from './lambda-stack';
import {
  RunLambdaTask,
  EvaluateExpression,
} from '@aws-cdk/aws-stepfunctions-tasks';
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
} from '@aws-cdk/aws-stepfunctions';

export interface SfnStackProps extends StackProps {
  funcs: LambdaFuncs;
}

export class SfnStack extends Stack {
  stateMachine: StateMachine;
  constructor(scope: Construct, id: string, props: SfnStackProps) {
    super(scope, id, props);

    // Lambda
    const {
      getTodayInfoFn,
      getRandomFn,
      createMeetingFn,
      stopMeetingFn,
      deleteMeetingFn,
    } = props.funcs;

    const success = new Succeed(this, 'Job end succeed');

    const getTodayInfoTask = new Task(this, "Get today's info", {
      task: new RunLambdaTask(getTodayInfoFn),
      resultPath: '$.todayInfo', // e.g. $.todayInfo.Payload.isWeekday
    });

    const taskGetRandomWait = new Task(this, 'Get random wait', {
      task: new RunLambdaTask(getRandomFn, {
        payload: TaskInput.fromObject({
          min: 10, // * 60, // 600秒(=10分)
          max: 50, // * 60, // 3000秒(=50分)
        }),
      }),
      resultPath: '$.wait',
    });

    const waitX = new Wait(this, 'Wait X Seconds', {
      time: WaitTime.secondsPath('$.wait.Payload'),
    });

    const taskCreateMeeting = new Task(this, 'Create a meeting', {
      task: new RunLambdaTask(createMeetingFn, {
        payload: TaskInput.fromObject({
          'bearer.$': '$.zoom-jwt-token',
          'slackChannel.$': '$.slack-channel',
          'slackWebHookUrl.$': '$.slack-webhook-url',
        }),
      }),
      resultPath: '$.meeting', // e.g. $.meeting.Payload.id
    });

    const taskMeetingDurationMin2Sec = new Task(
      this,
      'Convert minutes to seconds',
      {
        task: new EvaluateExpression({
          expression: '$.meeting.Payload.duration * 60',
        }),
        resultPath: '$.meetingDurationSeconds',
      }
    );

    const waitMeetingEnd = new Wait(
      this,
      'Wait until the meeting has finished',
      {
        time: WaitTime.secondsPath('$.meetingDurationSeconds'),
      }
    );

    const taskStopMeeting = new Task(this, 'Stop the meeting', {
      task: new RunLambdaTask(stopMeetingFn, {
        payload: TaskInput.fromObject({
          'bearer.$': '$.zoom-jwt-token',
          'meetingId.$': '$.meeting.Payload.id',
        }),
      }),
      resultPath: '$.stopMeetingRet',
    });

    const taskDeleteMeeting = new Task(this, 'Delete the meeting', {
      task: new RunLambdaTask(deleteMeetingFn, {
        payload: TaskInput.fromObject({
          'bearer.$': '$.zoom-jwt-token',
          'meetingId.$': '$.meeting.Payload.id',
        }),
      }),
      resultPath: '$.deleteMeetingRet',
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
      new Choice(this, 'Is week day!?')
        .when(
          // 平日ではない場合は、そのままEnd
          Condition.booleanEquals('$.todayInfo.Payload.isWeekday', false),
          success
        )
        .otherwise(sequence)
    );
    this.stateMachine = new StateMachine(this, `${id}-StateMachine`, {
      stateMachineName: `${id}-StateMachine`,
      definition,
      timeout: Duration.minutes(20), // 休憩時間は10分だが余裕をもって長めに設定
      logs: {
        destination: new LogGroup(this, `${id}-StateMachine-LogGroup`, {
          retention: RetentionDays.ONE_WEEK,
        }),
        includeExecutionData: true,
        level: LogLevel.ALL,
      },
    });
  }
}
