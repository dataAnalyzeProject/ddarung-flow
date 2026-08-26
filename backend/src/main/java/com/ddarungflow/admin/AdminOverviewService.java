package com.ddarungflow.admin;
import com.ddarungflow.dto.AdminOverviewDtos;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.export.*;
import com.ddarungflow.modelops.*;
import com.ddarungflow.qna.*;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.audit.*;
import org.springframework.stereotype.Service;
import java.time.*;

@Service
public class AdminOverviewService {
    private final StationInventoryCurrentRepository inventory; private final ModelArtifactRepository artifacts;
    private final ExportRequestRepository exports; private final QnaQuestionRepository qna; private final AuditEventRepository audit;
    public AdminOverviewService(StationInventoryCurrentRepository inventory, ModelArtifactRepository artifacts, ExportRequestRepository exports, QnaQuestionRepository qna, AuditEventRepository audit) { this.inventory=inventory; this.artifacts=artifacts; this.exports=exports; this.qna=qna; this.audit=audit; }
    public AdminOverviewDtos.Response overview(OffsetDateTime now) {
        OffsetDateTime latest = inventory.findAll().stream().map(StationInventoryCurrent::getCollectedAt).filter(java.util.Objects::nonNull).max(OffsetDateTime::compareTo).orElse(null);
        Long age = latest == null ? null : Math.max(0, Duration.between(latest, now).toMinutes());
        String freshness = age == null || age > 180 ? "MISSING" : age > 30 ? "DELAYED" : "NORMAL";
        var active = artifacts.findFirstByState(ModelArtifactState.ACTIVE).map(item -> new AdminOverviewDtos.ActiveModel(item.getState().name(), item.getVersion(), item.getSha256())).orElse(new AdminOverviewDtos.ActiveModel("NONE", null, null));
        long failures = audit.findAuditLogs(null, AuditResult.FAILURE, null, now.minusHours(24), now, org.springframework.data.domain.Pageable.unpaged()).getTotalElements();
        long pendingExports = exports.findAll().stream().filter(item -> item.getStatus() == ExportStatus.PENDING || item.getStatus() == ExportStatus.GENERATING).count();
        long approvals = artifacts.findAll().stream().filter(item -> item.getState() == ModelArtifactState.VALIDATED).count();
        long unanswered = qna.findByStatusOrderByCreatedAtDesc(QnaStatus.PENDING).size();
        return new AdminOverviewDtos.Response(freshness.equals("NORMAL") ? "NORMAL" : freshness.equals("DELAYED") ? "DEGRADED" : "UNAVAILABLE", new AdminOverviewDtos.Freshness(latest, age, freshness), active, new AdminOverviewDtos.RecentFailures(24, failures), new AdminOverviewDtos.Pending(pendingExports, approvals, unanswered), now);
    }
}
