package com.ddarungflow.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InAppNotificationRepository extends JpaRepository<InAppNotification, Long> {

    Optional<InAppNotification> findByUserIdAndDedupKey(Long userId, String dedupKey);

    List<InAppNotification> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<InAppNotification> findByUserIdAndReadAtIsNullOrderByCreatedAtDesc(Long userId);

    Optional<InAppNotification> findByUserIdAndId(Long userId, Long id);
}
