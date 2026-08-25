// frontend/src/features/modelops/ModelOpsPage.jsx
import React, { useState } from 'react';
import './ModelOpsPage.css';

export const ACTION_LABELS = {
  validate: '검증 실행 (Validate)',
  approve: '승인 (Approve)',
  reject: '반려 (Reject)',
  activate: '운영 배포 (Activate)',
  rollback: '롤백 (Rollback)',
};

export default function ModelOpsPage({
  status = 'success',
  models = [],
  pendingAction = null,
  onAction,
  onRetry,
}) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'detail' | 'history'
  const [selectedModelId, setSelectedModelId] = useState(
    models && models.length > 0 ? models[0].modelId : null
  );
  const [dialogState, setDialogState] = useState(null); // { modelId, type, version } | null

  // 1. 상태별 화면 분기 (loading, empty, error, forbidden)
  if (status === 'loading') {
    return (
      <main className="modelops-container modelops-container--status" aria-busy="true">
        <div className="modelops-status-box">
          <div className="modelops-spinner" role="progressbar" aria-label="모델 정보 로딩 중" />
          <h2 className="modelops-status-title">모델 정보를 불러오는 중입니다...</h2>
          <p className="modelops-status-desc">잠시만 기다려 주세요.</p>
        </div>
      </main>
    );
  }

  if (status === 'forbidden') {
    return (
      <main className="modelops-container modelops-container--status">
        <div className="modelops-status-box modelops-status-box--forbidden">
          <span className="modelops-status-icon" role="img" aria-label="접근 거부">🚫</span>
          <h2 className="modelops-status-title">접근 권한이 없습니다 (403 Forbidden)</h2>
          <p className="modelops-status-desc">ModelOps 관리자 권한이 필요합니다.</p>
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="modelops-container modelops-container--status">
        <div className="modelops-status-box modelops-status-box--error">
          <span className="modelops-status-icon" role="img" aria-label="오류">⚠️</span>
          <h2 className="modelops-status-title">모델 정보를 불러오는 데 실패했습니다</h2>
          <p className="modelops-status-desc">네트워크 오류가 발생했습니다. 다시 시도해 주세요.</p>
          <button
            type="button"
            className="modelops-btn modelops-btn--primary"
            onClick={() => onRetry?.()}
          >
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  if (status === 'empty' || !models || models.length === 0) {
    return (
      <main className="modelops-container modelops-container--status">
        <div className="modelops-status-box">
          <span className="modelops-status-icon" role="img" aria-label="빈 목록">📦</span>
          <h2 className="modelops-status-title">등록된 모델이 없습니다</h2>
          <p className="modelops-status-desc">새로운 예측 모델을 등록해 주세요.</p>
        </div>
      </main>
    );
  }

  // 선택된 모델 데이터 추출
  const selectedModel =
    models.find((m) => m.modelId === selectedModelId) || models[0];

  // 모든 모델의 히스토리를 시간순으로 모음
  const allHistories = models
    .flatMap((m) =>
      (m.history || []).map((h) => ({
        ...h,
        modelId: m.modelId,
        version: m.version,
      }))
    )
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Action Dialog 열기
  const handleOpenDialog = (modelId, type, version) => {
    setDialogState({ modelId, type, version });
  };

  // Dialog 확인 시 콜백 호출
  const handleConfirmDialog = () => {
    if (!dialogState) return;
    if (isActionPending(dialogState.modelId, dialogState.type)) return;
    onAction?.({ modelId: dialogState.modelId, type: dialogState.type });
    setDialogState(null);
  };

  // Dialog 취소 시 콜백 미호출
  const handleCancelDialog = () => {
    setDialogState(null);
  };

  // 특정 액션의 pending 여부 검사
  const isActionPending = (modelId, type) => {
    return (
      pendingAction &&
      pendingAction.modelId === modelId &&
      pendingAction.type === type
    );
  };

  return (
    <main className="modelops-container">
      {/* 상단 헤더 */}
      <header className="modelops-header">
        <div>
          <span className="modelops-badge">ADMIN MODELOPS</span>
          <h1 className="modelops-title">AI 모델 생애주기 및 승격 관리</h1>
        </div>
        <p className="modelops-header-desc">
          예측 모델의 성능 검증, 승인, 운영 배포 및 롤백을 안전하게 제어합니다.
        </p>
      </header>

      {/* 3대 탭 네비게이션 */}
      <nav className="modelops-tabs" role="tablist" aria-label="ModelOps 탭 메뉴">
        <button
          type="button"
          role="tab"
          id="tab-list"
          aria-selected={activeTab === 'list'}
          aria-controls="panel-list"
          className={`modelops-tab-btn ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          모델 목록 ({models.length})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-detail"
          aria-selected={activeTab === 'detail'}
          aria-controls="panel-detail"
          className={`modelops-tab-btn ${activeTab === 'detail' ? 'active' : ''}`}
          onClick={() => setActiveTab('detail')}
        >
          상세 메트릭 ({selectedModel.version})
        </button>
        <button
          type="button"
          role="tab"
          id="tab-history"
          aria-selected={activeTab === 'history'}
          aria-controls="panel-history"
          className={`modelops-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          승격 이력 ({allHistories.length})
        </button>
      </nav>

      {/* 탭 1: 모델 목록 */}
      {activeTab === 'list' && (
        <section
          id="panel-list"
          role="tabpanel"
          aria-labelledby="tab-list"
          className="modelops-panel"
        >
          <div className="modelops-table-wrapper">
            <table className="modelops-table">
              <thead>
                <tr>
                  <th scope="col">버전</th>
                  <th scope="col">상태</th>
                  <th scope="col">Brier Score</th>
                  <th scope="col">Shortage Recall</th>
                  <th scope="col">최신성</th>
                  <th scope="col">승격 게이트</th>
                  <th scope="col">작업</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr
                    key={model.modelId}
                    className={model.modelId === selectedModelId ? 'selected-row' : ''}
                  >
                    <td>
                      <button
                        type="button"
                        className="modelops-link-btn"
                        onClick={() => {
                          setSelectedModelId(model.modelId);
                          setActiveTab('detail');
                        }}
                      >
                        <strong>{model.version}</strong>
                      </button>
                    </td>
                    <td>
                      <span className={`modelops-state-tag modelops-state-tag--${model.state.toLowerCase()}`}>
                        {model.state}
                      </span>
                    </td>
                    <td>{model.metrics?.brier?.toFixed(3) ?? '-'}</td>
                    <td>
                      {model.metrics?.shortageRecall != null
                        ? `${(model.metrics.shortageRecall * 100).toFixed(1)}%`
                        : '-'}</td>
                    <td>{model.metrics?.freshness ?? '-'}</td>
                    <td>
                      {model.promotionGate?.passed ? (
                        <span className="modelops-gate-badge modelops-gate-badge--pass">통과 (Pass)</span>
                      ) : (
                        <span className="modelops-gate-badge modelops-gate-badge--fail">미달 (Fail)</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="modelops-btn modelops-btn--sm"
                        onClick={() => {
                          setSelectedModelId(model.modelId);
                          setActiveTab('detail');
                        }}
                      >
                        상세보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 탭 2: 상세 메트릭 및 승격 게이트 / 액션 */}
      {activeTab === 'detail' && selectedModel && (
        <section
          id="panel-detail"
          role="tabpanel"
          aria-labelledby="tab-detail"
          className="modelops-panel"
        >
          {/* 모델 기본 정보 & 상태 */}
          <div className="modelops-detail-header">
            <div>
              <div className="modelops-detail-title-row">
                <h2>{selectedModel.version}</h2>
                <span className={`modelops-state-tag modelops-state-tag--${selectedModel.state.toLowerCase()}`}>
                  {selectedModel.state}
                </span>
                <span className="modelops-model-id">ID: {selectedModel.modelId}</span>
              </div>
            </div>

            {/* 다른 모델 선택 셀렉트박스 */}
            <label className="modelops-select-label">
              모델 전환:
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="modelops-select"
                aria-label="상세 조회 모델 선택"
              >
                {models.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.version} ({m.state})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 3대 메트릭 카드 */}
          <div className="modelops-metrics-grid">
            <article className="modelops-metric-card">
              <span className="modelops-metric-label">Brier Score (정밀도)</span>
              <strong className="modelops-metric-value">{selectedModel.metrics?.brier ?? '-'}</strong>
              <span className="modelops-metric-hint">0에 가까울수록 예측 확률 정확</span>
            </article>
            <article className="modelops-metric-card">
              <span className="modelops-metric-label">Shortage Recall (부족 재현율)</span>
              <strong className="modelops-metric-value">
                {selectedModel.metrics?.shortageRecall != null ? `${(selectedModel.metrics.shortageRecall * 100).toFixed(1)}%` : '-'}
              </strong>
              <span className="modelops-metric-hint">부족 발생 구간 탐지율</span>
            </article>
            <article className="modelops-metric-card">
              <span className="modelops-metric-label">Freshness (최신성)</span>
              <strong className="modelops-metric-value">{selectedModel.metrics?.freshness ?? '-'}</strong>
              <span className="modelops-metric-hint">마지막 배치 학습 갱신 시점</span>
            </article>
          </div>

          {/* 승격 게이트 결과 및 사유 코드 */}
          <div className="modelops-gate-section">
            <h3>승격 게이트 검증 결과</h3>
            <div className="modelops-gate-result">
              <p>
                <strong>게이트 상태: </strong>
                {selectedModel.promotionGate?.passed ? (
                  <span className="modelops-gate-badge modelops-gate-badge--pass">통과 (Passed)</span>
                ) : (
                  <span className="modelops-gate-badge modelops-gate-badge--fail">미달 (Failed)</span>
                )}
              </p>
              <div className="modelops-reasons">
                <strong>사유 코드 (Reason Codes):</strong>
                <ul>
                  {selectedModel.promotionGate?.reasonCodes?.map((code) => (
                    <li key={code}><code>{code}</code></li>
                  )) || <li>사유 코드 없음</li>}
                </ul>
              </div>
            </div>
          </div>

          {/* 5대 액션 제어 버튼 바 */}
          <div className="modelops-actions-section">
            <h3>모델 제어 액션</h3>
            <div className="modelops-actions-bar">
              {Object.keys(ACTION_LABELS).map((actionType) => {
                const isPending = isActionPending(selectedModel.modelId, actionType);
                return (
                  <button
                    key={actionType}
                    type="button"
                    className={`modelops-btn modelops-btn--action modelops-btn--${actionType}`}
                    disabled={isPending}
                    onClick={() => handleOpenDialog(selectedModel.modelId, actionType, selectedModel.version)}
                  >
                    {isPending ? '처리 중...' : ACTION_LABELS[actionType]}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 탭 3: 승격 이력 */}
      {activeTab === 'history' && (
        <section
          id="panel-history"
          role="tabpanel"
          aria-labelledby="tab-history"
          className="modelops-panel"
        >
          {allHistories.length === 0 ? (
            <div className="modelops-empty-history">
              <p>기록된 승격 이력이 없습니다.</p>
            </div>
          ) : (
            <div className="modelops-timeline">
              {allHistories.map((hist, idx) => (
                <div key={idx} className="modelops-timeline-item">
                  <div className="modelops-timeline-badge" />
                  <div className="modelops-timeline-content">
                    <div className="modelops-timeline-header">
                      <strong>{hist.version}</strong>
                      <span className="modelops-timeline-action">{hist.action.toUpperCase()}</span>
                      <span className="modelops-timeline-time">{hist.timestamp}</span>
                    </div>
                    <p className="modelops-timeline-desc">
                      상태 변경: <code>{hist.fromState}</code> ➔ <code>{hist.toState}</code> (작업자: {hist.actor})
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 확인 Action Dialog (모달) */}
      {dialogState && (
        <div
          className="modelops-dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modelops-dialog-title"
        >
          <div className="modelops-dialog-card">
            <h3 id="modelops-dialog-title" className="modelops-dialog-title">
              {ACTION_LABELS[dialogState.type]} 실행 확인
            </h3>
            <p className="modelops-dialog-body">
              모델 <strong>{dialogState.version}</strong> (ID: {dialogState.modelId})에 대해{' '}
              <strong>[{dialogState.type.toUpperCase()}]</strong> 작업을 실행하시겠습니까?
            </p>
            <div className="modelops-dialog-actions">
              <button
                type="button"
                className="modelops-btn modelops-btn--secondary"
                onClick={handleCancelDialog}
              >
                취소
              </button>
              <button
                type="button"
                className="modelops-btn modelops-btn--primary"
                disabled={isActionPending(dialogState.modelId, dialogState.type)}
                onClick={handleConfirmDialog}
              >
                {isActionPending(dialogState.modelId, dialogState.type) ? '처리 중...' : '확인 및 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
