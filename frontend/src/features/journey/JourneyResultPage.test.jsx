import { render, screen } from '@testing-library/react';
import JourneyResultPage from './JourneyResultPage';

test('does not expose fixture probabilities while production integration is disabled', () => {
  render(<JourneyResultPage onNavigate={jest.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('UNAVAILABLE');
  expect(screen.queryByText('84%')).not.toBeInTheDocument();
});
