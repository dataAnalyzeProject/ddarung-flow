import { useState } from "react";
import "./PlaceStationSearchPage.css";
export default function PlaceStationSearchPage({
  searchStatus = "idle",
  placeResults = [],
  stationResults = [],
  onSearch,
  onContinue,
}) {
  // 모드 상태: 'ROUTE' (기본값) | 'DIRECT'
  const [mode, setMode] = useState("ROUTE");
  // 검색어 입력 상태
  const [originQuery, setOriginQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  // 대여소 및 직접 시간 관련 상태 추가
  const [stationQuery, setStationQuery] = useState("");
  const [selectedStation, setSelectedStation] = useState(null);
  const [directMinutes, setDirectMinutes] = useState("");
  // validationMessage 상태
  const [validationMessage, setValidationMessage] = useState("");
  // 선택된 결과 상태
  const [selectedOrigin, setSelectedOrigin] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  // 조건 선택 상태
  const [travelMode, setTravelMode] = useState("WALK"); // 기본값 혹은 미선택
  const [requiredBikeCount, setRequiredBikeCount] = useState(1);
  // 가장 최근 검색 정보 상태
  const [lastSearchInfo, setLastSearchInfo] = useState(null);
  // 계속하기 버튼 활성화 조건 확장
  const isContinueEnabled =
    mode === "ROUTE"
      ? Boolean(selectedOrigin && selectedDestination && travelMode)
      : Boolean(selectedStation && Number(directMinutes) > 0);

  // 공통 검색 수행 헬퍼 함수
  const executeSearch = (targetMode, field, query) => {
    const trimmed = query.trim();
    // 1) 2글자 미만 검증
    if (trimmed.length < 2) {
      setValidationMessage("검색어는 두 글자 이상 입력해 주세요.");
      return;
    }
    // 2) 검증 통과 시 에러 메시지 초기화 후 onSearch 호출
    setValidationMessage("");
    // 📍 최근 검색 정보 저장! (retry 시 사용)
    setLastSearchInfo({ mode: targetMode, field, query: trimmed });

    if (onSearch) {
      onSearch({ mode: targetMode, field, query: trimmed });
    }
  };

  // 출발지 검색
  const handleOriginSearch = () => executeSearch("ROUTE", "origin", originQuery);
  // 목적지 검색
  const handleDestinationSearch = () => executeSearch("ROUTE", "destination", destinationQuery);
  // 대여소 검색 (DIRECT 모드용)
  const handleStationSearch = () => executeSearch("DIRECT", "station", stationQuery);
  //"다시 시도" 버튼
  const handleRetry = () => {
    if (lastSearchInfo && onSearch) {
      onSearch(lastSearchInfo);
    }
  };

  // 계속하기 버튼 클릭 처리 확장
  const handleContinue = () => {
    if (!isContinueEnabled || !onContinue) return;
    if (mode === "ROUTE") {
      onContinue({
        mode: "ROUTE",
        origin: {
          placeId: selectedOrigin.placeId,
          name: selectedOrigin.name,
          latitude: selectedOrigin.latitude,
          longitude: selectedOrigin.longitude,
        },
        destination: {
          placeId: selectedDestination.placeId,
          name: selectedDestination.name,
          latitude: selectedDestination.latitude,
          longitude: selectedDestination.longitude,
        },
        travelMode,
        directMinutes: null,
        requiredBikeCount: Number(requiredBikeCount),
      });
    } else {
      onContinue({
        mode: "DIRECT",
        station: {
          stationId: selectedStation.stationId,
          name: selectedStation.name,
          latitude: selectedStation.latitude,
          longitude: selectedStation.longitude,
        },
        travelMode: "DIRECT", // 모드가 DIRECT일 때 travelMode는 "DIRECT" 고정
        directMinutes: Number(directMinutes), // 숫자 형변환
        requiredBikeCount: Number(requiredBikeCount),
      });
    }
  };

  return (
    <main className="place-search-page">
      <h1>장소·대여소 검색과 조건 선택</h1>
      {/* 탭 영역 */}
      <div className="place-search-page__tabs" role="tablist">
        <button
          type="button"
          aria-selected={mode === "ROUTE"}
          className={`place-search-page__tab ${mode === "ROUTE" ? "place-search-page__tab--active" : ""}`}
          onClick={() => setMode("ROUTE")}
        >
          경로로 찾기
        </button>
        <button
          type="button"
          aria-selected={mode === "DIRECT"}
          className={`place-search-page__tab ${mode === "DIRECT" ? "place-search-page__tab--active" : ""}`}
          onClick={() => setMode("DIRECT")}
        >
          직접 시간 입력
        </button>
      </div>
      {/* 유효성 메시지 표시 */}
      {validationMessage && (
        <p className="place-search-page__validation-message">
          {validationMessage}
        </p>
      )}
      {/* 1. idle 상태 */}
      {searchStatus === "idle" && (
        <p className="place-search-page__status-message">
          검색어를 입력해 주세요.
        </p>
      )}
      {/* 2. loading 상태 */}
      {searchStatus === "loading" && (
        <p className="place-search-page__status-message">
          검색 결과를 불러오는 중입니다.
        </p>
      )}
      {/* 3. empty 상태 */}
      {searchStatus === "empty" && (
        <p className="place-search-page__status-message">
          검색 결과가 없습니다. 다른 검색어를 입력해 주세요.
        </p>
      )}
      {/* 4. error 상태 */}
      {searchStatus === "error" && (
        <div className="place-search-page__error-container">
          <p className="place-search-page__status-message">
            검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.
          </p>
          <button type="button" aria-label="다시 시도" onClick={handleRetry}>
            다시 시도
          </button>
        </div>
      )}
      {/* 출발지 검색 결과 목록 */}
      {searchStatus === "success" && placeResults.length > 0 && placeResults.length > 0 && (
        <ul className="place-search-page__results">
          {placeResults.map((place) => (
            <li key={place.placeId}>
              <span>{place.name}</span>
              <button
                type="button"
                aria-label={`출발지로 ${place.name} 선택`}
                onClick={() => setSelectedOrigin(place)}
              >
                선택
              </button>
            </li>
          ))}
        </ul>
      )}
      {mode === "ROUTE" && (
        <section className="place-search-page__section">
          {/* 출발지 검색 */}
          <div className="place-search-page__input-group">
            <label htmlFor="origin-input">출발지 검색어</label>
            <input
              id="origin-input"
              type="text"
              aria-label="출발지 검색어"
              value={originQuery}
              onChange={(e) => setOriginQuery(e.target.value)}
            />
            <button type="button" aria-label="출발지 검색" onClick={handleOriginSearch}>
              출발지 검색
            </button>
          </div>

          {/* 목적지 검색 */}
          <div className="place-search-page__input-group">
            <label htmlFor="destination-input">목적지 검색어</label>
            <input
              id="destination-input"
              type="text"
              aria-label="목적지 검색어"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
            />
            <button type="button" aria-label="목적지 검색" onClick={handleDestinationSearch}>
              목적지 검색
            </button>
          </div>
          {/* 목적지 검색 결과 목록 */}
          {placeResults.length > 0 && (
            <ul className="place-search-page__results">
              {placeResults.map((place) => (
                <li key={place.placeId}>
                  <span>{place.name}</span>
                  <button
                    type="button"
                    aria-label={`목적지로 ${place.name} 선택`}
                    onClick={() => setSelectedDestination(place)}
                  >
                    선택
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 이동수단 및 자전거 수 선택 */}
          <div className="place-search-page__options">
            <label htmlFor="travel-mode-select">이동수단</label>
            <select
              id="travel-mode-select"
              aria-label="이동수단"
              value={travelMode}
              onChange={(e) => setTravelMode(e.target.value)}
            >
              <option value="">선택 안함</option>
              <option value="WALK">도보</option>
              <option value="PUBLIC_TRANSIT">대중교통</option>
            </select>
            <label htmlFor="bike-count-select">필요 자전거 수</label>
            <select
              id="bike-count-select"
              aria-label="필요 자전거 수"
              value={requiredBikeCount}
              onChange={(e) => setRequiredBikeCount(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((num) => (
                <option key={num} value={num}>
                  {num}대
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {mode === "DIRECT" && (
        <section className="place-search-page__section">
          {/* 대여소 검색 입력창 및 버튼 */}
          <div className="place-search-page__input-group">
            <label htmlFor="station-input">대여소 검색어</label>
            <input
              id="station-input"
              type="text"
              aria-label="대여소 검색어"
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
            />
            <button type="button" aria-label="대여소 검색" onClick={handleStationSearch}>
              대여소 검색
            </button>
          </div>
          {/* 대여소 검색 결과 목록 */}
          {stationResults.length > 0 && (
            <ul className="place-search-page__results">
              {stationResults.map((station) => (
                <li key={station.stationId}>
                  <span>{station.name}</span>
                  <button
                    type="button"
                    aria-label={`${station.name} 선택`} // 예: "102. 망원역 1번출구 앞 선택"
                    onClick={() => setSelectedStation(station)}
                  >
                    선택
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 도착 예정 분 및 필요 자전거 수 입력 영역 */}
          <div className="place-search-page__options">
            <label htmlFor="direct-minutes-input">도착 예정 분</label>
            <input
              id="direct-minutes-input"
              type="number"
              aria-label="도착 예정 분"
              value={directMinutes}
              onChange={(e) => setDirectMinutes(e.target.value)}
            />
            <label htmlFor="bike-count-select-direct">필요 자전거 수</label>
            <select
              id="bike-count-select-direct"
              aria-label="필요 자전거 수"
              value={requiredBikeCount}
              onChange={(e) => setRequiredBikeCount(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((num) => (
                <option key={num} value={num}>
                  {num}대
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {/* 하단 계속하기 버튼 */}
      <footer className="place-search-page__footer">
        <button
          type="button"
          aria-label="계속하기"
          disabled={!isContinueEnabled}
          onClick={handleContinue}
        >
          계속하기
        </button>
      </footer>
    </main>
  );
}