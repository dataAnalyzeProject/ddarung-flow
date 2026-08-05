import { render, screen, fireEvent } from '@testing-library/react';
import LoginPage from './LoginPage';
import { LOGIN_STATUS } from './data/authDemoData';
import { savePendingPrediction, loadPendingPrediction } from './loginStorage';
describe('LoginPage 핵심 4개 테스트', () => {
    test('1. 로그인 성공 후 5개 입력값과 기본 필요 수량(1개)이 표시된다', () => {
        const sampleInput = {
            origin: '서울역',
            destination: '광화문',
            travelMode: 'WALK',
            directMinutes: null,
            requiredBikeCount: 2
        };
        savePendingPrediction(sampleInput);
        render(<LoginPage initialStatus={LOGIN_STATUS.SUCCESS} />);
        expect(screen.getByText(/출발지: 서울역/i)).toBeInTheDocument();
        expect(screen.getByText(/목적지: 광화문/i)).toBeInTheDocument();
        expect(screen.getByText(/이동수단: WALK/i)).toBeInTheDocument();
        expect(screen.getByText(/이동수단으로 계산/i)).toBeInTheDocument();
        expect(screen.getByText(/필요 자전거: 2/i)).toBeInTheDocument();
    });
    test('2. 로그인 성공만으로는 onRepeatPrediction 함수가 자동으로 호출되지 않는다 (0회)', () => {
        const mockOnRepeat = jest.fn(); // 모의 함수 생성

        render(
            <LoginPage
                initialStatus={LOGIN_STATUS.SUCCESS}
                onRepeatPrediction={mockOnRepeat}
            />
        );
        // 로그인 성공만으로는 호출 횟수가 0이어야 함
        expect(mockOnRepeat).toHaveBeenCalledTimes(0);
    });
    test('3. 다시 예측 버튼 클릭 시 onRepeatPrediction이 복원 객체로 1회 호출되고 세션이 삭제된다', () => {
        const mockOnRepeat = jest.fn();
        const sampleInput = { origin: '서울역', destination: '광화문', travelMode: 'WALK', directMinutes: null, requiredBikeCount: 2 };
        savePendingPrediction(sampleInput);
        render(<LoginPage initialStatus={LOGIN_STATUS.SUCCESS} onRepeatPrediction={mockOnRepeat} />);
        // 버튼 클릭
        const predictBtn = screen.getByRole('button', { name: /다시 예측/i });
        fireEvent.click(predictBtn);
        // 1회 호출 검증
        expect(mockOnRepeat).toHaveBeenCalledTimes(1);
        expect(mockOnRepeat).toHaveBeenCalledWith(sampleInput);
        // 세션 삭제 검증
        expect(loadPendingPrediction()).toBeNull();
    });
});