import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RiskMapPage from './RiskMapPage';
import { detailFixture, riskMapFixture } from './riskMapFixtures';

function adapter(name = 'SUCCESS') { return () => ({ loadList: ({ cursor }) => Promise.resolve(riskMapFixture(name, cursor)), loadDetail: (number) => Promise.resolve(detailFixture(number)) }); }
function noMap() { return Promise.reject(new Error('KAKAO_MAP_KEY_MISSING')); }

afterEach(() => window.history.replaceState({}, '', '/'));

test('keeps the route heading while loading and renders zero inventory without fabricating null probability', async () => {
  window.history.replaceState({}, '', '/admin-v2-preview/ops/risk-map?horizonMinutes=120&requiredBikeCount=2');
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={noMap} />);
  expect(screen.getByRole('heading', { name: '수급 위험 지도' })).toBeInTheDocument();
  await screen.findByText('현재 0대');
  expect(screen.getAllByText('판단 정보 부족').length).toBeGreaterThan(0);
  expect(screen.getByRole('combobox', { name: '예측 horizon' }).value).toBe('120');
});

test('selects a public station number and opens detail drawer', async () => {
  render(<RiskMapPage createDataAdapter={adapter()} loadMapSdk={noMap} />);
  const station = await screen.findByRole('button', { name: /광화문역 1번 출구/ });
  fireEvent.click(station);
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  expect(screen.getByText('대여소 번호')).toBeInTheDocument();
});

test('keeps the list available when map provider fails and supports cursor append', async () => {
  render(<RiskMapPage createDataAdapter={adapter('PAGINATED')} loadMapSdk={noMap} />);
  await screen.findByText('더 보기');
  await screen.findByText(/지도 사용 불가/);
  fireEvent.click(screen.getByText('더 보기'));
  await screen.findByText('을지로입구역');
});
