import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SystemSupportPage from './SystemSupportPage';

const item = { key: 'local-question-alpha', title: '대여 문의', body: '문의 본문', category: 'SERVICE', visibility: 'PUBLIC', status: 'PENDING', createdAt: '2026-08-31T00:00:00Z', updatedAt: '2026-08-31T01:00:00Z', answers: [{ body: '기존 답변', createdAt: '2026-08-31T02:00:00Z' }] };
const other = { ...item, key: 'local-question-beta', title: '계정 문의', category: 'ACCOUNT', visibility: 'PRIVATE', status: 'ANSWERED', answers: [] };
function adapterFor(result, { answer = jest.fn().mockResolvedValue({}), hide = jest.fn().mockResolvedValue({}) } = {}) { const load = jest.fn().mockResolvedValue(result); return { create: () => ({ load, answer, hide }), load, answer, hide }; }

describe('SystemSupportPage', () => {
  test('renders loading, successful list, selected detail and client-side filters', async () => {
    let resolve; const load = jest.fn(() => new Promise((done) => { resolve = done; }));
    render(<SystemSupportPage createAdapter={() => ({ load })} />); expect(screen.getByText('불러오는 중')).toBeInTheDocument();
    resolve({ permissions: [], items: [item, other] }); await screen.findByText('대여 문의');
    fireEvent.click(screen.getByText('대여 문의')); expect(screen.getByText('문의 본문')).toBeInTheDocument(); expect(screen.getByText('기존 답변')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('분류'), { target: { value: 'ACCOUNT' } }); expect(screen.getByText('계정 문의')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'PENDING' } }); expect(screen.getByText('선택한 필터에 맞는 문의가 없습니다.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'ANSWERED' } }); fireEvent.change(screen.getByLabelText('공개 범위'), { target: { value: 'PRIVATE' } }); expect(screen.getByText('계정 문의')).toBeInTheDocument();
  });

  test('distinguishes source empty, read access errors, network error and retry', async () => {
    const empty = adapterFor({ permissions: [], items: [] }); render(<SystemSupportPage createAdapter={empty.create} />); expect(await screen.findByText('표시할 항목 없음')).toBeInTheDocument();
    const forbidden = () => ({ load: jest.fn().mockRejectedValue({ status: 401, code: 'AUTH_REQUIRED' }) }); const { unmount } = render(<SystemSupportPage createAdapter={forbidden} />); expect(await screen.findByText('AUTH_REQUIRED')).toBeInTheDocument(); unmount();
    const accessDenied = () => ({ load: jest.fn().mockRejectedValue({ status: 403, code: 'ADMIN_ACCESS_DENIED' }) }); render(<SystemSupportPage createAdapter={accessDenied} />); expect(await screen.findByText('ADMIN_ACCESS_DENIED')).toBeInTheDocument();
    const load = jest.fn().mockRejectedValueOnce({ status: 500, code: 'QNA_READ_FAILED' }).mockResolvedValueOnce({ permissions: [], items: [item] }); const { unmount: remove } = render(<SystemSupportPage createAdapter={() => ({ load })} />); expect(await screen.findByText('QNA_READ_FAILED')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: '다시 시도' })); expect(await screen.findByText('대여 문의')).toBeInTheDocument(); remove();
  });

  test('shows actions only for their permissions and never renders a state-change control', async () => {
    const answerOnly = adapterFor({ permissions: ['QNA_ANSWER'], items: [item] }); const first = render(<SystemSupportPage createAdapter={answerOnly.create} />); fireEvent.click(await screen.findByText('대여 문의')); expect(screen.getByRole('button', { name: '답변 등록' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: '문의 숨김' })).toBeNull(); expect(screen.queryByText(/상태 변경/)).toBeNull(); first.unmount();
    const hideOnly = adapterFor({ permissions: ['QNA_HIDE'], items: [item] }); const second = render(<SystemSupportPage createAdapter={hideOnly.create} />); fireEvent.click(await screen.findByText('대여 문의')); expect(screen.getByRole('button', { name: '문의 숨김' })).toBeInTheDocument(); expect(screen.queryByLabelText('답변 내용')).toBeNull(); second.unmount();
  });

  test('answers with a single submission, refreshes after success, and preserves data on failure', async () => {
    let resolveAnswer; const answer = jest.fn(() => new Promise((done) => { resolveAnswer = done; })); const setup = adapterFor({ permissions: ['QNA_ANSWER'], items: [item, other] }, { answer });
    const success = render(<SystemSupportPage createAdapter={setup.create} />); fireEvent.click(await screen.findByText('대여 문의')); fireEvent.change(screen.getByLabelText('답변 내용'), { target: { value: '새 답변' } }); const button = screen.getByRole('button', { name: '답변 등록' }); fireEvent.click(button); expect(button).toBeDisabled(); expect(screen.getByRole('button', { name: /계정 문의/ })).toBeDisabled(); fireEvent.click(button); expect(answer).toHaveBeenCalledTimes(1); resolveAnswer({}); await waitFor(() => expect(setup.load).toHaveBeenCalledTimes(2)); success.unmount();
    const failed = jest.fn().mockRejectedValue({ code: 'QNA_CONFLICT' }); const failure = adapterFor({ permissions: ['QNA_ANSWER'], items: [item] }, { answer: failed }); const failedRender = render(<SystemSupportPage createAdapter={failure.create} />); fireEvent.click(await screen.findByText('대여 문의')); fireEvent.change(screen.getByLabelText('답변 내용'), { target: { value: '실패 답변' } }); fireEvent.click(screen.getByRole('button', { name: '답변 등록' })); expect(await screen.findByText('QNA_CONFLICT')).toBeInTheDocument(); expect(screen.getByText('문의 본문')).toBeInTheDocument(); failedRender.unmount();
  });

  test('confirms hide before sending it and keeps loaded data after an action failure', async () => {
    const hide = jest.fn().mockRejectedValue({ code: 'QNA_ACCESS_DENIED' }); const setup = adapterFor({ permissions: ['QNA_HIDE'], items: [item] }, { hide }); window.confirm = jest.fn().mockReturnValue(false);
    const view = render(<SystemSupportPage createAdapter={setup.create} />); fireEvent.click(await screen.findByText('대여 문의')); fireEvent.click(screen.getByRole('button', { name: '문의 숨김' })); expect(hide).not.toHaveBeenCalled(); window.confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: '문의 숨김' })); expect(await screen.findByText('QNA_ACCESS_DENIED')).toBeInTheDocument(); expect(screen.getByText('문의 본문')).toBeInTheDocument(); view.unmount(); window.confirm.mockRestore();
  });

  test('refreshes source after a confirmed hide succeeds', async () => {
    const setup = adapterFor({ permissions: ['QNA_HIDE'], items: [item] }); window.confirm = jest.fn().mockReturnValue(true);
    const view = render(<SystemSupportPage createAdapter={setup.create} />); fireEvent.click(await screen.findByText('대여 문의')); fireEvent.click(screen.getByRole('button', { name: '문의 숨김' })); await waitFor(() => expect(setup.hide).toHaveBeenCalledWith(item.key, expect.any(Object))); await waitFor(() => expect(setup.load).toHaveBeenCalledTimes(2)); view.unmount(); window.confirm.mockRestore();
  });

  test('uses UI-only fixtures, keeps IDs out of DOM and URL, and has narrow navigation structure', async () => {
    window.history.replaceState({}, '', '/admin-v2-preview/system/support'); const safeItem = { ...item, title: '안전한 제목', body: '안전한 본문' };
    expect(JSON.stringify(safeItem)).not.toMatch(/7123|9917|person@example|oauth/); const setup = adapterFor({ permissions: [], items: [safeItem] }); render(<SystemSupportPage createAdapter={setup.create} />); fireEvent.click(await screen.findByText('안전한 제목')); expect(document.body.textContent).not.toMatch(/7123|9917|person@example|oauth/); expect(window.location.href).not.toMatch(/7123|9917/); fireEvent.click(screen.getByRole('button', { name: '목록으로 돌아가기' })); expect(screen.queryByText('안전한 본문')).toBeNull(); expect(screen.getByText('안전한 제목')).toBeInTheDocument();
  });

  test('keeps a two-column structure at 1024px and switches to a sequential narrow layout in CSS', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/features/admin-v2/system/support/systemSupport.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 1024px\)[\s\S]*grid-template-columns/); expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*grid-template-columns: 1fr[\s\S]*system-support-layout--detail .system-support-list/);
  });

  test('ignores a stale load after the adapter changes and does not update after unmount', async () => {
    let firstResolve; const first = () => ({ load: () => new Promise((done) => { firstResolve = done; }) }); const second = adapterFor({ permissions: [], items: [other] }); const { rerender, unmount } = render(<SystemSupportPage createAdapter={first} />); rerender(<SystemSupportPage createAdapter={second.create} />); expect(await screen.findByText('계정 문의')).toBeInTheDocument(); firstResolve({ permissions: [], items: [item] }); await waitFor(() => expect(screen.queryByText('대여 문의')).toBeNull()); unmount();
  });
});
