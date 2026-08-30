import { formatDistance, formatProbability, formatWalkDuration } from './journeyPresentation';

test('formats Core and legacy probabilities without turning missing values into zero', () => {
  expect(formatProbability(0.82)).toBe('82%');
  expect(formatProbability(0.705)).toBe('70.5%');
  expect(formatProbability(77)).toBe('77%');
  expect(formatProbability(null)).toBeNull();
  expect(formatProbability(Number.NaN)).toBeNull();
});

test('formats supplied access and distance values for display only', () => {
  expect(formatWalkDuration(421)).toBe('약 8분');
  expect(formatDistance(450.4)).toBe('450m');
});
