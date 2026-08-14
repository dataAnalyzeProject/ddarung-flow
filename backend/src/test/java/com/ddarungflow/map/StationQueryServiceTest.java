package com.ddarungflow.map;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class StationQueryServiceTest {

    @Autowired
    private StationRepository stationRepository;

    @Autowired
    private StationInventoryCurrentRepository inventoryRepository;

    private StationQueryService stationQueryService;

    @BeforeEach
    void setUp() {
        stationQueryService = new StationQueryService(stationRepository, inventoryRepository);

        Station s1 = new Station("ST-4", "00102", "102. 망원역 1번출구 앞", new BigDecimal("37.5556488"), new BigDecimal("126.91062927"), true);
        Station s2 = new Station("ST-5", "00103", "103. 망원한강공원 앞", new BigDecimal("37.5523000"), new BigDecimal("126.8991000"), true);
        stationRepository.save(s1);
        stationRepository.save(s2);

        inventoryRepository.save(new StationInventoryCurrent("ST-4", 11, OffsetDateTime.now(), InventoryStatus.NORMAL));
    }

    @Test
    @DisplayName("bounds 내의 대여소를 조회한다 (swLat < neLat, swLng < neLng 유효성 검사 포함)")
    void findInBounds() {
        List<MapApiDtos.StationMapResponseDto> results = stationQueryService.findInBounds(
            new BigDecimal("37.5000"), new BigDecimal("37.6000"),
            new BigDecimal("126.8000"), new BigDecimal("127.0000")
        );

        assertThat(results).hasSize(2);
        assertThat(results.get(0).stationId()).isEqualTo("ST-4");
        assertThat(results.get(0).availableBikeCount()).isEqualTo(11);
    }

    @Test
    @DisplayName("활성 대여소 위치는 재고를 포함하지 않고 모두 반환한다")
    void findAllActiveLocations() {
        stationRepository.save(new Station("ST-INACTIVE", "00104", "비활성 대여소", new BigDecimal("37.5510"), new BigDecimal("126.9000"), false));

        List<MapApiDtos.StationLocationResponseDto> results = stationQueryService.findAllActiveLocations();

        assertThat(results).extracting(MapApiDtos.StationLocationResponseDto::stationId)
            .containsExactlyInAnyOrder("ST-4", "ST-5");
    }

    @Test
    @DisplayName("잘못된 bounds (swLat >= neLat) 입력 시 빈 목록을 반환한다")
    void invalidBoundsReturnsEmptyList() {
        List<MapApiDtos.StationMapResponseDto> results = stationQueryService.findInBounds(
            new BigDecimal("37.6000"), new BigDecimal("37.5000"),
            new BigDecimal("126.8000"), new BigDecimal("127.0000")
        );

        assertThat(results).isEmpty();
    }

    @Test
    @DisplayName("대여소 이름 검색 시 2자 미만은 빈 목록을 반환하고 trim 후 조회한다")
    void searchByNameOrNumber() {
        assertThat(stationQueryService.searchByNameOrNumber("망")).isEmpty();

        List<MapApiDtos.StationMapResponseDto> results = stationQueryService.searchByNameOrNumber(" 망원역 ");
        assertThat(results).hasSize(1);
        assertThat(results.get(0).stationId()).isEqualTo("ST-4");
    }

    @Test
    @DisplayName("재고 정보가 없는 대여소는 count=null 및 MISSING 상태로 구분 반환된다")
    void missingInventoryDistinguishedFromNormal() {
        Optional<MapApiDtos.StationMapResponseDto> dtoOpt = stationQueryService.findById("ST-5");

        assertThat(dtoOpt).isPresent();
        MapApiDtos.StationMapResponseDto dto = dtoOpt.get();
        assertThat(dto.availableBikeCount()).isNull();
        assertThat(dto.inventoryStatus()).isEqualTo(InventoryStatus.MISSING);
    }

    @Test
    @DisplayName("검색어 2자 미만 실패 및 limit(최대 20) 경계값을 검증한다")
    void validateSearchQueryAndLimitBoundaries() {
        assertThat(stationQueryService.searchByNameOrNumber("망", 10)).isEmpty();

        List<MapApiDtos.StationMapResponseDto> results = stationQueryService.searchByNameOrNumber("망원역", 25);
        assertThat(results).hasSize(1);
        assertThat(results.get(0).stationId()).isEqualTo("ST-4");
    }
}
