package com.ddarungflow.payment;
import com.ddarungflow.entity.Users;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> { Optional<Subscription> findFirstByUserOrderByEndsAtDesc(Users user); }
