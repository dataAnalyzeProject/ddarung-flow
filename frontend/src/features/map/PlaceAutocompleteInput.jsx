import { useEffect, useState } from "react";
import { searchPlaces } from "./kakaoMapApi";

export default function PlaceAutocompleteInput({ iconSrc, label, value, placeholder, onChange, onSelect }) {
  const [results, setResults] = useState([]);
  const [state, setState] = useState("idle");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || !open) {
      setResults([]);
      setState("idle");
      return undefined;
    }
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const data = await searchPlaces(query);
        setResults(data.places || []);
        setState(data.places?.length ? "success" : "empty");
      } catch {
        setResults([]);
        setState("error");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, open]);

  const choose = (place) => {
    onSelect(place);
    setResults([]);
    setState("idle");
    setOpen(false);
  };

  return (
    <label className="main-place-field">
      <span>{label}</span>
      <span className="main-input-wrap">
        <input value={value} onFocus={() => setOpen(true)} onChange={(event) => { setOpen(true); onChange(event.target.value); }} placeholder={placeholder} />
        {iconSrc ? <img className="main-place-icon" src={iconSrc} alt="" aria-hidden="true" /> : <b aria-hidden="true" />}
        {open && value.trim().length >= 2 && <section className="main-place-results" aria-label={`${label} 검색 결과`}>
          {state === "loading" && <small>검색 중</small>}
          {state === "empty" && <small>검색 결과가 없습니다.</small>}
          {state === "error" && <small>장소 검색에 실패했습니다.</small>}
          {results.length > 0 && <ul>{results.map((place) => <li key={place.placeId}><button type="button" onClick={() => choose(place)}>{place.name}<small>{place.address}</small></button></li>)}</ul>}
        </section>}
      </span>
    </label>
  );
}
