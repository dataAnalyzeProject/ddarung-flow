import { fireEvent, render, screen, within } from '@testing-library/react';
import DataPipelinePage from './DataPipelinePage';

test('renders only the source-backed live inventory stages', async () => {
  const result = { referenceTime: '2026-09-08T02:00:00Z', dataState: 'PARTIAL', stages: [
    { stageId: 'SOURCE', label: '서울시 재고 수집', dataState: 'NORMAL', processedCount: 10, passedCount: 10, failedCount: 0, sourceReference: 'SeoulBikeApiClient' },
    { stageId: 'QUALITY', label: '완전성·값 검증', dataState: 'NORMAL', processedCount: 10, passedCount: 10, failedCount: 0, sourceReference: 'inventory_current_refresher' },
    { stageId: 'SERVING', label: '현재 재고 게시', dataState: 'PARTIAL', processedCount: 10, passedCount: 9, failedCount: 1, sourceReference: 'station_inventory_current', reasonCode: 'SOURCE_STATIONS_MISSING' },
  ] };
  render(<DataPipelinePage createAdapter={() => ({ load: () => Promise.resolve(result) })} />);
  expect(await screen.findByRole('heading', { name: '수집·가공 파이프라인' })).toBeInTheDocument();
  expect(screen.queryByText('계측되지 않음')).not.toBeInTheDocument();
  expect(screen.queryByText(/앱 서비스가 읽을 factual ledger/)).not.toBeInTheDocument();
  expect(screen.getByText(/실서비스 현재 재고 갱신 경로/)).toBeInTheDocument();
  expect(screen.getByText('station_inventory_current')).toBeInTheDocument();
  expect(screen.getByText('SOURCE_STATIONS_MISSING')).toBeInTheDocument();
});

const pipeline = { referenceTime: '2026-09-08T02:00:00Z', dataState: 'PARTIAL', stages: [
  { stageId: 'SOURCE', label: '서울시 재고 수집', dataState: 'NORMAL', processedCount: 10, passedCount: 10, failedCount: 0, sourceReference: 'SeoulBikeApiClient' },
  { stageId: 'QUALITY', label: '완전성·값 검증', dataState: 'NORMAL', processedCount: 10, passedCount: 10, failedCount: 0, sourceReference: 'inventory_current_refresher' },
  { stageId: 'SERVING', label: '현재 재고 게시', dataState: 'PARTIAL', processedCount: 10, passedCount: 9, failedCount: 1, sourceReference: 'station_inventory_current' },
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
    .toEqual(['정상', '정상', '운영 중 · 일부 데이터 제외']);
});

test('expands a stage on click without changing what it reports', async () => {
  render(<DataPipelinePage createAdapter={() => ({ load: () => Promise.resolve(pipeline) })} />);
  const stage = (await screen.findByRole('heading', { name: '현재 재고 게시' })).closest('details');
  fireEvent.click(stage.querySelector('summary'));
  expect(stage.open).toBe(true);
  expect(within(stage).getByText('station_inventory_current')).toBeVisible();
  expect(within(stage).getByText('실패/미완료')).toBeVisible();
});
