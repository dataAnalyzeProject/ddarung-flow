package com.ddarungflow.export;

import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "export.storage-root=build/test-exports")
class ExportFileServiceTest {
    @Autowired private ExportFileService exportFileService;
    @Autowired private ExportRequestService exportRequestService;
    @Autowired private ExportRequestRepository exportRequestRepository;
    @Autowired private StationRepository stationRepository;
    @Autowired private StationInventoryCurrentRepository inventoryRepository;

    @BeforeEach void setUp() {
        exportRequestRepository.deleteAll();
        inventoryRepository.deleteAll();
        stationRepository.deleteAll();
        stationRepository.save(new Station("ST-1", "1", "표시하지 않는 내부 대여소", new BigDecimal("37.5"), new BigDecimal("127.0"), true));
        inventoryRepository.save(new StationInventoryCurrent("ST-1", 3, OffsetDateTime.now(), InventoryStatus.NORMAL));
    }

    @Test void createsCsvFromCurrentCuratedRowsWithoutCoordinatesOrStationNames() throws Exception {
        ExportRequest request = exportRequestService.create(1L, ExportSource.CURATED, ExportFormat.CSV, "운영 검토", 10L, OffsetDateTime.now());
        ExportRequest complete = exportFileService.createFile(request, OffsetDateTime.now());

        ExportFileService.DownloadedFile file = exportFileService.openForDownload(complete.getId(), OffsetDateTime.now());
        String csv = Files.readString(file.path());
        assertThat(complete.getStatus()).isEqualTo(ExportStatus.COMPLETED);
        assertThat(complete.getRowCount()).isEqualTo(1);
        assertThat(csv).contains("stationId,availableBikeCount,inventoryStatus,collectedAt").doesNotContain("latitude", "longitude", "내부 대여소");
    }

    @Test void createsReadableParquetAndAnEmptyQuarantineExport() throws Exception {
        ExportRequest parquet = exportRequestService.create(1L, ExportSource.CURATED, ExportFormat.PARQUET, "운영 검토", 10L, OffsetDateTime.now());
        ExportFileService.DownloadedFile parquetFile = exportFileService.openForDownload(exportFileService.createFile(parquet, OffsetDateTime.now()).getId(), OffsetDateTime.now());
        assertThat(Files.readAllBytes(parquetFile.path())).startsWith((byte) 'P', (byte) 'A', (byte) 'R', (byte) '1');

        ExportRequest quarantine = exportRequestService.create(1L, ExportSource.QUARANTINE_NORMALIZED, ExportFormat.CSV, "운영 검토", 10L, OffsetDateTime.now());
        assertThat(exportFileService.createFile(quarantine, OffsetDateTime.now()).getRowCount()).isZero();
    }
}
