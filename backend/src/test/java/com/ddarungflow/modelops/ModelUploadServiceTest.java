package com.ddarungflow.modelops;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
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

        // when - complete
        ModelUpload completed = uploadService.complete(id, now);
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
        assertThatThrownBy(() -> uploadService.complete(id, now))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("terminal state");

        assertThatThrownBy(() -> uploadService.fail(id, now))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("terminal state");

        assertThatThrownBy(() -> uploadService.expire(id, expiresAt))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("terminal state");
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
        assertThatThrownBy(() -> uploadService.complete(id, now))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("expired");
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
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("not expired yet");
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
}
