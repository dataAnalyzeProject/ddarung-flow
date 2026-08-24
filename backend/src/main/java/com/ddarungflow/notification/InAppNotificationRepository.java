package com.ddarungflow.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InAppNotificationRepository extends JpaRepository<InAppNotification, Long> {

    Optional<InAppNotification> findByDedupKey(String dedupKey);

    List<InAppNotification> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<InAppNotification> findByUserIdAndId(Long userId, Long id);
}
