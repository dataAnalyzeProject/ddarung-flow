import heroBackground from "../../../assets/main/hero-search-background-v3.png";
import destinationIcon from "../../../assets/main/search-destination-icon-v1.png";
import walkIcon from "../../../assets/main/mode-walk-icon-v1.png";
import transitIcon from "../../../assets/main/mode-transit-icon-v1.png";
import predictIcon from "../../../assets/main/predict-availability-icon-v1.png";
import originIcon from "../../../assets/main/search-origin-icon-v1.png";
import PlaceAutocompleteInput from "../../map/PlaceAutocompleteInput";

export default function MainSearchForm({ serviceData, input, onInputChange, onPlaceSelect, onPredict }) {
  return <section className="main-search">
    <img className="main-hero-scene" src={heroBackground} alt="" aria-hidden="true" />
    <div className="main-hero-copy"><h1>도착할 때 빌릴 수 있는<br /><em>따릉이를 미리 확인</em>하세요.</h1><p>예상 도착시간 기준 대여 가능 여부를 알려드립니다.</p></div>
    <div className="main-fields"><PlaceAutocompleteInput iconSrc={originIcon} label={serviceData.originLabel} value={input.origin} onChange={(value) => onInputChange("origin", value)} onSelect={(place) => onPlaceSelect("origin", place)} placeholder={serviceData.originPlaceholder} /><i aria-hidden="true">→</i><PlaceAutocompleteInput iconSrc={destinationIcon} label={serviceData.destinationLabel} value={input.destination} onChange={(value) => onInputChange("destination", value)} onSelect={(place) => onPlaceSelect("destination", place)} placeholder={serviceData.destinationPlaceholder} /><label className="main-bike-count"><span>필요 자전거 수</span><select aria-label="필요 자전거 수" value={input.requiredBikeCount ?? 1} onChange={(event) => onInputChange("requiredBikeCount", Number(event.target.value))}>{[1, 2, 3, 4, 5].map((num) => <option key={num} value={num}>{num}대</option>)}</select></label></div>
    <div className="main-actions"><span>이동 수단</span><div className="main-mode-buttons">{serviceData.modes.map((mode) => <button className={mode === input.travelMode ? "active" : ""} key={mode} type="button" onClick={() => onInputChange("travelMode", mode)}><img src={mode === "도보" ? walkIcon : transitIcon} alt="" aria-hidden="true" />{mode}</button>)}</div><button aria-label={serviceData.predictButton} className="main-submit" type="button" onClick={onPredict}><img src={predictIcon} alt="" aria-hidden="true" />{serviceData.predictButton}</button></div>
  </section>;
}

