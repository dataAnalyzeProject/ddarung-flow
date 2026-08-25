package com.ddarungflow.export;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ExportRequestServiceTest {

    @Mock
    private ExportRequestRepository exportRequestRepository;

    @InjectMocks
    private ExportRequestService exportRequestService;

    private static final Long USER_A = 101L;
    private static final Long USER_B = 102L;
    private static final OffsetDateTime BASE_TIME = OffsetDateTime.of(2026, 8, 25, 10, 0, 0, 0, ZoneOffset.UTC);

    @Nested
    @DisplayName("생성 및 유효성 검증 테스트")
    class CreationAndValidationTests {

        @Test
        @DisplayName("create(requesterUserId, source, format, purpose, now)는 PENDING 상태의 요청을 생성한다")
        void create_CreatesPendingRequest() {
            // given
            String purpose = "연구 분석용 데이터 추출";
            given(exportRequestRepository.save(any(ExportRequest.class))).willAnswer(inv -> inv.getArgument(0));

            // when
            ExportRequest result = exportRequestService.create(
                    USER_A,
                    ExportSource.CURATED,
                    ExportFormat.CSV,
                    purpose,
                    BASE_TIME
            );

            // then
            assertThat(result).isNotNull();
            assertThat(result.getRequesterUserId()).isEqualTo(USER_A);
            assertThat(result.getSource()).isEqualTo(ExportSource.CURATED);
            assertThat(result.getFormat()).isEqualTo(ExportFormat.CSV);
            assertThat(result.getPurpose()).isEqualTo(purpose);
            assertThat(result.getStatus()).isEqualTo(ExportStatus.PENDING);
            assertThat(result.getRequestedAt()).isEqualTo(BASE_TIME);
            verify(exportRequestRepository).save(any(ExportRequest.class));
        }

        @Test
        @DisplayName("QUARANTINE_NORMALIZED, PARQUET 형식 생성")
        void create_Quarantine_Parquet_Success() {
            // given
            given(exportRequestRepository.save(any(ExportRequest.class))).willAnswer(inv -> inv.getArgument(0));

            // when
            ExportRequest result = exportRequestService.create(
                    USER_A,
                    ExportSource.QUARANTINE_NORMALIZED,
                    ExportFormat.PARQUET,
                    null,
                    BASE_TIME
            );

            // then
            assertThat(result.getSource()).isEqualTo(ExportSource.QUARANTINE_NORMALIZED);
            assertThat(result.getFormat()).isEqualTo(ExportFormat.PARQUET);
            assertThat(result.getStatus()).isEqualTo(ExportStatus.PENDING);
        }

        @Test
        @DisplayName("purpose가 256자를 초과하면 예외 발생")
        void create_PurposeExceeds256_ThrowsException() {
            String longPurpose = "A".repeat(257);

            assertThatThrownBy(() -> exportRequestService.create(
                    USER_A, ExportSource.CURATED, ExportFormat.CSV, longPurpose, BASE_TIME
            )).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("purpose는 최대 256자까지 허용됩니다");
        }

        @Test
        @DisplayName("purpose가 정확히 256자인 경우 정상 생성")
        void create_PurposeExact256_Success() {
            String exactPurpose = "A".repeat(256);
            given(exportRequestRepository.save(any(ExportRequest.class))).willAnswer(inv -> inv.getArgument(0));

            ExportRequest result = exportRequestService.create(
                    USER_A, ExportSource.CURATED, ExportFormat.CSV, exactPurpose, BASE_TIME
            );

            assertThat(result.getPurpose()).hasSize(256);
        }
    }

    @Nested
    @DisplayName("포맷별 행 수 상한 검증 테스트 (CSV 100,000 / Parquet 1,000,000)")
    class RowCountLimitTests {

        @Test
        @DisplayName("CSV 포맷: 100,000행 이하는 허용되고, 100,001행 초과 시 거부")
        void csvRowCountLimit() {
            // 경계값 0행, 100,000행 허용
            exportRequestService.validateRowCount(ExportFormat.CSV, 0L);
            exportRequestService.validateRowCount(ExportFormat.CSV, 100_000L);

            // 100,001행 초과 거부
            assertThatThrownBy(() -> exportRequestService.validateRowCount(ExportFormat.CSV, 100_001L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("CSV 포맷의 행 수 상한(100000)을 초과했습니다: 100001");
        }

        @Test
        @DisplayName("Parquet 포맷: 1,000,000행 이하는 허용되고, 1,000,001행 초과 시 거부")
        void parquetRowCountLimit() {
            // 경계값 0행, 1,000,000행 허용
            exportRequestService.validateRowCount(ExportFormat.PARQUET, 0L);
            exportRequestService.validateRowCount(ExportFormat.PARQUET, 1_000_000L);

            // 1,000,001행 초과 거부
            assertThatThrownBy(() -> exportRequestService.validateRowCount(ExportFormat.PARQUET, 1_000_001L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("PARQUET 포맷의 행 수 상한(1000000)을 초과했습니다: 1000001");
        }

        @Test
        @DisplayName("음수 행 수는 거부")
        void negativeRowCount_Rejected() {
            assertThatThrownBy(() -> exportRequestService.validateRowCount(ExportFormat.CSV, -1L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("행 수는 0 이상이어야 합니다");
        }
    }

    @Nested
    @DisplayName("상태 전이 규칙 테스트 (markGenerating은 PENDING에서만, complete/fail은 GENERATING에서만)")
    class StateTransitionRulesTests {

        @Test
        @DisplayName("정상 흐름: PENDING -> markGenerating -> complete(expiresAt = completedAt + 24h)")
        void normalLifecycle_PendingToGeneratingToComplete() {
            // given
            ExportRequest request = ExportRequest.builder()
                    .id(1L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.PENDING)
                    .requestedAt(BASE_TIME)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(1L, USER_A)).willReturn(Optional.of(request));

            // when 1: markGenerating
            ExportRequest generating = exportRequestService.markGenerating(1L, USER_A);
            assertThat(generating.getStatus()).isEqualTo(ExportStatus.GENERATING);

            // when 2: complete
            OffsetDateTime completedAt = BASE_TIME.plusMinutes(5);
            ExportRequest completed = exportRequestService.complete(1L, USER_A, 50_000L, completedAt);

            // then
            assertThat(completed.getStatus()).isEqualTo(ExportStatus.COMPLETED);
            assertThat(completed.getRowCount()).isEqualTo(50_000L);
            assertThat(completed.getCompletedAt()).isEqualTo(completedAt);
            assertThat(completed.getExpiresAt()).isEqualTo(completedAt.plusHours(24));
        }

        @Test
        @DisplayName("실패 흐름: PENDING -> markGenerating -> fail")
        void failLifecycle_GeneratingToFail() {
            // given
            ExportRequest request = ExportRequest.builder()
                    .id(2L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.PARQUET)
                    .status(ExportStatus.GENERATING)
                    .requestedAt(BASE_TIME)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(2L, USER_A)).willReturn(Optional.of(request));

            // when
            OffsetDateTime failedAt = BASE_TIME.plusMinutes(3);
            ExportRequest failed = exportRequestService.fail(2L, USER_A, "EXTRACT_ERROR", failedAt);

            // then
            assertThat(failed.getStatus()).isEqualTo(ExportStatus.FAILED);
            assertThat(failed.getFailureReasonCode()).isEqualTo("EXTRACT_ERROR");
            assertThat(failed.getCompletedAt()).isEqualTo(failedAt);
        }

        @Test
        @DisplayName("markGenerating은 PENDING에서만 호출 가능 (GENERATING에서 호출 시 거부)")
        void markGenerating_OnlyFromPending() {
            ExportRequest generating = ExportRequest.builder()
                    .id(3L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.GENERATING)
                    .requestedAt(BASE_TIME)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(3L, USER_A)).willReturn(Optional.of(generating));

            assertThatThrownBy(() -> exportRequestService.markGenerating(3L, USER_A))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("잘못된 상태 전이입니다: GENERATING -> GENERATING");
        }

        @Test
        @DisplayName("complete는 GENERATING에서만 호출 가능 (PENDING에서 직접 complete 호출 시 거부)")
        void complete_OnlyFromGenerating() {
            ExportRequest pending = ExportRequest.builder()
                    .id(4L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.PENDING)
                    .requestedAt(BASE_TIME)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(4L, USER_A)).willReturn(Optional.of(pending));

            assertThatThrownBy(() -> exportRequestService.complete(4L, USER_A, 100L, BASE_TIME.plusMinutes(1)))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("잘못된 상태 전이입니다: PENDING -> COMPLETED");
        }

        @Test
        @DisplayName("fail은 GENERATING에서만 호출 가능 (PENDING에서 직접 fail 호출 시 거부)")
        void fail_OnlyFromGenerating() {
            ExportRequest pending = ExportRequest.builder()
                    .id(5L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.PENDING)
                    .requestedAt(BASE_TIME)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(5L, USER_A)).willReturn(Optional.of(pending));

            assertThatThrownBy(() -> exportRequestService.fail(5L, USER_A, "ERROR", BASE_TIME.plusMinutes(1)))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("잘못된 상태 전이입니다: PENDING -> FAILED");
        }
    }

    @Nested
    @DisplayName("24시간 만료 경계값 테스트 (24시간-1초, 정확히 24시간, 24시간+1초)")
    class ExpirationBoundaryTests {

        @Test
        @DisplayName("24시간 - 1초 경계: 만료되지 않음 (isExpired == false, COMPLETED 유지)")
        void before24Hours_MinusOneSecond_NotExpired() {
            // given
            OffsetDateTime completedAt = BASE_TIME;
            OffsetDateTime expiresAt = completedAt.plusHours(24);

            ExportRequest request = ExportRequest.builder()
                    .id(6L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.COMPLETED)
                    .requestedAt(BASE_TIME.minusMinutes(10))
                    .completedAt(completedAt)
                    .expiresAt(expiresAt)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(6L, USER_A)).willReturn(Optional.of(request));

            // when (24시간 - 1초 시점)
            OffsetDateTime evalTime = expiresAt.minusSeconds(1);
            ExportRequest result = exportRequestService.getExportRequest(6L, USER_A, evalTime);

            // then
            assertThat(result.getStatus()).isEqualTo(ExportStatus.COMPLETED);
            assertThat(result.isExpired(evalTime)).isFalse();
        }

        @Test
        @DisplayName("정확히 24시간 경계: 만료됨 (isExpired == true, EXPIRED 전이)")
        void exact24Hours_Expired() {
            // given
            OffsetDateTime completedAt = BASE_TIME;
            OffsetDateTime expiresAt = completedAt.plusHours(24);

            ExportRequest request = ExportRequest.builder()
                    .id(7L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.COMPLETED)
                    .requestedAt(BASE_TIME.minusMinutes(10))
                    .completedAt(completedAt)
                    .expiresAt(expiresAt)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(7L, USER_A)).willReturn(Optional.of(request));

            // when (정확히 expiresAt 시점)
            OffsetDateTime evalTime = expiresAt;
            ExportRequest result = exportRequestService.getExportRequest(7L, USER_A, evalTime);

            // then
            assertThat(result.getStatus()).isEqualTo(ExportStatus.EXPIRED);
            assertThat(result.isExpired(evalTime)).isTrue();
        }

        @Test
        @DisplayName("24시간 + 1초 경계: 만료됨 (isExpired == true, EXPIRED 전이)")
        void after24Hours_PlusOneSecond_Expired() {
            // given
            OffsetDateTime completedAt = BASE_TIME;
            OffsetDateTime expiresAt = completedAt.plusHours(24);

            ExportRequest request = ExportRequest.builder()
                    .id(8L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.COMPLETED)
                    .requestedAt(BASE_TIME.minusMinutes(10))
                    .completedAt(completedAt)
                    .expiresAt(expiresAt)
                    .build();

            given(exportRequestRepository.findByIdAndRequesterUserId(8L, USER_A)).willReturn(Optional.of(request));

            // when (24시간 + 1초 시점)
            OffsetDateTime evalTime = expiresAt.plusSeconds(1);
            ExportRequest result = exportRequestService.getExportRequest(8L, USER_A, evalTime);

            // then
            assertThat(result.getStatus()).isEqualTo(ExportStatus.EXPIRED);
            assertThat(result.isExpired(evalTime)).isTrue();
        }
    }

    @Nested
    @DisplayName("요청자 격리 테스트")
    class RequesterIsolationTests {

        @Test
        @DisplayName("타 사용자의 요청 조회 시 접근 불가(예외 발생)")
        void otherUserCannotAccess() {
            given(exportRequestRepository.findByIdAndRequesterUserId(9L, USER_B)).willReturn(Optional.empty());

            assertThatThrownBy(() -> exportRequestService.getExportRequest(9L, USER_B, BASE_TIME))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("내보내기 요청을 찾을 수 없거나 접근 권한이 없습니다");
        }

        @Test
        @DisplayName("요청자별 목록 조회 시 본인 데이터만 반환")
        void getExportRequestsByRequester_ReturnsOnlyOwnData() {
            ExportRequest req = ExportRequest.builder()
                    .id(10L)
                    .requesterUserId(USER_A)
                    .source(ExportSource.CURATED)
                    .format(ExportFormat.CSV)
                    .status(ExportStatus.PENDING)
                    .requestedAt(BASE_TIME)
                    .build();

            given(exportRequestRepository.findByRequesterUserIdOrderByRequestedAtDesc(USER_A))
                    .willReturn(List.of(req));

            List<ExportRequest> list = exportRequestService.getExportRequestsByRequester(USER_A, BASE_TIME);

            assertThat(list).hasSize(1);
            assertThat(list.get(0).getRequesterUserId()).isEqualTo(USER_A);
        }
    }
}
