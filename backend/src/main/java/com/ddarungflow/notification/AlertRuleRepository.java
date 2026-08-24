package com.ddarungflow.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AlertRuleRepository extends JpaRepository<AlertRule, Long> {

    List<AlertRule> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<AlertRule> findByUserIdAndId(Long userId, Long id);
}
