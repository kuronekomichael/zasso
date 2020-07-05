import * as moment from "moment-timezone";
import * as holidayJp from "@holiday-jp/holiday_jp";

export const getRandom = async ({
  min = 0,
  max = 100,
}: {
  min: number;
  max: number;
}): Promise<number> => Math.floor(Math.random() * max) + min;

export type TodayInfo = {
  comment: string;
  isWeekday: boolean;
};

export const getTodayInfo = async (): Promise<TodayInfo> => {
  const now = moment().tz(process.env.TZ || "Asia/Tokyo");

  // 土日(1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun)
  if (now.isoWeekday() > 5) {
    return {
      comment: `Today is weekend: ${now.isoWeekday()}`,
      isWeekday: false,
    };
  }

  // 祝日
  if (holidayJp.isHoliday(now.toDate())) {
    return {
      comment: `Today is holiday`,
      isWeekday: false,
    };
  }

  return {
    comment: `Today is weekday ${now.format("YYYY-MM-DD")}`,
    isWeekday: true,
  };
};
