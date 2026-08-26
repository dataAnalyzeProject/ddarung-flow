package com.ddarungflow.export;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExportRequestRepository extends JpaRepository<ExportRequest, Long> {

    List<ExportRequest> findByRequesterUserIdOrderByRequestedAtDesc(Long requesterUserId);

    List<ExportRequest> findAllByOrderByRequestedAtDesc();

    Optional<ExportRequest> findByIdAndRequesterUserId(Long id, Long requesterUserId);

    List<ExportRequest> findByRequesterUserIdAndStatusOrderByRequestedAtDesc(Long requesterUserId, ExportStatus status);
}
