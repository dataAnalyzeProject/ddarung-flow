package com.ddarungflow.export;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExportRequestService {

    public static final long MAX_CSV_ROW_COUNT = 100_000L;
    public static final long MAX_PARQUET_ROW_COUNT = 1_000_000L;
    public static final long EXPIRATION_HOURS = 24L;

    private final ExportRequestRepository exportRequestRepository;

    @Transactional
    public ExportRequest create(
            Long requesterUserId,
            ExportSource source,
            ExportFormat format,
            String purpose,
            OffsetDateTime now
    ) {
        return create(requesterUserId, source, format, purpose, null, now);
    }

    @Transactional
    public ExportRequest create(
            Long requesterUserId,
            ExportSource source,
            ExportFormat format,
            String purpose,
            Long requestedRowCount,
            OffsetDateTime now
    ) {
        if (requesterUserId == null) {
            throw new IllegalArgumentException("requesterUserId는 필수입니다.");
        }
        if (source == null) {
            throw new IllegalArgumentException("source는 필수입니다.");
        }
        if (format == null) {
            throw new IllegalArgumentException("format은 필수입니다.");
        }
        if (purpose != null && purpose.length() > ExportRequest.MAX_PURPOSE_LENGTH) {
            throw new IllegalArgumentException(
                    String.format("purpose는 최대 %d자까지 허용됩니다. (입력: %d자)",
                            ExportRequest.MAX_PURPOSE_LENGTH, purpose.length())
            );
        }
        if (requestedRowCount != null) {
            validateRowCount(format, requestedRowCount);
        }

        OffsetDateTime reqTime = now != null ? now : OffsetDateTime.now();

        ExportRequest request = ExportRequest.builder()
                .requesterUserId(requesterUserId)
                .source(source)
                .format(format)
                .purpose(purpose)
                .status(ExportStatus.PENDING)
                .rowCount(requestedRowCount)
                .requestedAt(reqTime)
                .build();

        return exportRequestRepository.save(request);
    }

    @Transactional
    public ExportRequest markGenerating(Long id, Long requesterUserId) {
        ExportRequest request = getEntityForRequester(id, requesterUserId);
        request.markGenerating();
        return request;
    }

    @Transactional
    public ExportRequest complete(
            Long id,
            Long requesterUserId,
            Long rowCount,
            OffsetDateTime completedAt
    ) {
        ExportRequest request = getEntityForRequester(id, requesterUserId);
        if (rowCount != null) {
            validateRowCount(request.getFormat(), rowCount);
        }

        OffsetDateTime compTime = completedAt != null ? completedAt : OffsetDateTime.now();
        request.complete(rowCount, compTime);
        return request;
    }

    @Transactional
    public ExportRequest fail(
            Long id,
            Long requesterUserId,
            String failureReasonCode,
            OffsetDateTime failedAt
    ) {
        ExportRequest request = getEntityForRequester(id, requesterUserId);
        OffsetDateTime failTime = failedAt != null ? failedAt : OffsetDateTime.now();
        request.fail(failureReasonCode, failTime);
        return request;
    }

    @Transactional
    public ExportRequest getExportRequest(Long id, Long requesterUserId, OffsetDateTime now) {
        ExportRequest request = getEntityForRequester(id, requesterUserId);
        OffsetDateTime evalTime = now != null ? now : OffsetDateTime.now();
        if (request.isExpired(evalTime) && request.getStatus() == ExportStatus.COMPLETED) {
            request.markExpired();
        }
        return request;
    }

    @Transactional
    public List<ExportRequest> getExportRequestsByRequester(Long requesterUserId, OffsetDateTime now) {
        if (requesterUserId == null) {
            throw new IllegalArgumentException("requesterUserId는 필수입니다.");
        }
        OffsetDateTime evalTime = now != null ? now : OffsetDateTime.now();
        List<ExportRequest> requests = exportRequestRepository.findByRequesterUserIdOrderByRequestedAtDesc(requesterUserId);
        for (ExportRequest req : requests) {
            if (req.isExpired(evalTime) && req.getStatus() == ExportStatus.COMPLETED) {
                req.markExpired();
            }
        }
        return requests;
    }

    public void validateRowCount(ExportFormat format, Long rowCount) {
        if (rowCount < 0) {
            throw new IllegalArgumentException("행 수는 0 이상이어야 합니다: " + rowCount);
        }
        long maxLimit = (format == ExportFormat.CSV) ? MAX_CSV_ROW_COUNT : MAX_PARQUET_ROW_COUNT;
        if (rowCount > maxLimit) {
            throw new IllegalArgumentException(
                    String.format("%s 포맷의 행 수 상한(%d)을 초과했습니다: %d", format, maxLimit, rowCount)
            );
        }
    }

    private ExportRequest getEntityForRequester(Long id, Long requesterUserId) {
        if (id == null) {
            throw new IllegalArgumentException("id는 필수입니다.");
        }
        if (requesterUserId == null) {
            throw new IllegalArgumentException("requesterUserId는 필수입니다.");
        }
        return exportRequestRepository.findByIdAndRequesterUserId(id, requesterUserId)
                .orElseThrow(() -> new IllegalArgumentException(
                        String.format("내보내기 요청을 찾을 수 없거나 접근 권한이 없습니다. (ID: %d, UserId: %d)", id, requesterUserId)
                ));
    }
}
