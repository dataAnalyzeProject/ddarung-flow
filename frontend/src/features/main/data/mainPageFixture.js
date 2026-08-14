export const stationMeta = [{ arrival: "11:05", range: "5~9대", rate: "87%", level: "매우 높음" }, { arrival: "11:07", range: "2~5대", rate: "72%", level: "높음" }, { arrival: "11:09", range: "0~2대", rate: "45%", level: "보통" }];
export const formatArrivalTime = (minutes, offsetMinutes = 0, now = new Date()) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(now.getTime() + (minutes + offsetMinutes) * 60000));

