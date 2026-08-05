import {
    savePendingPrediction,
    loadPendingPrediction,
    clearPendingPrediction
} from './loginStorage';
describe('loginStorage 테스트', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });
    test('5개 키만 저장하고 복원한다', () => {
        const input = {
            origin: '서울역',
            destination: '광화문',
            travelMode: 'WALK',
            directMinutes: null,
            requiredBikeCount: 2
        };
        savePendingPrediction(input);
        const loaded = loadPendingPrediction();
        expect(loaded).toEqual({
            origin: '서울역',
            destination: '광화문',
            travelMode: 'WALK',
            directMinutes: null,
            requiredBikeCount: 2
        });
        expect(loaded.invalidKey).toBeUndefined();
    });
    // 비정상 값 0, 6, 문자열 등일 때 기본값 1 검증 경계 테스트
    test('requiredBikeCount가 0, 6, 문자열 등 비정상값일 때 양방향 모두 기본값 1로 보정된다', () => {
        // 1. 0일 때
        savePendingPrediction({ requiredBikeCount: 0 });
        expect(loadPendingPrediction().requiredBikeCount).toBe(1);
        // 2. 6일 때
        savePendingPrediction({ requiredBikeCount: 6 });
        expect(loadPendingPrediction().requiredBikeCount).toBe(1);
        // 3. 문자열일 때
        savePendingPrediction({ requiredBikeCount: "abc" });
        expect(loadPendingPrediction().requiredBikeCount).toBe(1);
    });
    // pure 삭제 테스트
    test('clearPendingPrediction 실행 시 세션 데이터가 삭제된다', () => {
        savePendingPrediction({ origin: '서울역' });
        clearPendingPrediction();
        expect(loadPendingPrediction()).toBeNull();
    });
});