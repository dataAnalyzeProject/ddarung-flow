package com.ddarungflow.modelops;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ActivationAttemptRepository extends JpaRepository<ActivationAttempt, Long> {

    Optional<ActivationAttempt> findByCorrelationId(String correlationId);

    boolean existsByCorrelationId(String correlationId);
}
