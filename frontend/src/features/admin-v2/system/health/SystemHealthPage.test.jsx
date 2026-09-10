import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import SystemHealthPage from './index.jsx';

describe('SystemHealthPage', () => {
  test('states that system health is not instrumented without claiming healthy or failed', () => {
    render(<SystemHealthPage />);

    expect(screen.getByRole('heading', { name: '시스템 상태' })).toBeInTheDocument();
    expect(screen.getAllByText('계측되지 않음')).toHaveLength(3);
    expect(screen.getByText('NOT_INSTRUMENTED')).toBeInTheDocument();
    expect(screen.getByText('필요 권한: SYSTEM_STATUS_READ')).toBeInTheDocument();
    expect(screen.getByText(/서비스 이상이나 정상으로 판정한 결과가 아닙니다/)).toBeInTheDocument();
    expect(screen.queryByText(/정상 운영|장애 발생|HEALTHY|UNHEALTHY/)).not.toBeInTheDocument();
  });

  test('marks every unproven scope as not instrumented and provides no fake metric value', () => {
    render(<SystemHealthPage />);

    expect(screen.getByText('서비스 런타임')).toBeInTheDocument();
    expect(screen.getByText('인프라 자원')).toBeInTheDocument();
    expect(screen.getByText('AI 및 도구')).toBeInTheDocument();
    expect(screen.getByText(/다른 영역의 값을 시스템 상태로 바꾸어 표시하지 않습니다/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+(\.\d+)?\s*(%|ms|MB|GB|core)/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('keeps a responsive single-column fallback in the local SYSTEM stylesheet', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/features/admin-v2/system/health/systemHealth.css'), 'utf8');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('grid-template-columns: 1fr');
  });
});
