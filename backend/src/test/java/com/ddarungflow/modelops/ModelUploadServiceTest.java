package com.ddarungflow.modelops;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class ModelUploadServiceTest {

    @Test
    @Disabled("EXP-BE-MODEL 담당자가 업로드 생성 검증을 구현한 뒤 활성화합니다.")
    void createsUploadInCreatedState() {
        fail("필수값과 CREATED 초기 상태를 검증하세요.");
    }

    @Test
    @Disabled("EXP-BE-MODEL 담당자가 업로드 종료 전이를 구현한 뒤 활성화합니다.")
    void movesCreatedUploadToOneTerminalState() {
        fail("CREATED에서 COMPLETED/FAILED/EXPIRED 중 하나로 전이되는지 검증하세요.");
    }

    @Test
    @Disabled("EXP-BE-MODEL 담당자가 종료 후 재전이 거부를 구현한 뒤 활성화합니다.")
    void rejectsTransitionAfterUploadTerminates() {
        fail("종료 상태에서 다른 종료 상태로 바뀌지 않는지 검증하세요.");
    }

    @Test
    @Disabled("담당자가 계약 범위의 추가 만료 경계 테스트를 작성한 뒤 활성화합니다.")
    void rejectsInvalidExpirationBoundary() {
        fail("만료시각 경계를 검증하세요.");
    }
}
