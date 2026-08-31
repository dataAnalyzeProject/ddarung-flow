export function buildHourlyRows(arrivalWeather) {
  if (!arrivalWeather || !Array.isArray(arrivalWeather.hourlyForecasts) || arrivalWeather.hourlyForecasts.length === 0) {
    return null;
  }
  const sorted = [...arrivalWeather.hourlyForecasts].sort((a, b) => a.forecastAt.localeCompare(b.forecastAt));
  const arrivalHourKey = arrivalWeather.arrivalAt ? arrivalWeather.arrivalAt.slice(0, 13) : null;
  return sorted.slice(0, 5).map((item) => {
    const rainy = (item.precipitationType && item.precipitationType !== "NONE") || (item.precipitationProbabilityPercent ?? 0) >= 50;
    const hour = item.forecastAt && item.forecastAt.includes("T") ? item.forecastAt.split("T")[1].slice(0, 2) : "--";
    return {
      time: `${hour}시`,
      temperature: item.temperatureC === null || item.temperatureC === undefined ? "-" : `${item.temperatureC}°C`,
      rain: item.precipitationProbabilityPercent === null || item.precipitationProbabilityPercent === undefined ? "-" : `${item.precipitationProbabilityPercent}%`,
      condition: rainy ? "주의" : "추천",
      tone: rainy ? "caution" : "safe",
      current: item.forecastAt ? item.forecastAt.slice(0, 13) === arrivalHourKey : false,
    };
  });
}

export default function TimeBasedRideEnvironment({ hours = [] }) {
  const hasHours = hours.length > 0;
  return (
    <section className="guide-card guide-hourly" aria-labelledby="hourly-title">
      <header className="guide-card-heading">
        <h2 id="hourly-title">시간대별 라이딩 환경</h2>
        {hasHours && <p><span className="safe" />추천 <span className="caution" />주의</p>}
      </header>
      {hasHours ? <><div className="guide-hourly-timeline" aria-label="시간대별 변화">
        <span aria-hidden="true" />
        {hours.map((hour) => (
          <div className={hour.current ? "current" : ""} key={hour.time}>
            <span>{hour.time}</span>
            <i className={hour.tone} aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="guide-hourly-table-wrap">
        <table className="guide-hourly-table">
          <caption className="sr-only">시간대별 기온, 강수확률과 라이딩 환경</caption>
          <tbody>
            <tr>
              <th scope="row">기온 (°C)</th>
              {hours.map((hour) => (
                <td aria-label={`${hour.time} ${hour.temperature}`} className={hour.current ? "current safe-text" : ""} key={hour.time}>
                  {hour.temperature}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">강수확률 (%)</th>
              {hours.map((hour) => (
                <td
                  aria-label={`${hour.time} 강수확률 ${hour.rain}`}
                  className={`${hour.current ? "current safe-text" : ""} ${hour.tone === "caution" ? "caution-text" : ""}`}
                  key={hour.time}
                >
                  {hour.rain}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">라이딩 환경</th>
              {hours.map((hour) => (
                <td aria-label={`${hour.time} 라이딩 환경 ${hour.condition}`} className={hour.current ? "current" : ""} key={hour.time}>
                  <span className={`guide-condition ${hour.tone}`}>{hour.condition}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div></> : <p className="guide-prediction-empty" role="status">시간대별 날씨 예보 정보가 없습니다.</p>}
    </section>
  );
}
