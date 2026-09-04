import { useEffect, useRef, useState } from "react";
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
  window.history.replaceState({}, "", `${window.location.pathname}#premium/checkout`);
}

// Toss can redirect back with its own return params (paymentKey, orderId, amount, ...) appended
// to the full successUrl string without knowing it already ends in a `#premium/checkout` hash
// fragment, landing them after the hash as `&paymentKey=...` instead of in the real query
// string. Read from the real search string first, then fall back to whatever follows the first
// `&` (or `?`) inside the hash so a provider-side append after the fragment still works.
function paymentCallbackParams(query, hash) {
  const params = new URLSearchParams(query);
  if (params.get("paymentKey")) return params;
  const tailStart = Math.min(...["&", "?"].map((sep) => { const index = hash.indexOf(sep); return index === -1 ? Infinity : index; }));
  if (!Number.isFinite(tailStart)) return params;
  for (const [key, value] of new URLSearchParams(hash.slice(tailStart + 1))) params.set(key, value);
  return params;
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
  const [catalog, setCatalog] = useState({ status: "LOADING", plans: [] });
  const onSuccessRef = useRef(onSuccess);
  const confirmationRef = useRef(null);

  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  useEffect(() => {
    if (authState !== "authenticated") {
      setCatalog({ status: "IDLE", plans: [] });
      return undefined;
    }
    let active = true;
    setCatalog({ status: "LOADING", plans: [] });
    adapter.loadPlans()
      .then((plans) => {
        if (!Array.isArray(plans) || plans.length === 0) throw new Error("PAYMENT_PLANS_UNAVAILABLE");
        if (active) setCatalog({ status: "READY", plans });
      })
      .catch(() => {
        if (active) setCatalog({ status: "ERROR", plans: [] });
      });
    return () => { active = false; };
  }, [adapter, authState]);

  useEffect(() => {
    const nextState = normalizePremiumAccessState(accessState, authState);
    setState(nextState);
    if (nextState === "ANONYMOUS") setMessage("Sandbox 테스트 플랜을 선택하려면 먼저 로그인해 주세요.");
    else if (nextState === "PROCESSING") setMessage("Sandbox 결제 결과와 Premium 접근 상태를 확인하고 있습니다.");
    else if (nextState === "ACTIVE") setMessage("Premium 접근 상태가 활성화되어 AI 기능을 사용할 수 있습니다.");
    else if (nextState === "EXPIRED") setMessage("이전 Sandbox Premium 접근 기간이 끝났습니다. 새 테스트 플랜을 선택할 수 있습니다.");
    else if (nextState === "ERROR") setMessage("Premium 접근 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
    else setMessage("");
  }, [accessState, authState]);

  useEffect(() => {
    if (authState !== "authenticated") {
      confirmationRef.current = null;
      return undefined;
    }
    if (!confirmationRef.current) confirmationRef.current = { query: window.location.search, hash: window.location.hash };
    const params = paymentCallbackParams(confirmationRef.current.query, confirmationRef.current.hash);
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
    if (!confirmationRef.current.request) {
      confirmationRef.current.request = adapter.confirm(payment).then(() => adapter.load());
    }
    confirmationRef.current.request
      .then((subscription) => {
        if (!active) return;
        const confirmedState = normalizePremiumAccessState(subscription?.status);
        setState(confirmedState);
        clearPaymentCallbackQuery();
        if (confirmedState === "ACTIVE") {
          setMessage("Sandbox 결제가 승인되어 Premium 접근 상태가 활성화되었습니다.");
          onSuccessRef.current?.(subscription);
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
  }, [adapter, authState]);

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

        {message ? <section className={`cr22-checkout__message is-${state.toLowerCase()}`} role={state === "ERROR" ? "alert" : "status"} aria-live="polite"><strong>{state === "ACTIVE" ? "Premium 활성" : state === "EXPIRED" ? "접근 기간 만료" : state === "ERROR" ? "확인 필요" : state === "PROCESSING" ? "처리 중" : "Sandbox 안내"}</strong><span>{message}</span></section> : state === "EXPIRED" ? <section className="cr22-checkout__message is-expired" role="status"><strong>접근 기간 만료</strong><span>이전 Sandbox Premium 접근 기간이 끝났습니다. 새 테스트 플랜을 선택할 수 있습니다.</span></section> : null}

        {authState === "authenticated" && catalog.status === "LOADING" ? <section className="cr22-checkout__message" role="status"><strong>플랜 정보 확인 중</strong><span>Sandbox 테스트 플랜의 가격과 이용 기간을 불러오고 있습니다.</span></section> : null}
        {authState === "authenticated" && catalog.status === "ERROR" ? <section className="cr22-checkout__message is-error" role="alert"><strong>플랜 정보 확인 필요</strong><span>Sandbox 테스트 플랜 정보를 불러오지 못했습니다. 잠시 후 다시 방문해 주세요.</span></section> : null}

        <section className="cr22-checkout__plans" aria-label="Premium 테스트 플랜 선택" aria-busy={authState === "authenticated" && catalog.status === "LOADING"}>
          {authState !== "authenticated" ? <ConsumerButton onClick={onLogin}>로그인하고 플랜 확인</ConsumerButton> : null}
          {(authState === "authenticated" ? catalog.plans : []).map((plan) => <article className={`cr22-checkout__plan${plan.featured ? " is-featured" : ""}${selectedPlan === plan.id ? " is-selected" : ""}`} key={plan.id}>
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
