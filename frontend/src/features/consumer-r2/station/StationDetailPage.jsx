import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createKakaoMapAdapter, loadKakaoMapSdk } from "../../map/kakaoMapApi";
import {
  AsyncState,
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
  SurfaceCard,
} from "../shared";
import { consumerStationAdapter } from "../adapters/station/consumerStationAdapter";
import "./stationDetail.css";

const INVENTORY_COPY = {
  NORMAL: { label: "정상", detail: "최신 재고가 수집되었습니다." },
  DELAYED: { label: "지연", detail: "수집 시각이 지연되어 현재와 다를 수 있습니다." },
  MISSING: { label: "수집 누락", detail: "현재 재고를 확인하지 못했습니다." },
  UNAVAILABLE: { label: "조회 불가", detail: "재고 제공 상태를 확인하지 못했습니다." },
};

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const RHYTHM_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
// 날씨별 is in the mockup but the rhythm response carries no weather axis, so it
// is not offered - both views here are read off the weekday/hour cells we have.
const RHYTHM_VIEWS = [["HOURLY", "시간별"], ["WEEKDAY", "요일별"]];

function inventoryCopy(status) {
  return INVENTORY_COPY[status] || { label: "상태 확인 필요", detail: "재고 상태를 확인하지 못했습니다." };
}

function displayCount(station) {
  if (station.inventoryStatus === "MISSING") return "수집 누락";
  if (station.inventoryStatus === "UNAVAILABLE") return "조회 불가";
  return station.availableBikeCount !== null && station.availableBikeCount !== undefined && Number.isFinite(Number(station.availableBikeCount)) ? `${new Intl.NumberFormat("ko-KR").format(station.availableBikeCount)}대` : "확인 필요";
}

function formatCollectedAt(collectedAt) {
  if (!collectedAt) return "수집 시각 확인 필요";
  const date = new Date(collectedAt);
  if (Number.isNaN(date.getTime())) return collectedAt;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function StationMap({ station }) {
  const mapRef = useRef(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    const latitude = Number(station?.latitude);
    const longitude = Number(station?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setState("unavailable");
      return undefined;
    }

    let active = true;
    loadKakaoMapSdk()
      .then((maps) => {
        if (!active || !mapRef.current) return;
        const map = createKakaoMapAdapter(mapRef.current, maps, { latitude, longitude });
        map.setStations([{ ...station, latitude, longitude }]);
        setState("ready");
      })
      .catch(() => active && setState("unavailable"));
    return () => { active = false; };
  }, [station]);

  return (
    <section className="cr22-station__map" aria-label="대여소 위치">
      <div className="cr22-station__map-canvas" ref={mapRef} aria-hidden={state !== "ready"} />
      {state !== "ready" ? <p className="cr22-station__map-fallback">지도를 불러오지 못했습니다.</p> : null}
      <span className="cr22-station__map-caption"><ConsumerIcon name="mapPin" size={16} /> 위치 정보</span>
    </section>
  );
}

function rhythmRate(cell) {
  return Math.max(0, Math.min(1, Number(cell?.stockoutRate) || 0));
}

function RhythmPanel({ rhythm, state }) {
  const cells = useMemo(() => (Array.isArray(rhythm?.weekdayHourly) ? rhythm.weekdayHourly : []), [rhythm]);
  const [view, setView] = useState(RHYTHM_VIEWS[0][0]);
  const weekdayAverages = useMemo(() => WEEKDAY_LABELS.map((weekday, index) => {
    const rates = cells.filter((cell) => Number(cell.dayOfWeek) === index + 1).map(rhythmRate);
    return { weekday, samples: rates.length, rate: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null };
  }), [cells]);
  if (state !== "ready" || cells.length < 20) {
    return (
      <SurfaceCard title="평소 패턴">
        <p className="cr22-station__empty-copy">최근 90일의 관측 패턴을 아직 제공하지 않습니다.</p>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard title="평소 패턴" actions={<span className="cr22-station__history-label">최근 90일 관측</span>}>
      <p className="cr22-station__panel-copy">시간대별 품절 관측률입니다. 미래 예측이 아닙니다.</p>
      <div className="cr22-station__rhythm-tabs" role="tablist" aria-label="평소 패턴 보기 기준">
        {RHYTHM_VIEWS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={`cr22-station__rhythm-tab${view === key ? " is-active" : ""}`} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
      {view === "WEEKDAY" ? (
        <ul className="cr22-station__weekday-bars">
          {weekdayAverages.map(({ weekday, rate, samples }) => (
            <li key={weekday}>
              <span className="cr22-station__weekday-name">{weekday}</span>
              <span className="cr22-station__weekday-track"><i style={{ "--intensity": rate ?? 0 }} /></span>
              <span className="cr22-station__weekday-value">{samples ? `${Math.round(rate * 100)}%` : "관측 부족"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {view === "HOURLY" ? <div className="cr22-station__heatmap" aria-hidden="true">
        <span aria-hidden="true" />
        {RHYTHM_HOURS.map((hour) => <span className="cr22-station__hour" key={hour}>{hour}시</span>)}
        {WEEKDAY_LABELS.flatMap((weekday, weekdayIndex) => {
          const dayOfWeek = weekdayIndex + 1;
          return [<span className="cr22-station__weekday" key={weekday}>{weekday}</span>, ...RHYTHM_HOURS.map((hour) => {
            const cell = cells.find((item) => Number(item.dayOfWeek) === dayOfWeek && Number(item.hourOfDay) === hour);
            const rate = Math.max(0, Math.min(1, Number(cell?.stockoutRate) || 0));
            return <span className={`cr22-station__heat${cell ? "" : " is-missing"}`} key={`${dayOfWeek}-${hour}`} style={{ "--intensity": rate }} title={cell ? `${weekday} ${hour}시 · 품절 관측률 ${Math.round(rate * 100)}%` : `${weekday} ${hour}시 · 관측 부족`} />;
          })];
        })}
      </div> : null}
      <ul className="cr22-sr-only" aria-label="요일과 시간대별 품절 관측률">
        {WEEKDAY_LABELS.flatMap((weekday, weekdayIndex) => RHYTHM_HOURS.map((hour) => {
          const cell = cells.find((item) => Number(item.dayOfWeek) === weekdayIndex + 1 && Number(item.hourOfDay) === hour);
          return <li key={`${weekday}-${hour}`}>{cell ? `${weekday}요일 ${hour}시 품절 관측률 ${Math.round(Math.max(0, Math.min(1, Number(cell.stockoutRate) || 0)) * 100)}퍼센트` : `${weekday}요일 ${hour}시 관측 부족`}</li>;
        }))}
      </ul>
      {view === "HOURLY" ? <div className="cr22-station__heatmap-legend" aria-hidden="true"><span>낮음</span><i /><i /><i /><i /><span>높음</span></div> : null}
    </SurfaceCard>
  );
}

function RhythmSummary({ rhythm, state }) {
  const duration = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? `${value}분` : "관측 없음";
  const metrics = [
    ["한번 비면 보통", duration(rhythm?.stockout?.medianDurationMinutes)],
    ["3대 이상 회복까지", duration(rhythm?.stockout?.medianRecoveryMinutesToThree)],
  ];
  return (
    <SurfaceCard title="품절·회복 패턴">
      {state === "ready" ? (
        <dl className="cr22-station__metrics">
          {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      ) : <p className="cr22-station__empty-copy">품절·회복 관측 정보를 아직 제공하지 않습니다.</p>}
    </SurfaceCard>
  );
}

function NearbyPanel({ nearby, state, onNavigate }) {
  return (
    <SurfaceCard title="가까운 대여소">
      {state === "ready" && nearby.length > 0 ? <ul className="cr22-station__nearby-list">
        {nearby.map((item) => <li key={item.stationId}><span><strong>{item.name || item.stationName}</strong><small>인근 대여소</small></span><button type="button" onClick={() => onNavigate?.("station", item.stationId)}>상세 보기 <ConsumerIcon name="arrowRight" size={15} /></button></li>)}
      </ul> : <p className="cr22-station__empty-copy">가까운 대여소 정보를 아직 제공하지 않습니다.</p>}
    </SurfaceCard>
  );
}

export default function StationDetailPage({
  adapter = consumerStationAdapter,
  authState = "authenticated",
  onNavigate,
  stationId,
  user,
}) {
  const [pageState, setPageState] = useState("loading");
  const [detail, setDetail] = useState(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (authState === "anonymous") {
      window.location.assign(`/login?returnTo=${encodeURIComponent(`#station/${stationId}`)}`);
      return undefined;
    }
    if (authState !== "authenticated") return undefined;
    let active = true;
    setPageState("loading");
    adapter.load(stationId)
      .then((value) => { if (active) { setDetail(value); setPageState("success"); } })
      .catch(() => { if (active) setPageState("error"); });
    return () => { active = false; };
  }, [adapter, authState, reloadKey, stationId]);

  const toggleFavorite = useCallback(async () => {
    if (!detail || detail.favoriteState !== "ready") return;
    setFavoriteBusy(true);
    setFavoriteError("");
    try {
      const favorite = await adapter.toggleFavorite({ favorite: detail.favorite, station: detail.station });
      setDetail((current) => ({ ...current, favorite }));
    } catch {
      setFavoriteError("관심 대여소 변경에 실패했습니다.");
    } finally {
      setFavoriteBusy(false);
    }
  }, [adapter, detail]);

  const station = detail?.station;
  const status = inventoryCopy(station?.inventoryStatus);
  return (
    <ConsumerR2Theme className="cr22-station">
      <ConsumerAppHeader activeItem="ride" authState={authState} onAccount={() => onNavigate?.("mypage")} onLogin={() => window.location.assign("/login")} onNavigate={onNavigate} userName={user?.name} userTier={user?.tier} />
      <ConsumerContainer as="main" id="main-content" className="cr22-station__content">
        <button className="cr22-station__back" type="button" onClick={() => onNavigate?.("main")}><ConsumerIcon name="arrowRight" size={16} /> 검색 결과로 돌아가기</button>
        <AsyncState state={pageState} title="대여소 정보를 불러오지 못했습니다" description="잠시 후 다시 시도해 주세요." onAction={pageState === "error" ? () => setReloadKey((value) => value + 1) : undefined}>
          {pageState === "success" ? <>
          <section className="cr22-station__hero" aria-labelledby="station-title">
            <div className="cr22-station__identity"><p>STATION DETAIL</p><h1 id="station-title">{station?.name || station?.stationName}</h1><span>{station?.stationNumber ? `대여소 ${station.stationNumber}` : "대여소 정보"}</span></div>
            <div className="cr22-station__favorite-wrap"><button className={`cr22-station__favorite${detail?.favorite ? " is-active" : ""}`} type="button" aria-pressed={Boolean(detail?.favorite)} disabled={favoriteBusy || detail?.favoriteState !== "ready"} onClick={toggleFavorite}>{detail?.favorite ? "관심 대여소" : "관심 등록"}</button>{favoriteError ? <p role="alert">{favoriteError}</p> : null}</div>
          </section>

          <section className="cr22-station__overview" aria-label="현재 대여소 정보">
            <section className={`cr22-station__inventory cr22-station__inventory--${station?.inventoryStatus?.toLowerCase() || "unknown"}`} aria-label="현재 재고">
              <div><span>현재 대여 가능</span><strong>{displayCount(station || {})}</strong></div>
              <div className="cr22-station__inventory-meta"><span className="cr22-station__status">{status.label}</span><time dateTime={station?.collectedAt || undefined}>{formatCollectedAt(station?.collectedAt)}</time><p>{status.detail}</p></div>
            </section>
            <StationMap station={station} />
          </section>

          <aside className="cr22-station__history-notice"><ConsumerIcon name="info" size={18} /><span>평소 패턴은 최근 90일 관측값입니다. 미래의 대여 가능 대수를 예측하지 않습니다.</span></aside>

          <section className="cr22-station__details-grid" aria-label="대여소 관측 정보">
            <div><RhythmPanel rhythm={detail?.rhythm} state={detail?.rhythmState} /></div>
            <div className="cr22-station__side-panels"><RhythmSummary rhythm={detail?.rhythm} state={detail?.rhythmState} /><NearbyPanel nearby={detail?.nearby || []} state={detail?.nearbyState} onNavigate={onNavigate} /></div>
          </section>

          <section className="cr22-station__ride-cta" aria-label="라이딩 연결"><div><strong>이 대여소에서 바로 라이딩을 시작해 보세요</strong><span>현재 위치와 대여소 정보를 라이딩 화면으로 이어갑니다.</span></div><ConsumerButton onClick={() => onNavigate?.("ride", station?.stationId)}><ConsumerIcon name="ride" size={18} /> 이 대여소에서 라이딩 보기</ConsumerButton></section>
          </> : null}
        </AsyncState>
      </ConsumerContainer>
    </ConsumerR2Theme>
  );
}
