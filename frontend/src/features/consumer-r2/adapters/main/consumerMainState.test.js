import { loadPendingPrediction, PENDING_PREDICTION_KEY } from "../../../login/loginStorage.js";
import { restoreConsumerMainInput, saveConsumerMainPendingPrediction, toConsumerMainSearchInput } from "./consumerMainState.js";

const search = {
  origin: { providerId: "kakao-origin", displayName: "출발 장소", latitude: 37.5, longitude: 127 },
  destination: { providerId: "kakao-destination", displayName: "대여 희망 지역", latitude: 37.6, longitude: 127.1 },
  travelMode: "WALK",
  requiredBikeCount: 3,
};

beforeEach(() => sessionStorage.clear());

test("keeps provider selections through the existing pending login reader without saving result evidence", () => {
  const restored = restoreConsumerMainInput(search);
  saveConsumerMainPendingPrediction({ ...restored.input, probability: 0.9 }, {
    ...restored.places,
    origin: { ...restored.places.origin, routeDetail: { durationSeconds: 600 } },
  });

  const pending = loadPendingPrediction();
  expect(pending.routePlaces.origin.providerId).toBe("kakao-origin");
  const input = restoreConsumerMainInput(pending);
  expect(toConsumerMainSearchInput(input.input, input.places)).toEqual(search);
  expect(sessionStorage.getItem(PENDING_PREDICTION_KEY)).not.toMatch(/probability|routeDetail|durationSeconds/);
});

test("preserves unfinished input text and requires missing provider selections to be selected again", () => {
  const restored = restoreConsumerMainInput({
    origin: "서울역", destination: "입력 중", travelMode: "WALK", requiredBikeCount: 2,
    routePlaces: { origin: { name: "서울역", latitude: 37.5, longitude: 127 } },
  });
  expect(restored).toEqual({
    input: { origin: "서울역", destination: "입력 중", travelMode: "WALK", requiredBikeCount: 2 },
    places: { origin: null, destination: null },
  });
  expect(toConsumerMainSearchInput(restored.input, restored.places)).toBeNull();
});

test("normalizes actual place search IDs and rejects missing or invalid coordinates", () => {
  const restored = restoreConsumerMainInput({
    ...search,
    origin: { placeId: "kakao-origin", name: "출발 장소", latitude: 37.5, longitude: 127 },
  });
  expect(toConsumerMainSearchInput(restored.input, restored.places)).toEqual(search);
  for (const latitude of [null, undefined, "", "37.5", NaN, 91]) {
    expect(restoreConsumerMainInput({ ...search, origin: { ...search.origin, latitude } }).places.origin).toBeNull();
  }
});
