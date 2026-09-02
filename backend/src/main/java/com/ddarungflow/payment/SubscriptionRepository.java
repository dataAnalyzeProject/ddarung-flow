package com.ddarungflow.payment;
import com.ddarungflow.entity.Users;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {
  Optional<Subscription> findFirstByUserOrderByEndsAtDesc(Users user);

  @Query(value = "select * from subscriptions where status = :status and ends_at <= :deadline order by ends_at for update",
      nativeQuery = true)
  List<Subscription> findForStatusNotifications(@Param("status") String status,
                                                @Param("deadline") OffsetDateTime deadline);
}
