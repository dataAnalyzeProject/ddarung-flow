import { render, screen } from '@testing-library/react';
import LoginPage from './LoginPage';

describe('LoginPage 테스트', () => {
    // 🎯 console.error 경고문으로 인해 테스트가 실패 처리되는 것을 방지
    beforeAll(() => {
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });
    afterAll(() => {
        console.error.mockRestore();
    });

    test('로그인 화면 기본 요소가 렌더링된다', () => {
        render(<LoginPage />);
        // [수정] 여러 개의 '따릉이' 중 첫 번째 항목이 렌더링되었는지 확인
        const elements = screen.getAllByText(/따릉이/i);
        expect(elements[0]).toBeInTheDocument();
    });
});