import * as moment from 'moment-timezone';
import * as request from 'request-promise';

const TZ = process.env.TZ || 'Asia/Tokyo';
const UA = 'Zoom-Jwt-Request';
const END_POINT = 'https://api.zoom.us/v2';
const MEETING_DURATION_MINUTES = 10;

/**
 * [private] 現在のZoomユーザーの情報を取得する
 * @param bearer Zoom API Token
 */
const getZoomUser = async (bearer: string) => {
  try {
    const response = await request.get({
      uri: `${END_POINT}/users`,
      qs: { status: 'active' },
      auth: { bearer },
      headers: {
        'User-Agent': UA,
        'content-type': 'application/json',
      },
      json: true,
    });
    if (response.total_records !== 1)
      throw new Error(
        `ルーム生成ユーザーは１人しか想定しないのに、${response.total_records}人分のデータが取得された`
      );
    return response.users.pop();
  } catch (err) {
    console.error('API call failed, reason ', err);
    throw err;
  }
};

/**
 * [private] Zoomミーティングを作成する
 * @param {Object} meeting
 * @param meeting.topic ミーティングの名称
 * @param meeting.bearer Zoom API Token
 * @param meeting.duration ミーティングの時間(分) ※ただしここで指定した時間に強制力はない
 */
const createZoomMeeting = async ({
  topic,
  bearer,
  duration,
}: {
  topic: string;
  bearer: string;
  duration?: number;
}) => {
  // 制限事項
  // 1. ミーティング生成APIは、最大でも15分程度に1回が限度（公式な制限としては、24時間に100回）
  //    15分に1回が限度としてしまうべき
  // 2. 複数のルームは同時並行に起動できない
  //    1つのZoomアカウントのJWTトークンにつき、同時並行して開始できるミーティングは１つまで
  //    無料のZoomアカウントを沢山取得して、JWTをそれぞれ発行するなんてことはしちゃ駄目です！
  const user = await getZoomUser(bearer);

  const options = {
    uri: `${END_POINT}/users/${user.id}/meetings`,
    body: {
      /* eslint-disable @typescript-eslint/camelcase */
      topic,
      agenda: `${duration}分が経過すると自動的に終了します`,
      type: 2, // 1 = instant, 2 = scheduled, 3 = recurring with no fixed time, 8 = recurring with fixed time
      timezone: TZ,
      start_time: moment().tz(TZ).format('YYYY-MM-DDTHH:mm:ss'), // ミーティングの開始時刻
      duration, // ミーティングの時間(単位: 分) しかし特に強制力はない様子...
      settings: {
        host_video: false, // ホストが入室したときにビデオを開始するか
        participant_video: true, // 参加者が入室したときにビデオを開始するか
        cn_meeting: false, // 中国国内のホストで起動するか
        in_meeting: false, // インド国内のホストで起動するか
        join_before_host: true, // ホストが不在でも開始可能か
        mute_upon_entry: false, // 参加時にミュートにするか
        watermark: false, // 画面共有時にすかしを入れるかどうか
        use_pmi: false, // 自動生成されたIDではなく、個人用のIDを会議室IDとして使用するか
        approval_type: 2, //承認タイプ (0=自動承認, 1=手動承認, 2=登録は必要なし)
        audio: 'voip', // オーディオ(both, telephony, voip)
        auto_recording: 'none', // 自動記録(local, cloud, none)
        enforce_login: false, // ログインしているユーザーのみが参加できるか
        waiting_room: false, // 待機室を有効にするか
      },
      /* eslint-enable */
    },
    auth: { bearer },
    headers: {
      'User-Agent': UA,
      'content-type': 'application/json',
    },
    json: true,
  };

  try {
    const response = await request.post(options);
    return response;
  } catch (err) {
    console.error('API call failed, reason ', err);
    throw err;
  }
};

/**
 * [private] Slackへテキストメッセージを送信する
 * @param {Object} slack
 * @param slack.text 送信するテキスト
 * @param slack.webHookUrl Slack WebHook URL
 * @param slack.channel チャンネル名
 */
const sendSlackMessage = async ({
  text,
  webHookUrl,
  channel,
}: {
  webHookUrl: string;
  channel: string;
  text: string;
}) => {
  await request.post({
    url: webHookUrl,
    headers: { 'Content-Type': 'application/json' },
    body: {
      /* eslint-disable @typescript-eslint/camelcase */
      channel,
      text,
      link_names: 1, // @がメンションと解釈されるためのフラグ
      /* eslint-enable */
    },
    json: true,
  });
};

type CreateMeetingOptions = {
  bearer: string;
  slackChannel: string;
  slackWebHookUrl: string;
};

/**
 * Zaassoミーティングを開始する
 * @param {Object} param
 * @param param.bearer Zoom API Token
 * @param param.slackChannel
 * @param param.slackWebHookUrl
 */
export const createMeeting = async ({
  bearer,
  slackChannel,
  slackWebHookUrl,
}: CreateMeetingOptions) => {
  // インスタントミーティングを作成
  const meeting = await createZoomMeeting({
    topic: 'Zasso',
    duration: MEETING_DURATION_MINUTES,
    bearer,
  });

  // Slack通知用のメッセージを作成
  const startTime = moment(meeting.start_time).tz(TZ);
  const endTime = moment(startTime).add(meeting.duration, 'minutes');
  const text = `@here ちょっと休憩しませんか？:coffee:\n:zoom: ${
    meeting.join_url
  }\n:clock1: ${startTime.format('HH:mm')}〜${endTime.format('HH:mm')}（${
    meeting.duration
  }分間限定）\n息抜きのついでに、業務で行き詰まっている事を誰かに話してみては？意外と良いアイデアが出るかもですよ？！:hugging_face:`;

  // Slackへ送信
  await sendSlackMessage({
    webHookUrl: slackWebHookUrl,
    channel: slackChannel,
    text,
  });

  return meeting;
};

type ControlMeetingOptions = {
  bearer: string;
  meetingId: string;
};

/**
 * Zaassoミーティングを停止する（削除はしない）
 * @param {Object} param
 * @param param.bearer Zoom API Token
 * @param param.meetingId ZoomミーティングID
 */
export const stopMeeting = async ({
  bearer,
  meetingId,
}: ControlMeetingOptions) => {
  try {
    await request.put({
      uri: `${END_POINT}/meetings/${meetingId}/status`,
      body: { action: 'end' },
      auth: { bearer },
      headers: {
        'User-Agent': UA,
        'content-type': 'application/json',
      },
      json: true,
    });
  } catch (err) {
    console.error('API call failed, reason ', err);
    throw err;
  }
};

/**
 * Zaassoミーティングを削除する
 * @param {Object} param
 * @param param.bearer Zoom API Token
 * @param param.meetingId ZoomミーティングID
 */
export const deleteMeeting = async ({
  bearer,
  meetingId,
}: ControlMeetingOptions) => {
  try {
    await request.delete({
      uri: `${END_POINT}/meetings/${meetingId}`,
      auth: { bearer },
      headers: {
        'User-Agent': UA,
        'content-type': 'application/json',
      },
      json: true,
    });
  } catch (err) {
    console.error('API call failed, reason ', err);
    throw err;
  }
};
