package com.ddarungflow.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface RecheckSubscriptionRepository extends JpaRepository<RecheckSubscription, Long> {
    Optional<RecheckSubscription> findByUserIdAndDedupKey(Long userId, String dedupKey);
    Optional<RecheckSubscription> findByUserIdAndPublicId(Long userId, String publicId);
    List<RecheckSubscription> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<RecheckSubscription> findTop100ByStatusAndNotifyAtLessThanEqualOrderByNotifyAtAsc(
            RecheckSubscription.Status status, OffsetDateTime notifyAt);

    @Query(value = "select * from consumer_recheck_subscriptions where id = :id for update", nativeQuery = true)
    Optional<RecheckSubscription> findByIdForUpdate(@Param("id") Long id);
}
