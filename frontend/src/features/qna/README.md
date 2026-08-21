# Q&A API page

`QnaPage` keeps the existing `/#qna` route and visual structure while consuming the fixed `/api/v1/qna/questions` contract.

- Public/mine list scope, search, category, status, and server pagination
- Question detail and authenticated creation
- Explicit loading, empty, error, and login-required states
- Cookie credentials and the existing `/api/v1/auth/csrf` contract for creation
