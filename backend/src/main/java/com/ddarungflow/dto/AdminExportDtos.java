package com.ddarungflow.dto;

import com.ddarungflow.export.ExportFormat;
import com.ddarungflow.export.ExportRequest;
import com.ddarungflow.export.ExportSource;
import com.ddarungflow.export.ExportStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;

public final class AdminExportDtos {
    private AdminExportDtos() { }

    public record CreateRequest(
            @NotNull ExportSource source,
            @NotNull ExportFormat format,
            @Size(max = ExportRequest.MAX_PURPOSE_LENGTH) String purpose,
            @PositiveOrZero Long rowCount
    ) { }

    public record ExportResponse(
            Long exportId,
            ExportSource source,
            ExportFormat format,
            String purpose,
            ExportStatus status,
            Long rowCount,
            OffsetDateTime requestedAt,
            OffsetDateTime completedAt,
            OffsetDateTime expiresAt,
            String failureReasonCode
    ) {
        public static ExportResponse from(ExportRequest request) {
            return new ExportResponse(request.getId(), request.getSource(), request.getFormat(), request.getPurpose(),
                    request.getStatus(), request.getRowCount(), request.getRequestedAt(), request.getCompletedAt(),
                    request.getExpiresAt(), request.getFailureReasonCode());
        }
    }

    public record ListResponse(List<ExportResponse> items) { }
    public record ErrorResponse(String code, String message) { }
}
