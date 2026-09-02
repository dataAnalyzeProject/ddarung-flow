import { useEffect, useMemo, useState } from "react";
import {
  ConsumerAppHeader,
  ConsumerButton,
  ConsumerContainer,
  ConsumerIcon,
  ConsumerR2Theme,
} from "../shared";
import { consumerPremiumAdapter, normalizePremiumAccessState } from "../adapters/premium";
import "./premium.css";

const PLAN_FEATURES = [
  ["qna", "Riding Guide", "상세 라이딩 가이드와 코스 정보"],
  ["weather", "AI 라이딩 요약", "날씨·혼잡도·안전도 등 요약 정보"],
  ["mapPin", "AI 장소 추천 이유", "실제 장소의 매력과 선택 이유 확인"],
  ["plan", "AI Planner / AI Plan Result", "AI 일정 생성 및 결과 전체 보기"],
];

function checkoutErrorMessage(error) {
  if (error?.message === "PAYMENT_NOT_ENABLED") return "Toss Payments sandbox 연결을 사용할 수 없습니다. 테스트 키 설정을 확인해 주세요.";
  return "Sandbox 결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function clearPaymentCallbackQuery() {
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
}

export default function PremiumSandboxCheckoutPage({
  accessState = "FREE",
  adapter = consumerPremiumAdapter,
  authState = "authenticated",
  onBack,
  onLogin,
  onNavigate,
  onSuccess,
  user,
}) {
  const initialState = normalizePremiumAccessState(accessState, authState);
  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const plans = useMemo(() => adapter.plans || [], [adapter]);

  useEffect(() => {
    const nextState = normalizePremiumAccessState(accessState, authState);
    setState(nextState);
    if (nextState === "ANONYMOUS") setMessage("Sandbox 테스트 플랜을 선택하려면 먼저 로그인해 주세요.");
    else if (nextState === "ACTIVE") setMessage("Premium 접근 상태가 활성화되어 AI 기능을 사용할 수 있습니다.");
    else if (nextState === "EXPIRED") setMessage("이전 Sandbox Premium 접근 기간이 끝났습니다. 새 테스트 플랜을 선택할 수 있습니다.");
    else if (nextState === "ERROR") setMessage("Premium 접근 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
    else setMessage("");
  }, [accessState, authState]);

  useEffect(() => {
    if (authState !== "authenticated") return undefined;
    const params = new URLSearchParams(window.location.search);
    const paymentState = params.get("payment");
    if (paymentState === "failed") {
      setState("ERROR");
      setMessage("Sandbox 결제가 완료되지 않았습니다. 실제 과금은 발생하지 않았습니다. 다시 시도해 주세요.");
      clearPaymentCallbackQuery();
      return undefined;
    }
    if (paymentState !== "processing") return undefined;
    const payment = { paymentKey: params.get("paymentKey"), orderId: params.get("orderId"), amount: params.get("amount") };
    let active = true;
    setState("PROCESSING");
    adapter.confirm(payment)
      .then(() => adapter.load())
      .then((subscription) => {
        if (!active) return;
        const confirmedState = normalizePremiumAccessState(subscription?.status);
        setState(confirmedState);
        clearPaymentCallbackQuery();
        if (confirmedState === "ACTIVE") {
          setMessage("Sandbox 결제가 승인되어 Premium 접근 상태가 활성화되었습니다.");
          onSuccess?.(subscription);
        } else {
          setMessage("Sandbox 결제 승인 후 Premium 접근 상태가 아직 활성화되지 않았습니다. 상태를 다시 확인해 주세요.");
        }
      })
      .catch(() => {
        if (!active) return;
        setState("ERROR");
        setMessage("Sandbox 결제 승인 상태를 확인하지 못했습니다. 실제 과금은 발생하지 않았습니다. 다시 시도해 주세요.");
        clearPaymentCallbackQuery();
      });
    return () => { active = false; };
  }, [adapter, authState, onSuccess]);

  async function selectPlan(plan) {
    if (state === "ANONYMOUS") { onLogin?.(); return; }
    setSelectedPlan(plan.id);
    setState("PROCESSING");
    setMessage(`${plan.duration} Premium 테스트 플랜의 Sandbox 결제를 준비하고 있습니다.`);
    try {
      const checkout = await adapter.start(plan.id);
      await adapter.openCheckout(checkout, {
        onCancel: () => {
          setState("FREE");
          setSelectedPlan("");
          setMessage("Sandbox 결제가 취소되었습니다. 실제 과금은 발생하지 않았습니다.");
        },
      });
    } catch (error) {
      setState("ERROR");
      setMessage(checkoutErrorMessage(error));
    }
  }

  return (
    <ConsumerR2Theme className="cr22-checkout">
      <ConsumerAppHeader activeItem="planner" authState={authState} onNavigate={onNavigate} onLogin={onLogin} userName={user?.name} userTier={state === "ACTIVE" ? "premium" : user?.tier} />
      <ConsumerContainer as="main" id="main-content" className="cr22-checkout__content">
        <section className="cr22-checkout__warning" aria-label="Sandbox 결제 안내"><ConsumerIcon name="info" /><div><strong>SANDBOX TEST <i /> 실제 따릉이 이용권 구매가 아닙니다.</strong><span>이 화면은 테스트용 Premium 플랜 결제(SANDBOX)입니다. 실제 서비스에서는 제공하지 않는 결제입니다.</span></div></section>
        <header className="cr22-checkout__heading"><h1>Premium 테스트 플랜 결제</h1><p>테스트를 위한 Premium 플랜입니다. 선택하신 플랜으로 Toss 샌드박스 결제를 진행합니다.</p></header>

        {message ? <section className={`cr22-checkout__message is-${state.toLowerCase()}`} role={state === "ERROR" ? "alert" : "status"} aria-live="polite"><strong>{state === "ACTIVE" ? "Premium 활성" : state === "EXPIRED" ? "접근 기간 만료" : state === "ERROR" ? "확인 필요" : "Sandbox 안내"}</strong><span>{message}</span></section> : state === "EXPIRED" ? <section className="cr22-checkout__message is-expired" role="status"><strong>접근 기간 만료</strong><span>이전 Sandbox Premium 접근 기간이 끝났습니다. 새 테스트 플랜을 선택할 수 있습니다.</span></section> : null}

        <section className="cr22-checkout__plans" aria-label="Premium 테스트 플랜 선택">
          {plans.map((plan) => <article className={`cr22-checkout__plan${plan.featured ? " is-featured" : ""}${selectedPlan === plan.id ? " is-selected" : ""}`} key={plan.id}>
            {plan.featured ? <><span className="cr22-checkout__recommended">추천 플랜</span><span className="cr22-checkout__ribbon">BEST<br />VALUE</span></> : null}
            <span className="cr22-checkout__test-label">테스트 플랜</span>
            <h2>{plan.name}</h2>
            <strong className="cr22-checkout__price">{plan.price}</strong>
            <p className="cr22-checkout__renewal"><ConsumerIcon name="check" size={14} /> {plan.policy}</p>
            <div className="cr22-checkout__rule" />
            <h3>제공 기능</h3>
            <ul>{PLAN_FEATURES.map(([icon, title, description]) => <li key={title}><ConsumerIcon name={icon === "weather" ? "info" : icon} /><span><strong>{title}</strong><small>{description}</small></span></li>)}</ul>
            <ConsumerButton block variant={plan.featured ? "primary" : "secondary"} disabled={state === "ACTIVE" || state === "PROCESSING"} loading={state === "PROCESSING" && selectedPlan === plan.id} loadingLabel="Sandbox 연결 중…" onClick={() => selectPlan(plan)}>{state === "ACTIVE" ? "Premium 활성" : `${plan.duration} 플랜 선택`}</ConsumerButton>
          </article>)}
        </section>

        <section className="cr22-checkout__toss"><ConsumerIcon name="info" /><div><strong>테스트 플랜은 Toss Payments 샌드박스 계정으로만 결제됩니다.</strong><span>결제 성공 후 Premium 기능을 체험하실 수 있습니다.</span></div><b translate="no">toss payments <small>sandbox</small></b></section>
        <button className="cr22-checkout__back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 이전 화면으로 돌아가기</button>
      </ConsumerContainer>
    </ConsumerR2Theme>
  );
}
