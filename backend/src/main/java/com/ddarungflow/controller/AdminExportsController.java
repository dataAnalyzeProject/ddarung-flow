package com.ddarungflow.controller;

import com.ddarungflow.dto.AdminExportDtos;
import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.export.ExportFileService;
import com.ddarungflow.export.ExportRequest;
import com.ddarungflow.export.ExportRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/admin/exports")
public class AdminExportsController {
    private final ExportRequestService exportRequestService;
    private final ExportFileService exportFileService;

    @PostMapping
    @PreAuthorize("hasAnyAuthority('DATA_EXPORT_REQUEST','OPS_REPORT_EXPORT')")
    public ResponseEntity<AdminExportDtos.ExportResponse> create(@AuthenticationPrincipal PrincipalDetails principal,
                                                                   @Valid @RequestBody AdminExportDtos.CreateRequest body) {
        ExportRequest request = exportRequestService.create(principal.getUsers().getId(), body.source(), body.format(), body.purpose(), body.rowCount(), OffsetDateTime.now());
        return ResponseEntity.status(HttpStatus.CREATED).body(AdminExportDtos.ExportResponse.from(exportFileService.createFile(request, OffsetDateTime.now())));
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('DATA_EXPORT_REQUEST','DATA_EXPORT_DOWNLOAD','OPS_REPORT_EXPORT')")
    public AdminExportDtos.ListResponse list() {
        List<AdminExportDtos.ExportResponse> items = exportRequestService.getExportRequestsForAdmin(OffsetDateTime.now()).stream()
                .map(AdminExportDtos.ExportResponse::from).toList();
        return new AdminExportDtos.ListResponse(items);
    }

    @GetMapping("/{exportId}")
    @PreAuthorize("hasAnyAuthority('DATA_EXPORT_REQUEST','DATA_EXPORT_DOWNLOAD','OPS_REPORT_EXPORT')")
    public AdminExportDtos.ExportResponse detail(@PathVariable Long exportId) {
        return AdminExportDtos.ExportResponse.from(exportRequestService.getExportRequestForAdmin(exportId, OffsetDateTime.now()));
    }

    @GetMapping("/{exportId}/download")
    @PreAuthorize("hasAnyAuthority('DATA_EXPORT_DOWNLOAD','OPS_REPORT_EXPORT')")
    public ResponseEntity<byte[]> download(@PathVariable Long exportId) throws Exception {
        ExportFileService.DownloadedFile file = exportFileService.openForDownload(exportId, OffsetDateTime.now());
        MediaType contentType = file.format().name().equals("CSV") ? MediaType.parseMediaType("text/csv") : MediaType.parseMediaType("application/vnd.apache.parquet");
        return ResponseEntity.ok().contentType(contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.downloadName()).build().toString())
                .body(Files.readAllBytes(file.path()));
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    ResponseEntity<AdminExportDtos.ErrorResponse> invalidRequest(Exception error) { return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "입력값이 올바르지 않습니다."); }
    @ExceptionHandler(ExportRequestService.ExportRequestNotFoundException.class)
    ResponseEntity<AdminExportDtos.ErrorResponse> notFound(ExportRequestService.ExportRequestNotFoundException error) { return error(HttpStatus.NOT_FOUND, "EXPORT_NOT_FOUND", "내보내기 요청을 찾을 수 없습니다."); }
    @ExceptionHandler(ExportFileService.ExportFileNotFoundException.class)
    ResponseEntity<AdminExportDtos.ErrorResponse> fileNotFound(ExportFileService.ExportFileNotFoundException error) { return error(HttpStatus.NOT_FOUND, "EXPORT_FILE_NOT_FOUND", "내보내기 파일을 찾을 수 없습니다."); }
    @ExceptionHandler(ExportFileService.ExportExpiredException.class)
    ResponseEntity<AdminExportDtos.ErrorResponse> expired(ExportFileService.ExportExpiredException error) { return error(HttpStatus.GONE, "EXPORT_EXPIRED", "내보내기 파일이 만료되었습니다."); }
    @ExceptionHandler(ExportFileService.ExportGenerationException.class)
    ResponseEntity<AdminExportDtos.ErrorResponse> generationFailed(ExportFileService.ExportGenerationException error) { return error(HttpStatus.INTERNAL_SERVER_ERROR, "EXPORT_GENERATION_FAILED", "내보내기 파일 생성에 실패했습니다."); }
    private ResponseEntity<AdminExportDtos.ErrorResponse> error(HttpStatus status, String code, String message) { return ResponseEntity.status(status).body(new AdminExportDtos.ErrorResponse(code, message)); }
}
