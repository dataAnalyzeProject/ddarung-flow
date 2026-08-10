package com.ddarungflow.modelops;

import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class ModelUploadService {

    private final ModelUploadRepository uploadRepository;

    public ModelUploadService(ModelUploadRepository uploadRepository) {
        this.uploadRepository = uploadRepository;
    }

    public ModelUpload createUpload(ModelUpload upload) {
        throw new UnsupportedOperationException("TODO(EXP-BE-MODEL): validate and create an upload session");
    }

    public ModelUpload complete(UUID uploadId, OffsetDateTime now) {
        throw new UnsupportedOperationException("TODO(EXP-BE-MODEL): complete a CREATED upload");
    }

    public ModelUpload fail(UUID uploadId, OffsetDateTime now) {
        throw new UnsupportedOperationException("TODO(EXP-BE-MODEL): fail a CREATED upload");
    }

    public ModelUpload expire(UUID uploadId, OffsetDateTime now) {
        throw new UnsupportedOperationException("TODO(EXP-BE-MODEL): expire a CREATED upload");
    }
}
