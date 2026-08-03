import {
    savePendingPrediction,
    loadPendingPrediction,
    clearPendingPrediction
} from './loginStorage';
describe('loginStorage 테스트', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });
    test('4개 허용 키만 저장하고 복원한다', () => {
        const input = {
            startStation: '성수역',
            endStation: '서울숲',
            transport: '도보',
            time: '14:00',
            invalidKey: 'secret' // ❌ 걸러져야 함
        };
        savePendingPrediction(input);
        const loaded = loadPendingPrediction();
        expect(loaded).toEqual({
            startStation: '성수역',
            endStation: '서울숲',
            transport: '도보',
            time: '14:00'
        });
        expect(loaded.invalidKey).toBeUndefined();
    });
    test('clearPendingPrediction 실행 시 세션 데이터가 삭제된다', () => {
        savePendingPrediction({ startStation: '성수역' });
        clearPendingPrediction();
        expect(loadPendingPrediction()).toBeNull();
    });
    test('경계 테스트: input이 null이거나 객체가 아닐 때 오류 없이 안전하게 종료된다', () => {
        expect(() => savePendingPrediction(null)).not.toThrow();
        expect(() => savePendingPrediction("잘못된 문자열")).not.toThrow();
    });
});