package com.ddarungflow.modelops;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class ModelRegistryServiceTest {

    @Test
    @Disabled("EXP-BE-MODEL 담당자가 DRAFT 등록 검증을 구현한 뒤 활성화합니다.")
    void registersValidDraftAndRejectsDuplicateVersionOrChecksum() {
        fail("필수값과 version/checksum 중복 거부를 검증하세요.");
    }

    @Test
    @Disabled("EXP-BE-MODEL 담당자가 평가행 검증을 구현한 뒤 활성화합니다.")
    void savesExactlyTwentyUniqueEvaluationCombinations() {
        fail("60/120/180/240분과 필요수량 1~5의 정확한 20조합을 검증하세요.");
    }

    @Test
    @Disabled("EXP-BE-MODEL 담당자가 모델 상태 전이를 구현한 뒤 활성화합니다.")
    void allowsOnlyAssigneeOwnedModelTransitions() {
        fail("DRAFT→VALIDATED→APPROVED/REJECTED와 비허용 전이를 검증하세요.");
    }

    @Test
    @Disabled("담당자가 계약 범위의 추가 경계 테스트를 작성한 뒤 활성화합니다.")
    void rejectsBlankVersionOrMissingTrainer() {
        fail("blank version 또는 trainer 누락 경계를 검증하세요.");
    }
}
