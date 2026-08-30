import { parseRiskMapQuery, updateRiskMapQuery } from './riskMapQuery';

test('restores valid URL filters and normalizes invalid values', () => {
  expect(parseRiskMapQuery('?horizonMinutes=120&requiredBikeCount=3&dataState=DELAYED')).toEqual({ horizonMinutes: 120, requiredBikeCount: 3, dataState: 'DELAYED' });
  expect(parseRiskMapQuery('?horizonMinutes=999&requiredBikeCount=20&dataState=BROKEN')).toEqual({ horizonMinutes: 60, requiredBikeCount: 1, dataState: null });
});

test('updates only managed filters and preserves preview context', () => {
  expect(updateRiskMapQuery({ horizonMinutes: 240, requiredBikeCount: 5, dataState: null }, '?fixture=OPS_VIEWER&riskMapFixture=SUCCESS&mode=review')).toBe('?fixture=OPS_VIEWER&riskMapFixture=SUCCESS&mode=review&horizonMinutes=240&requiredBikeCount=5');
});
