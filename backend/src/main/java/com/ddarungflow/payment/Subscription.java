package com.ddarungflow.payment;

import com.ddarungflow.entity.Users;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.OffsetDateTime;

@Entity @Table(name = "subscriptions") @Getter @NoArgsConstructor
public class Subscription {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @ManyToOne(optional = false) @JoinColumn(name = "user_id") private Users user;
  @Enumerated(EnumType.STRING) @Column(nullable = false) private SubscriptionPlan plan;
  @Enumerated(EnumType.STRING) @Column(nullable = false) private SubscriptionStatus status;
  @Column(nullable = false) private OffsetDateTime startsAt;
  @Column(nullable = false) private OffsetDateTime endsAt;
  public Subscription(Users user, SubscriptionPlan plan, OffsetDateTime startsAt) { this.user=user; this.plan=plan; this.status=SubscriptionStatus.ACTIVE; this.startsAt=startsAt; this.endsAt=startsAt.plus(plan.duration()); }
  public boolean isActive(OffsetDateTime now) { if (status == SubscriptionStatus.ACTIVE && !endsAt.isAfter(now)) status=SubscriptionStatus.EXPIRED; return status == SubscriptionStatus.ACTIVE; }
}
