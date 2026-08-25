// frontend/src/features/modelops/ModelOpsPage.test.jsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelOpsPage from './ModelOpsPage';
import { modelOpsFixture } from './data/modelOpsFixture';
// 요구사항 명세서에 정의된 5대 필수 액션
const ACTION_ITEMS = [
  { type: 'validate', label: '검증 실행 (Validate)' },
  { type: 'approve', label: '승인 (Approve)' },
  { type: 'reject', label: '반려 (Reject)' },
  { type: 'activate', label: '운영 배포 (Activate)' },
  { type: 'rollback', label: '롤백 (Rollback)' },
];

describe('ModelOpsPage 단위 및 계약 정밀 테스트', () => {
  // -------------------------------------------------------------------------
  // 1. 상태 5종 렌더링 검증 (loading, forbidden, error, empty, success)
  // -------------------------------------------------------------------------
  test('5대 상태(loading, forbidden, error, empty, success)가 각각 올바른 화면으로 분기 렌더링된다', () => {
    // 1-1. loading
    const { rerender } = render(<ModelOpsPage status="loading" />);
    expect(screen.getByRole('progressbar', { name: '모델 정보 로딩 중' })).toBeInTheDocument();
    // 1-2. forbidden
    rerender(<ModelOpsPage status="forbidden" />);
    expect(screen.getByText(/403 Forbidden/)).toBeInTheDocument();
    // 1-3. error 및 onRetry
    const onRetry = jest.fn();
    rerender(<ModelOpsPage status="error" onRetry={onRetry} />);
    expect(screen.getByText(/실패했습니다/)).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    // 1-4. empty
    rerender(<ModelOpsPage status="empty" models={[]} />);
    expect(screen.getByText('등록된 모델이 없습니다')).toBeInTheDocument();
    // 1-5. success
    rerender(<ModelOpsPage status="success" models={modelOpsFixture} />);
    expect(screen.getByRole('tab', { name: `모델 목록 (${modelOpsFixture.length})` })).toBeInTheDocument();
  });
  // -------------------------------------------------------------------------
  // 2. 목록 클릭 시 상세 모델 선택 연동 (selectedModelId 전환 검증)
  // -------------------------------------------------------------------------
  test('목록에서 특정 모델의 버전을 클릭하면 상세 탭으로 전환되며 해당 모델의 메트릭이 표시된다', () => {
    render(<ModelOpsPage status="success" models={modelOpsFixture} />);
    // 두 번째 모델(v2.2.0-rc1) 클릭
    const targetModel = modelOpsFixture[1];
    const modelLink = screen.getByRole('button', { name: targetModel.version });
    userEvent.click(modelLink);
    // 상세 탭 활성화 및 targetModel 데이터 렌더링 확인
    expect(screen.getByRole('tab', { name: new RegExp(targetModel.version) })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 2, name: targetModel.version })).toBeInTheDocument();
    expect(screen.getByText(targetModel.metrics.freshness)).toBeInTheDocument();
  });
  // -------------------------------------------------------------------------
  // 3. 명세상 5대 액션 버튼 존재 및 Dialog 실행/취소 payload 검증
  // -------------------------------------------------------------------------
  test('상세 탭에 5대 액션 버튼이 모두 렌더링되고, Dialog 확인 시 payload가 전달된다', () => {
    const onAction = jest.fn();
    render(<ModelOpsPage status="success" models={modelOpsFixture} onAction={onAction} />);
    userEvent.click(screen.getByRole('tab', { name: /상세 메트릭/ }));
    // 3-1. 5대 액션 버튼 존재 확인
    ACTION_ITEMS.forEach(({ label }) => {
      const actionBtn = screen.getByRole('button', { name: label });
      expect(actionBtn).toBeInTheDocument();
      expect(actionBtn).not.toBeDisabled();
    });
    // 3-2. validate 클릭 -> 취소 시 콜백 미호출
    const validateBtn = screen.getByRole('button', { name: '검증 실행 (Validate)' });
    userEvent.click(validateBtn);
    const dialog = screen.getByRole('dialog');
    userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    // 3-3. rollback 클릭 -> 확인 시 onAction 호출
    const rollbackBtn = screen.getByRole('button', { name: '롤백 (Rollback)' });
    userEvent.click(rollbackBtn);
    const rollbackDialog = screen.getByRole('dialog');
    userEvent.click(within(rollbackDialog).getByRole('button', { name: '확인 및 실행' }));
    expect(onAction).toHaveBeenCalledWith({
      modelId: modelOpsFixture[0].modelId,
      type: 'rollback',
    });
  });

  // -------------------------------------------------------------------------
  // 4. pendingAction 계약 검증 (동일 액션만 disabled, 다른 액션은 활성)
  // -------------------------------------------------------------------------
  test('pendingAction이 주어지면 해당 모델의 동일한 액션 버튼만 비활성화되고 다른 액션은 클릭 가능하다', () => {
    const currentModel = modelOpsFixture[0];
    render(
      <ModelOpsPage
        status="success"
        models={modelOpsFixture}
        pendingAction={{ modelId: currentModel.modelId, type: 'activate' }}
      />
    );
    userEvent.click(screen.getByRole('tab', { name: /상세 메트릭/ }));
    // pending 중인 activate 버튼은 disabled
    const activateBtn = screen.getByRole('button', { name: '처리 중...' });
    expect(activateBtn).toBeDisabled();
    // 다른 4개 액션 버튼들은 정상 활성화(enabled)
    const otherActionItems = ACTION_ITEMS.filter(({ type }) => type !== 'activate');
    otherActionItems.forEach(({ label }) => {
      const btn = screen.getByRole('button', { name: label });
      expect(btn).not.toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. 이력 탭의 시간순(최신순) 정렬 렌더링 검증
  // -------------------------------------------------------------------------
  // 5-1. 기본 이력 정보 렌더링 검증
  test('승격 이력 탭에서 각 이력의 버전, 액션 배지, 작업자, 상태 변경 내역이 정상 렌더링된다', () => {
    render(<ModelOpsPage status="success" models={modelOpsFixture} />);
    userEvent.click(screen.getByRole('tab', { name: /승격 이력/ }));
    expect(screen.getAllByText('v2.1.0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ACTIVATE').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/작업자: admin-1/).length).toBeGreaterThanOrEqual(1);
    // 1. timelineItems 정의
    const timelineItems = screen.getAllByText(/상태 변경:/);
    // 2. 1위(최신) 항목인 VALIDATED ➔ APPROVED 검증
    expect(timelineItems[0]).toHaveTextContent('VALIDATED');
    expect(timelineItems[0]).toHaveTextContent('APPROVED');
  });
  // 5-2. 시간순(최신순 내림차순) 정렬 로직 검증
  test('시간이 뒤섞인 이력 데이터가 들어와도 항상 최신 시간순(내림차순)으로 정렬되어 렌더링된다', () => {
    const mockMixedModels = [
      {
        modelId: 'model-a',
        version: 'v1.0.0',
        state: 'ACTIVE',
        history: [
          { timestamp: '2026-08-20 10:00:00', action: 'create', fromState: 'NONE', toState: 'DRAFT', actor: 'sys' },
          { timestamp: '2026-08-25 15:00:00', action: 'activate', fromState: 'APPROVED', toState: 'ACTIVE', actor: 'admin' }, // 1위 (최신)
          { timestamp: '2026-08-22 12:00:00', action: 'approve', fromState: 'VALIDATED', toState: 'APPROVED', actor: 'admin' }, // 2위
        ],
      },
    ];
    render(<ModelOpsPage status="success" models={mockMixedModels} />);
    userEvent.click(screen.getByRole('tab', { name: /승격 이력/ }));
    const timeList = screen.getAllByText(/2026-08-/);
    expect(timeList).toHaveLength(3);
    expect(timeList[0]).toHaveTextContent('2026-08-25 15:00:00'); // 1위
    expect(timeList[1]).toHaveTextContent('2026-08-22 12:00:00'); // 2위
    expect(timeList[2]).toHaveTextContent('2026-08-20 10:00:00'); // 3위
  });
  // 5-3. 이력이 없는 경우 예외 처리 검증
  test('이력이 없는 모델 데이터가 들어와도 승격 이력 탭이 오류 없이 안전하게 0건으로 렌더링된다', () => {
    const mockEmptyHistoryModel = [
      {
        modelId: 'model-empty',
        version: 'v0.0.1',
        state: 'DRAFT',
        history: [], // 빈 이력
      },
    ];
    render(<ModelOpsPage status="success" models={mockEmptyHistoryModel} />);
    const historyTab = screen.getByRole('tab', { name: '승격 이력 (0)' });
    userEvent.click(historyTab);

    expect(screen.getByText('기록된 승격 이력이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/상태 변경:/)).not.toBeInTheDocument();
  });
});