package com.ddarungflow.export;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.apache.avro.Schema;
import org.apache.avro.generic.GenericData;
import org.apache.avro.generic.GenericRecord;
import org.apache.parquet.avro.AvroParquetWriter;
import org.apache.parquet.hadoop.ParquetWriter;
import org.apache.parquet.io.LocalOutputFile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ExportFileService {
    private static final String[] COLUMNS = {"stationId", "availableBikeCount", "inventoryStatus", "collectedAt"};
    private static final Schema PARQUET_SCHEMA = new Schema.Parser().parse("""
            {"type":"record","name":"CuratedInventory","fields":[
              {"name":"stationId","type":"string"},
              {"name":"availableBikeCount","type":["null","int"],"default":null},
              {"name":"inventoryStatus","type":"string"},
              {"name":"collectedAt","type":["null","string"],"default":null}
            ]}
            """);

    private final ExportRequestService exportRequestService;
    private final EntityManager entityManager;
    @Value("${export.storage-root:/app/exports}")
    private String exportStorageRoot;

    public ExportRequest createFile(ExportRequest request, OffsetDateTime now) {
        ExportRequest generating = exportRequestService.markGeneratingForAdmin(request.getId());
        try {
            List<ExportRow> rows = readRows(generating);
            writeFile(generating, rows);
            return exportRequestService.completeForAdmin(generating.getId(), (long) rows.size(), now);
        } catch (RuntimeException | IOException error) {
            exportRequestService.failForAdmin(generating.getId(), "EXPORT_GENERATION_FAILED", now);
            throw new ExportGenerationException(error);
        }
    }

    @Transactional
    public DownloadedFile openForDownload(Long id, OffsetDateTime now) {
        ExportRequest request = exportRequestService.getExportRequestForAdmin(id, now);
        if (request.getStatus() == ExportStatus.EXPIRED) {
            throw new ExportExpiredException();
        }
        if (request.getStatus() != ExportStatus.COMPLETED) {
            throw new ExportFileNotFoundException();
        }
        java.nio.file.Path file = filePath(request);
        if (!Files.isRegularFile(file)) {
            throw new ExportFileNotFoundException();
        }
        return new DownloadedFile(file, request.getFormat(), "export-" + request.getId() + extension(request.getFormat()));
    }

    private List<ExportRow> readRows(ExportRequest request) {
        if (request.getSource() == ExportSource.QUARANTINE_NORMALIZED) {
            return List.of();
        }
        long limit = request.getRowCount() != null ? request.getRowCount() : ExportRequestService.MAX_CSV_ROW_COUNT;
        @SuppressWarnings("unchecked")
        List<Object[]> results = entityManager.createNativeQuery("""
                select inventory.station_id, inventory.available_bike_count, inventory.inventory_status, inventory.collected_at
                from station_inventory_current inventory
                join stations station on station.station_id = inventory.station_id
                where station.active = true
                order by inventory.station_id asc
                """).setMaxResults(Math.toIntExact(limit)).getResultList();
        List<ExportRow> rows = new ArrayList<>(results.size());
        for (Object[] row : results) {
            rows.add(new ExportRow(String.valueOf(row[0]), row[1] == null ? null : ((Number) row[1]).intValue(),
                    String.valueOf(row[2]), row[3] == null ? null : row[3].toString()));
        }
        return rows;
    }

    private void writeFile(ExportRequest request, List<ExportRow> rows) throws IOException {
        Files.createDirectories(exportRoot());
        Files.deleteIfExists(filePath(request));
        if (request.getFormat() == ExportFormat.CSV) {
            try (BufferedWriter writer = Files.newBufferedWriter(filePath(request), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
                writer.write(String.join(",", COLUMNS));
                writer.newLine();
                for (ExportRow row : rows) {
                    writer.write(csv(row.stationId())); writer.write(','); writer.write(row.availableBikeCount() == null ? "" : row.availableBikeCount().toString()); writer.write(',');
                    writer.write(csv(row.inventoryStatus())); writer.write(','); writer.write(csv(row.collectedAt())); writer.newLine();
                }
            }
            return;
        }
        try (ParquetWriter<GenericRecord> writer = AvroParquetWriter.<GenericRecord>builder(new LocalOutputFile(filePath(request)))
                .withSchema(PARQUET_SCHEMA).build()) {
            for (ExportRow row : rows) {
                GenericRecord record = new GenericData.Record(PARQUET_SCHEMA);
                record.put("stationId", row.stationId()); record.put("availableBikeCount", row.availableBikeCount());
                record.put("inventoryStatus", row.inventoryStatus()); record.put("collectedAt", row.collectedAt());
                writer.write(record);
            }
        }
    }

    private java.nio.file.Path filePath(ExportRequest request) { return exportRoot().resolve("request-" + request.getId() + extension(request.getFormat())); }
    private java.nio.file.Path exportRoot() { return java.nio.file.Path.of(exportStorageRoot); }
    private String extension(ExportFormat format) { return format == ExportFormat.CSV ? ".csv" : ".parquet"; }
    private String csv(String value) { return value == null ? "" : "\"" + value.replace("\"", "\"\"") + "\""; }

    private record ExportRow(String stationId, Integer availableBikeCount, String inventoryStatus, String collectedAt) { }
    public record DownloadedFile(java.nio.file.Path path, ExportFormat format, String downloadName) { }
    public static class ExportGenerationException extends RuntimeException {
        public ExportGenerationException(Throwable cause) { super(cause); }
    }
    public static class ExportExpiredException extends RuntimeException { }
    public static class ExportFileNotFoundException extends RuntimeException { }
}
