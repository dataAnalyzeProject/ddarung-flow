import { fireEvent, render, screen, within } from '@testing-library/react';
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

const pipeline = { referenceTime: '2026-09-08T02:00:00Z', dataState: 'PARTIAL', stages: [
  { stageId: 'SOURCE', label: '서울시·기상 원천', dataState: 'NOT_INSTRUMENTED', reasonCode: 'AIRFLOW_SOURCE_NOT_CONNECTED' },
  { stageId: 'RAW', label: 'Raw 저장', dataState: 'NOT_INSTRUMENTED', reasonCode: 'RAW_LEDGER_NOT_CONNECTED' },
  { stageId: 'SERVING', label: 'Serving DB', dataState: 'PARTIAL', processedCount: 10, passedCount: 9, failedCount: 1, sourceReference: 'station_inventory_current' },
] };

test('collapses every stage by default while keeping its number, id, and state visible', async () => {
  render(<DataPipelinePage createAdapter={() => ({ load: () => Promise.resolve(pipeline) })} />);
  expect(await screen.findByRole('heading', { name: '수집·가공 파이프라인' })).toBeInTheDocument();

  const stages = pipeline.stages.map((stage) => screen.getByRole('heading', { name: stage.label }).closest('details'));
  stages.forEach((stage, index) => {
    expect(stage.open).toBe(false);
    const summary = stage.querySelector('summary');
    expect(within(summary).getByText(String(index + 1).padStart(2, '0'))).toBeVisible();
    expect(within(summary).getByText(pipeline.stages[index].stageId)).toBeVisible();
    expect(within(summary).getByRole('mark')).toBeVisible();
  });
  expect(stages.map((stage) => within(stage.querySelector('summary')).getByRole('mark').textContent))
    .toEqual(['계측되지 않음', '계측되지 않음', '일부 사용 가능']);
});

test('expands a stage on click without changing what it reports', async () => {
  render(<DataPipelinePage createAdapter={() => ({ load: () => Promise.resolve(pipeline) })} />);
  const stage = (await screen.findByRole('heading', { name: 'Serving DB' })).closest('details');
  fireEvent.click(stage.querySelector('summary'));
  expect(stage.open).toBe(true);
  expect(within(stage).getByText('station_inventory_current')).toBeVisible();
  expect(within(stage).getByText('실패/미완료')).toBeVisible();
});
