import { SSM, StepFunctions } from "aws-sdk";

const { STAGE } = process.env;

/**
 * アカウント識別子毎に、Zassoのステートマシンを起動するだけ
 */
export const launch = async ({
  stateMachineArn,
}: {
  stateMachineArn: string;
}): Promise<any[]> => {
  // SSMからアカウント一覧を取得する
  const path = `/zasso/${STAGE}/account-manager/accounts/`;

  const ssm = new SSM();
  const results = await ssm
    .getParametersByPath({
      Path: path,
      Recursive: true,
      WithDecryption: true,
    })
    .promise();

  if (!results.Parameters) throw new Error(`SSM param not found: ${path}`);

  const accountIdList = results.Parameters.filter((param) => !!param.Name)
    .map((param) => param.Name?.replace(path, "").split("/").shift())
    .filter((elem, index, self) => self.indexOf(elem) === index);
  console.log("🚀", accountIdList);

  const keys = ["slack-channel", "slack-webhook-url", "zoom-jwt-token"];

  const eventList = accountIdList.map((accountId) => {
    const event = keys.reduce<{ [key: string]: string }>((accumlator, key) => {
      console.log("🍀", `${path}/${accountId}/${key}`);
      const param = results.Parameters?.find(
        (param) => param.Name === `${path}${accountId}/${key}`
      );
      accumlator[key] = param?.Value || "";
      return accumlator;
    }, {});
    return event;
  });
  console.log("🔥", eventList);

  const sfn = new StepFunctions();
  const promises = eventList.map((event) => {
    return new Promise((resolve, reject) => {
      sfn.startExecution(
        {
          input: JSON.stringify(event),
          stateMachineArn,
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  });

  const ret = await Promise.all(promises);

  return ret;
};
