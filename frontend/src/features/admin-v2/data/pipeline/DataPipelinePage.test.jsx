import { render, screen } from '@testing-library/react';
import DataPipelinePage from './DataPipelinePage';

test('renders explicit not-instrumented stages beside source-backed stages', async () => {
  const result = { referenceTime: '2026-09-08T02:00:00Z', dataState: 'PARTIAL', stages: [
    { stageId: 'SOURCE', label: '서울시·기상 원천', dataState: 'NOT_INSTRUMENTED', reasonCode: 'AIRFLOW_SOURCE_NOT_CONNECTED' },
    { stageId: 'SERVING', label: 'Serving DB', dataState: 'PARTIAL', processedCount: 10, passedCount: 9, failedCount: 1, sourceReference: 'station_inventory_current' },
    { stageId: 'PROFILE', label: 'Profile 생성', dataState: 'PARTIAL', processedCount: 10, passedCount: 10, failedCount: 0, sourceReference: 'station_rhythm_profiles', reasonCode: 'PROFILE_FRESHNESS_BOUNDARY_NOT_DEFINED' },
  ] };
  render(<DataPipelinePage createAdapter={() => ({ load: () => Promise.resolve(result) })} />);
  expect(await screen.findByRole('heading', { name: '수집·가공 파이프라인' })).toBeInTheDocument();
  expect(screen.getByText('계측되지 않음')).toBeInTheDocument();
  expect(screen.getByText('AIRFLOW_SOURCE_NOT_CONNECTED')).toBeInTheDocument();
  expect(screen.getByText('station_inventory_current')).toBeInTheDocument();
  expect(screen.getByText('PROFILE_FRESHNESS_BOUNDARY_NOT_DEFINED')).toBeInTheDocument();
});
