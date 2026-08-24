package com.ddarungflow.retention;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RetentionServiceTest {

    @Mock
    private FavoriteStationRepository favoriteStationRepository;

    @Mock
    private SavedRouteRepository savedRouteRepository;

    @Mock
    private PredictionHistoryRepository predictionHistoryRepository;

    @InjectMocks
    private RetentionService retentionService;

    @Nested
    @DisplayName("즐겨찾기 대여소 (FavoriteStation) 테스트")
    class FavoriteStationTests {

        @Test
        @DisplayName("사용자 A가 즐겨찾기 저장 시 사용자 B 목록은 0건 및 타인 삭제 거부")
        void favoriteStation_UserIsolation() {
            // given
            Long userA = 100L;
            Long userB = 200L;
            FavoriteStation favA = FavoriteStation.builder().userId(userA).stationId(1L).stationName("여의도역").build();

            given(favoriteStationRepository.findByUserIdOrderByCreatedAtDesc(userA)).willReturn(List.of(favA));
            given(favoriteStationRepository.findByUserIdOrderByCreatedAtDesc(userB)).willReturn(List.of());
            given(favoriteStationRepository.findByUserIdAndId(userB, 1L)).willReturn(Optional.empty());

            // when
            List<FavoriteStation> listA = retentionService.getFavoriteStations(userA);
            List<FavoriteStation> listB = retentionService.getFavoriteStations(userB);

            // then
            assertThat(listA).hasSize(1);
            assertThat(listB).isEmpty();

            // B가 A의 즐겨찾기 삭제 시도 시 예외 발생
            assertThatThrownBy(() -> retentionService.deleteFavoriteStation(userB, 1L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("찾을 수 없습니다");
        }

        @Test
        @DisplayName("즐겨찾기 20개 저장 성공 후 21번째 저장 시도 시 거부 예외 발생")
        void addFavoriteStation_MaxLimitExceeded_ThrowsException() {
            // given
            Long userId = 1L;
            given(favoriteStationRepository.findByUserIdAndStationId(userId, 21L)).willReturn(Optional.empty());
            given(favoriteStationRepository.countByUserId(userId)).willReturn(20L); // 20개 이미 등록

            // when & then
            assertThatThrownBy(() -> retentionService.addFavoriteStation(userId, 21L, "21번 대여소"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("최대 20개까지");

            verify(favoriteStationRepository, never()).save(any(FavoriteStation.class));
        }

        @Test
        @DisplayName("동일한 대여소 재요청 시 기존 항 반환하여 행을 늘리지 않음 (멱등성)")
        void addFavoriteStation_DuplicateRequest_ReturnsExisting() {
            // given
            Long userId = 1L;
            FavoriteStation existing = FavoriteStation.builder().userId(userId).stationId(5L).stationName("마포역").build();
            given(favoriteStationRepository.findByUserIdAndStationId(userId, 5L)).willReturn(Optional.of(existing));

            // when
            FavoriteStation result = retentionService.addFavoriteStation(userId, 5L, "마포역");

            // then
            assertThat(result).isEqualTo(existing);
            verify(favoriteStationRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("저장 경로 (SavedRoute) 테스트")
    class SavedRouteTests {

        @Test
        @DisplayName("저장 경로 10개 저장 성공 후 11번째 저장 시도 시 거부 예외 발생")
        void addSavedRoute_MaxLimitExceeded_ThrowsException() {
            // given
            Long userId = 1L;
            given(savedRouteRepository.countByUserId(userId)).willReturn(10L); // 10개 이미 등록

            // when & then
            assertThatThrownBy(() -> retentionService.addSavedRoute(userId, "11번째 경로", 1L, "출발", 2L, "도착", "BIKE"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("최대 10개까지");

            verify(savedRouteRepository, never()).save(any(SavedRoute.class));
        }

        @Test
        @DisplayName("사용자 B가 사용자 A의 저장 경로 삭제 시도 시 거부")
        void deleteSavedRoute_UserIsolation() {
            // given
            Long userA = 100L;
            Long userB = 200L;
            given(savedRouteRepository.findByUserIdAndId(userB, 1L)).willReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> retentionService.deleteSavedRoute(userB, 1L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("찾을 수 없습니다");
        }
    }

    @Nested
    @DisplayName("예측 이력 (PredictionHistory) 테스트")
    class PredictionHistoryTests {

        @Test
        @DisplayName("예측 이력 31건 중 최신 30건만 반환")
        void getPredictionHistories_ReturnsMax30Records() {
            // given
            Long userId = 1L;
            List<PredictionHistory> mock30List = new ArrayList<>();
            for (int i = 0; i < 30; i++) {
                mock30List.add(PredictionHistory.builder().userId(userId).queryCondition("cond" + i).summaryResult("res" + i).build());
            }

            given(predictionHistoryRepository.findByUserIdOrderByQueriedAtDesc(eq(userId), any(PageRequest.class)))
                    .willReturn(mock30List);

            // when
            List<PredictionHistory> histories = retentionService.getPredictionHistories(userId);

            // then
            assertThat(histories).hasSize(30);
            verify(predictionHistoryRepository).findByUserIdOrderByQueriedAtDesc(userId, PageRequest.of(0, 30));
        }
    }
}
