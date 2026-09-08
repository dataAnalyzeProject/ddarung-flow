package com.ddarungflow.modelops;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ModelUploadServiceTest {

    @Mock
    private ModelUploadRepository uploadRepository;

    @Mock
    private ModelArtifactStorageGateway storageGateway;

    @InjectMocks
    private ModelUploadService uploadService;

    private static final String VALID_SHA256 = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    @Test
    @DisplayName("createsUploadInCreatedState: 필수값 검증 및 CREATED 상태 업로드 생성")
    void createsUploadInCreatedState() {
        // given
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();
        OffsetDateTime expiresAt = createdAt.plusHours(1);

        ModelUpload upload = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );

        given(uploadRepository.existsByObjectKey("models/v1/model.onnx")).willReturn(false);
        given(uploadRepository.save(any(ModelUpload.class))).willAnswer(inv -> inv.getArgument(0));

        // when
        ModelUpload result = uploadService.createUpload(upload);

        // then
        assertThat(result).isNotNull();
        assertThat(result.getStatus()).isEqualTo(ModelUploadStatus.CREATED);
        assertThat(result.getId()).isEqualTo(id);
        verify(uploadRepository).save(upload);
    }

    @Test
    @DisplayName("movesCreatedUploadToOneTerminalState: CREATED에서 COMPLETED/FAILED/EXPIRED 단일 전이")
    void movesCreatedUploadToOneTerminalState() {
        // given
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();
        OffsetDateTime expiresAt = createdAt.plusHours(1);
        OffsetDateTime now = createdAt.plusMinutes(10);

        ModelUpload createdUpload = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );

        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload));
        given(uploadRepository.save(any(ModelUpload.class))).willAnswer(inv -> inv.getArgument(0));

        createdUpload.markUploaded(VALID_SHA256, 1024L, now.minusSeconds(1));
        given(storageGateway.inspect("models/v1/model.onnx"))
                .willReturn(new ModelArtifactStorageGateway.Inspection(1024L, VALID_SHA256));
        // when - complete
        ModelUpload completed = uploadService.complete(id, 1L, now);
        assertThat(completed.getStatus()).isEqualTo(ModelUploadStatus.COMPLETED);
        assertThat(completed.getCompletedAt()).isEqualTo(now);

        // when - fail
        ModelUpload createdUpload2 = new ModelUpload(
            id, 1L, "models/v1/model2.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );
        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload2));

        ModelUpload failed = uploadService.fail(id, now);
        assertThat(failed.getStatus()).isEqualTo(ModelUploadStatus.FAILED);

        // when - expire
        ModelUpload createdUpload3 = new ModelUpload(
            id, 1L, "models/v1/model3.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );
        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload3));

        ModelUpload expired = uploadService.expire(id, expiresAt);
        assertThat(expired.getStatus()).isEqualTo(ModelUploadStatus.EXPIRED);
    }

    @Test
    @DisplayName("rejectsTransitionAfterUploadTerminates: 종료 상태에서 다른 종료 상태로 전이 거부")
    void rejectsTransitionAfterUploadTerminates() {
        // given
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();
        OffsetDateTime expiresAt = createdAt.plusHours(1);
        OffsetDateTime now = createdAt.plusMinutes(10);

        ModelUpload completedUpload = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.COMPLETED, expiresAt, now, createdAt
        );

        given(uploadRepository.findById(id)).willReturn(Optional.of(completedUpload));

        // then
        assertThatThrownBy(() -> uploadService.complete(id, 1L, now))
            .isInstanceOf(ModelUploadService.UploadConflictException.class);

        assertThatThrownBy(() -> uploadService.fail(id, now))
            .isInstanceOf(ModelUploadService.UploadConflictException.class);

        assertThatThrownBy(() -> uploadService.expire(id, expiresAt))
            .isInstanceOf(ModelUploadService.UploadConflictException.class);
    }

    @Test
    @DisplayName("rejectsInvalidExpirationBoundary: 만료 시각 지난 업로드 완료 거부")
    void rejectsInvalidExpirationBoundary() {
        // given
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now().minusHours(2);
        OffsetDateTime expiresAt = createdAt.plusHours(1); // 1 hour ago
        OffsetDateTime now = OffsetDateTime.now(); // now > expiresAt

        ModelUpload createdUpload = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );

        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload));

        // then
        assertThatThrownBy(() -> uploadService.complete(id, 1L, now))
            .isInstanceOf(ModelUploadService.UploadConflictException.class);
    }

    @Test
    @DisplayName("rejectsExpireBeforeExpirationTime: 만료 전 expire 호출 거부")
    void rejectsExpireBeforeExpirationTime() {
        // given
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();
        OffsetDateTime expiresAt = createdAt.plusHours(1);
        OffsetDateTime nowBefore = createdAt.plusMinutes(10);

        ModelUpload createdUpload = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );

        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload));

        // then
        assertThatThrownBy(() -> uploadService.expire(id, nowBefore))
            .isInstanceOf(ModelUploadService.UploadConflictException.class);
    }

    @Test
    @DisplayName("allowsExpireAtExactExpirationTime: 정확한 만료 시각에 expire 허용")
    void allowsExpireAtExactExpirationTime() {
        // given
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();
        OffsetDateTime expiresAt = createdAt.plusHours(1);

        ModelUpload createdUpload = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );

        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload));
        given(uploadRepository.save(any(ModelUpload.class))).willAnswer(inv -> inv.getArgument(0));

        // when
        ModelUpload expired = uploadService.expire(id, expiresAt);

        // then
        assertThat(expired.getStatus()).isEqualTo(ModelUploadStatus.EXPIRED);
    }

    @Test
    @DisplayName("rejectsNullNowInputForFailAndExpire: fail() 및 expire()의 now=null 입력 거부")
    void rejectsNullNowInputForFailAndExpire() {
        UUID id = UUID.randomUUID();

        assertThatThrownBy(() -> uploadService.fail(id, null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("now must not be null");

        assertThatThrownBy(() -> uploadService.expire(id, null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("now must not be null");
    }

    @Test
    @DisplayName("validatesExpirationBoundariesForCompleteAndExpire: 만료 직전, 정확한 만료시각, 만료 후 complete 및 expire 경계 동작 검증")
    void validatesExpirationBoundariesForCompleteAndExpire() {
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();
        OffsetDateTime expiresAt = createdAt.plusHours(1);

        ModelUpload createdUpload = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );

        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload));
        createdUpload.markUploaded(VALID_SHA256, 1024L, createdAt.plusMinutes(1));
        given(storageGateway.inspect("models/v1/model.onnx"))
                .willReturn(new ModelArtifactStorageGateway.Inspection(1024L, VALID_SHA256));
        given(uploadRepository.save(any(ModelUpload.class))).willAnswer(inv -> inv.getArgument(0));

        // 1. 만료시각 직전에는 complete() 성공
        OffsetDateTime justBefore = expiresAt.minusNanos(1);
        ModelUpload completed = uploadService.complete(id, 1L, justBefore);
        assertThat(completed.getStatus()).isEqualTo(ModelUploadStatus.COMPLETED);

        // 2. 정확한 만료시각(now == expiresAt)에는 complete() 실패, expire() 성공
        ModelUpload createdUpload2 = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );
        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload2));

        assertThatThrownBy(() -> uploadService.complete(id, 1L, expiresAt))
            .isInstanceOf(ModelUploadService.UploadConflictException.class);

        ModelUpload expiredAtExact = uploadService.expire(id, expiresAt);
        assertThat(expiredAtExact.getStatus()).isEqualTo(ModelUploadStatus.EXPIRED);

        // 3. 만료시각 이후(now > expiresAt)에는 complete() 실패, expire() 성공
        OffsetDateTime afterExpires = expiresAt.plusMinutes(1);
        ModelUpload createdUpload3 = new ModelUpload(
            id, 1L, "models/v1/model.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );
        given(uploadRepository.findById(id)).willReturn(Optional.of(createdUpload3));

        assertThatThrownBy(() -> uploadService.complete(id, 1L, afterExpires))
            .isInstanceOf(ModelUploadService.UploadConflictException.class);

        ModelUpload expiredAfter = uploadService.expire(id, afterExpires);
        assertThat(expiredAfter.getStatus()).isEqualTo(ModelUploadStatus.EXPIRED);
    }

    @Test
    @DisplayName("rejectsDuplicateObjectKeyAndInvalidSha256: 중복 objectKey 및 유효하지 않은 SHA-256 거부")
    void rejectsDuplicateObjectKeyAndInvalidSha256() {
        // given
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now();
        OffsetDateTime expiresAt = createdAt.plusHours(1);

        ModelUpload uploadDuplicate = new ModelUpload(
            id, 1L, "models/v1/dup.onnx", VALID_SHA256, 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        );
        given(uploadRepository.existsByObjectKey("models/v1/dup.onnx")).willReturn(true);

        assertThatThrownBy(() -> uploadService.createUpload(uploadDuplicate))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Duplicate objectKey");

        assertThatThrownBy(() -> uploadService.createUpload(new ModelUpload(
            id, 1L, "models/v1/new.onnx", "INVALID_SHA256", 1024L,
            ModelUploadStatus.CREATED, expiresAt, null, createdAt
        )))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("expectedSha256 must be a 64-character lowercase hexadecimal string");
    }

    @Test
    void contentMustMatchExpectedHashAndPersistedInspectionBeforeUploaded() {
        UUID id = UUID.randomUUID();
        byte[] content = "verified-model".getBytes(StandardCharsets.UTF_8);
        String sha = sha256(content);
        OffsetDateTime now = OffsetDateTime.now();
        ModelUpload upload = new ModelUpload(id, 1L, "models/generated/model.bin", sha, 1024L,
                ModelUploadStatus.CREATED, now.plusHours(1), null, now.minusMinutes(1));
        given(uploadRepository.findById(id)).willReturn(Optional.of(upload));
        given(storageGateway.inspect(upload.getObjectKey()))
                .willReturn(new ModelArtifactStorageGateway.Inspection(content.length, sha));
        given(uploadRepository.save(any(ModelUpload.class))).willAnswer(inv -> inv.getArgument(0));

        ModelUpload result = uploadService.uploadContent(id, 1L, new ByteArrayInputStream(content), now);

        assertThat(result.getStatus()).isEqualTo(ModelUploadStatus.UPLOADED);
        assertThat(result.getObservedSha256()).isEqualTo(sha);
        assertThat(result.getObservedBytes()).isEqualTo(content.length);
        verify(storageGateway).store(org.mockito.ArgumentMatchers.eq(upload.getObjectKey()),
                org.mockito.ArgumentMatchers.any(Path.class), org.mockito.ArgumentMatchers.eq((long) content.length));
    }

    @Test
    void rejectsHashMismatchBeforeStorage() {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        ModelUpload upload = new ModelUpload(id, 1L, "models/generated/model.bin", VALID_SHA256, 1024L,
                ModelUploadStatus.CREATED, now.plusHours(1), null, now.minusMinutes(1));
        given(uploadRepository.findById(id)).willReturn(Optional.of(upload));

        assertThatThrownBy(() -> uploadService.uploadContent(id, 1L,
                new ByteArrayInputStream("wrong".getBytes(StandardCharsets.UTF_8)), now))
                .isInstanceOf(ModelUploadService.UploadIntegrityException.class);
        org.mockito.Mockito.verify(storageGateway, org.mockito.Mockito.never())
                .store(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(Path.class), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void inspectFailureCleansStoredObjectAndSameSessionCanRetry() {
        UUID id = UUID.randomUUID();
        byte[] content = "retryable-model".getBytes(StandardCharsets.UTF_8);
        String sha = sha256(content);
        OffsetDateTime now = OffsetDateTime.now();
        ModelUpload upload = new ModelUpload(id, 1L, "models/generated/retry.bin", sha, 1024L,
                ModelUploadStatus.CREATED, now.plusHours(1), null, now.minusMinutes(1));
        given(uploadRepository.findById(id)).willReturn(Optional.of(upload));
        given(storageGateway.inspect(upload.getObjectKey()))
                .willThrow(new ModelUploadService.StorageUnavailableException())
                .willReturn(new ModelArtifactStorageGateway.Inspection(content.length, sha));
        given(uploadRepository.save(any(ModelUpload.class))).willAnswer(inv -> inv.getArgument(0));

        assertThatThrownBy(() -> uploadService.uploadContent(id, 1L, new ByteArrayInputStream(content), now))
                .isInstanceOf(ModelUploadService.StorageUnavailableException.class);
        verify(storageGateway).delete(upload.getObjectKey());
        assertThat(upload.getStatus()).isEqualTo(ModelUploadStatus.CREATED);

        ModelUpload retried = uploadService.uploadContent(id, 1L, new ByteArrayInputStream(content), now.plusSeconds(1));
        assertThat(retried.getStatus()).isEqualTo(ModelUploadStatus.UPLOADED);
        verify(storageGateway, org.mockito.Mockito.times(2)).store(
                org.mockito.ArgumentMatchers.eq(upload.getObjectKey()), org.mockito.ArgumentMatchers.any(Path.class),
                org.mockito.ArgumentMatchers.eq((long) content.length));
    }

    @Test
    void legacyCompletedMetadataWithoutObservedIntegrityCannotBeRegistered() {
        UUID id = UUID.randomUUID();
        OffsetDateTime createdAt = OffsetDateTime.now().minusDays(1);
        ModelUpload legacy = new ModelUpload(id, 1L, "models/legacy/model.bin", VALID_SHA256, 1024L,
                ModelUploadStatus.COMPLETED, createdAt.plusDays(2), createdAt.plusHours(1), createdAt);
        given(uploadRepository.findById(id)).willReturn(Optional.of(legacy));

        assertThatThrownBy(() -> uploadService.requireCompleted(id, 1L))
                .isInstanceOf(ModelUploadService.UploadIntegrityException.class)
                .extracting(error -> ((ModelUploadService.UploadIntegrityException) error).code())
                .isEqualTo("MODEL_UPLOAD_INTEGRITY_NOT_RECORDED");
        org.mockito.Mockito.verifyNoInteractions(storageGateway);
    }

    @Test
    void completedUploadCannotBeReusedByAnotherUser() {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        ModelUpload upload = new ModelUpload(id, 1L, "models/private/model.bin", VALID_SHA256, 1024L,
                ModelUploadStatus.CREATED, now.plusHours(1), null, now.minusMinutes(1));
        upload.markUploaded(VALID_SHA256, 1024L, now);
        upload.markCompleted(now.plusSeconds(1));
        given(uploadRepository.findById(id)).willReturn(Optional.of(upload));

        assertThatThrownBy(() -> uploadService.requireCompleted(id, 2L))
                .isInstanceOf(ModelUploadService.UploadOwnershipException.class);
        org.mockito.Mockito.verifyNoInteractions(storageGateway);
    }

    @Test
    void contentAndCompleteRejectNonOwnerBeforeStorageOrStateDisclosure() {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        ModelUpload upload = new ModelUpload(id, 1L, "models/private/model.bin", VALID_SHA256, 1024L,
                ModelUploadStatus.CREATED, now.plusHours(1), null, now.minusMinutes(1));
        given(uploadRepository.findById(id)).willReturn(Optional.of(upload));

        assertThatThrownBy(() -> uploadService.uploadContent(id, 2L,
                new ByteArrayInputStream(new byte[] {1}), now))
                .isInstanceOf(ModelUploadService.UploadOwnershipException.class);
        assertThatThrownBy(() -> uploadService.complete(id, 2L, now))
                .isInstanceOf(ModelUploadService.UploadOwnershipException.class);
        org.mockito.Mockito.verifyNoInteractions(storageGateway);
        assertThat(upload.getStatus()).isEqualTo(ModelUploadStatus.CREATED);
    }

    @Test
    void rejectsCallerMaxBytesAboveFixedServerCeiling() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThatThrownBy(() -> uploadService.createUpload(1L, "large.bin", VALID_SHA256,
                ModelUploadService.SERVER_MAX_UPLOAD_BYTES + 1, now.plusHours(1), now))
                .isInstanceOf(IllegalArgumentException.class);
        org.mockito.Mockito.verifyNoInteractions(uploadRepository, storageGateway);
    }

    private String sha256(byte[] content) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(content));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
