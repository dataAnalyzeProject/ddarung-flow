package com.ddarungflow.modelops.retention;

import com.ddarungflow.modelops.ModelArtifactState;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ArtifactPurgePolicyTest {

    @Mock
    private PurgeMarkRepository purgeMarkRepository;

    @InjectMocks
    private ArtifactPurgePolicy artifactPurgePolicy;

    private static final Long ARTIFACT_ID = 100L;
    private static final OffsetDateTime ENTRY_TIME = OffsetDateTime.of(2026, 8, 25, 0, 0, 0, 0, ZoneOffset.UTC);

    @Nested
    @DisplayName("항상 제외되는 상태(ACTIVE, DRAFT, VALIDATED, APPROVED) 테스트")
    class AlwaysExcludedStatesTests {

        @Test
        @DisplayName("ACTIVE, DRAFT, VALIDATED, APPROVED는 경과시간과 무관하게 항상 purge 대상에서 제외됨")
        void excludedStates_NeverPurgedRegardlessOfElapsedTime() {
            OffsetDateTime afterOneYear = ENTRY_TIME.plusYears(1);

            ModelArtifactState[] excluded = {
                    ModelArtifactState.ACTIVE,
                    ModelArtifactState.DRAFT,
                    ModelArtifactState.VALIDATED,
                    ModelArtifactState.APPROVED
            };

            for (ModelArtifactState state : excluded) {
                assertThat(artifactPurgePolicy.isExcludedState(state))
                        .as("%s 상태는 제외 상태여야 함", state)
                        .isTrue();

                assertThat(artifactPurgePolicy.isPurgeCandidate(state, ENTRY_TIME, afterOneYear))
                        .as("%s 상태는 1년이 지나도 purge 대상이 아니어야 함", state)
                        .isFalse();

                Optional<PurgeMark> mark = artifactPurgePolicy.markPurgePending(ARTIFACT_ID, state, ENTRY_TIME, afterOneYear);
                assertThat(mark)
                        .as("%s 상태는 마킹되지 않아야 함", state)
                        .isEmpty();
            }

            verify(purgeMarkRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("REJECTED 29일 / 30일 / 31일 경계값 테스트")
    class RejectedBoundaryTests {

        @Test
        @DisplayName("REJECTED: 29일 경과 시 미대상, 30일 경과 시 대상, 31일 경과 시 대상")
        void rejected_29_30_31_DaysBoundary() {
            // 29일 경과 -> 미대상
            OffsetDateTime day29 = ENTRY_TIME.plusDays(29);
            assertThat(artifactPurgePolicy.isPurgeCandidate(ModelArtifactState.REJECTED, ENTRY_TIME, day29)).isFalse();

            // 30일 경과 (정확히 30일) -> 대상
            OffsetDateTime day30 = ENTRY_TIME.plusDays(30);
            assertThat(artifactPurgePolicy.isPurgeCandidate(ModelArtifactState.REJECTED, ENTRY_TIME, day30)).isTrue();

            // 31일 경과 -> 대상
            OffsetDateTime day31 = ENTRY_TIME.plusDays(31);
            assertThat(artifactPurgePolicy.isPurgeCandidate(ModelArtifactState.REJECTED, ENTRY_TIME, day31)).isTrue();
        }
    }

    @Nested
    @DisplayName("RETIRED 89일 / 90일 / 91일 경계값 테스트")
    class RetiredBoundaryTests {

        @Test
        @DisplayName("RETIRED: 89일 경과 시 미대상, 90일 경과 시 대상, 91일 경과 시 대상")
        void retired_89_90_91_DaysBoundary() {
            // 89일 경과 -> 미대상
            OffsetDateTime day89 = ENTRY_TIME.plusDays(89);
            assertThat(artifactPurgePolicy.isPurgeCandidate(ModelArtifactState.RETIRED, ENTRY_TIME, day89)).isFalse();

            // 90일 경과 (정확히 90일) -> 대상
            OffsetDateTime day90 = ENTRY_TIME.plusDays(90);
            assertThat(artifactPurgePolicy.isPurgeCandidate(ModelArtifactState.RETIRED, ENTRY_TIME, day90)).isTrue();

            // 91일 경과 -> 대상
            OffsetDateTime day91 = ENTRY_TIME.plusDays(91);
            assertThat(artifactPurgePolicy.isPurgeCandidate(ModelArtifactState.RETIRED, ENTRY_TIME, day91)).isTrue();
        }
    }

    @Nested
    @DisplayName("markPurgePending 멱등 마킹 및 중복 방지 테스트")
    class IdempotentMarkingTests {

        @Test
        @DisplayName("최초 호출 시 새 PurgeMark를 생성하고 저장함")
        void markPurgePending_FirstCall_CreatesAndSavesMark() {
            // given (REJECTED 상태 30일 경과)
            OffsetDateTime evalTime = ENTRY_TIME.plusDays(30);
            given(purgeMarkRepository.findByArtifactId(ARTIFACT_ID)).willReturn(Optional.empty());
            given(purgeMarkRepository.save(any(PurgeMark.class))).willAnswer(inv -> inv.getArgument(0));

            // when
            Optional<PurgeMark> markOpt = artifactPurgePolicy.markPurgePending(ARTIFACT_ID, ModelArtifactState.REJECTED, ENTRY_TIME, evalTime);

            // then
            assertThat(markOpt).isPresent();
            PurgeMark mark = markOpt.get();
            assertThat(mark.getArtifactId()).isEqualTo(ARTIFACT_ID);
            assertThat(mark.getState()).isEqualTo(ModelArtifactState.REJECTED);
            assertThat(mark.getMarkedAt()).isEqualTo(evalTime);
            verify(purgeMarkRepository).save(any(PurgeMark.class));
        }

        @Test
        @DisplayName("markPurgePending 재호출 시 기존 마크를 반환하고 중복 행을 생성하지 않음 (멱등성 보장)")
        void markPurgePending_RepeatedCall_ReturnsExistingMarkWithoutDuplicateRow() {
            // given
            OffsetDateTime evalTime = ENTRY_TIME.plusDays(35);
            PurgeMark existingMark = PurgeMark.builder()
                    .id(1L)
                    .artifactId(ARTIFACT_ID)
                    .state(ModelArtifactState.REJECTED)
                    .markedAt(ENTRY_TIME.plusDays(30))
                    .reason("기존 마크")
                    .build();

            given(purgeMarkRepository.findByArtifactId(ARTIFACT_ID)).willReturn(Optional.of(existingMark));

            // when: 재호출
            Optional<PurgeMark> markOpt = artifactPurgePolicy.markPurgePending(ARTIFACT_ID, ModelArtifactState.REJECTED, ENTRY_TIME, evalTime);

            // then: 기존 마크 반환 및 save 미호출
            assertThat(markOpt).isPresent();
            assertThat(markOpt.get()).isSameAs(existingMark);
            verify(purgeMarkRepository, never()).save(any(PurgeMark.class));
        }

        @Test
        @DisplayName("필수 인자 누락 시 예외 발생")
        void markPurgePending_MissingArguments_ThrowsException() {
            assertThatThrownBy(() -> artifactPurgePolicy.markPurgePending(null, ModelArtifactState.REJECTED, ENTRY_TIME, ENTRY_TIME))
                    .isInstanceOf(IllegalArgumentException.class);

            assertThatThrownBy(() -> artifactPurgePolicy.markPurgePending(ARTIFACT_ID, null, ENTRY_TIME, ENTRY_TIME))
                    .isInstanceOf(IllegalArgumentException.class);

            assertThatThrownBy(() -> artifactPurgePolicy.markPurgePending(ARTIFACT_ID, ModelArtifactState.REJECTED, null, ENTRY_TIME))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
