import { render, screen } from '@testing-library/react';
import ReferenceTimeBar from './ReferenceTimeBar';

describe('ReferenceTimeBar', () => {
  test('shows the generated reference time without preview markers for live access', () => {
    const { container } = render(<ReferenceTimeBar generatedAt="2026-08-30T00:00:00Z" source="LIVE" />);

    expect(screen.getByText('기준 시각: 2026-08-30T00:00:00Z')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/fixture|preview|dev/i);
  });

  test('labels fixture access as preview-only', () => {
    render(<ReferenceTimeBar generatedAt="2026-08-30T00:00:00Z" source="FIXTURE" />);

    expect(screen.getByText('미리보기')).toBeInTheDocument();
    expect(screen.getByText('기준 시각: 2026-08-30T00:00:00Z')).toBeInTheDocument();
  });
});
