import * as request from "request-promise";
import { stopMeeting } from "../../../lambda/core/zasso";

afterEach(() => {
  jest.restoreAllMocks();
});

test.todo("getServiceParam"); //TODO: テスト追加
test.todo("createMeeting"); //TODO: テスト追加
test.todo("deleteMeeting"); //TODO: テスト追加

test("stopMeeting", async () => {
  const postSpy = jest.spyOn(request, "put").mockResolvedValueOnce({});

  const ret = await stopMeeting({
    meetingId: "928832",
    bearer: "something-anything",
  });

  expect(postSpy).toBeCalledWith({
    auth: {
      bearer: "something-anything",
    },
    body: {
      action: "end",
    },
    headers: {
      "User-Agent": "Zoom-Jwt-Request",
      "content-type": "application/json",
    },
    json: true,
    uri: "https://api.zoom.us/v2/meetings/928832/status",
  });

  expect(ret).toEqual(undefined);
});
