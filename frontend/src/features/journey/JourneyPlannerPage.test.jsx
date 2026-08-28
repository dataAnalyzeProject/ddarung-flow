import { fireEvent, render, screen } from '@testing-library/react';
import JourneyPlannerPage from './JourneyPlannerPage';
test('keeps input and asks anonymous users to log in without automatic execution', () => { render(<JourneyPlannerPage authState="anonymous" onNavigate={jest.fn()} />); fireEvent.click(screen.getByRole('button',{name:'여정 만들기'})); expect(screen.getByRole('status')).toHaveTextContent('로그인 후'); });
test('moves authenticated users to the fixture result', () => { const onNavigate=jest.fn(); render(<JourneyPlannerPage authState="authenticated" onNavigate={onNavigate} />); fireEvent.click(screen.getByRole('button',{name:'여정 만들기'})); expect(onNavigate).toHaveBeenCalledWith('journey-result','phase-a-fixture'); });
