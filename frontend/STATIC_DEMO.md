# TASK-395 static demo source

This branch builds the portfolio archive from the production frontend at
`main@9310d659cace8e041314208b8473d088e7e182ec`.

## What is reused

- Production React pages and shared components from `consumer-r2` and `admin-v2`
- Production CSS, design tokens, typography, controls, cards, navigation, and icons
- The production `route-map.png` asset for the backend-free map canvas

## Static boundaries

- `src/static-demo/StaticDemoApp.jsx` selects production pages with hash routes.
- `src/static-demo/fixtures.js` supplies deterministic Promise-based adapters.
- Kakao Maps, backend APIs, inference, OAuth, DB, payment, weather, and live inventory are not called.
- A compact banner is the only new navigation/identity layer.
- Admin is read-only and limited to the production operations dashboard route.

## Build and verify

```powershell
$env:REACT_APP_STATIC_DEMO='true'
$env:PUBLIC_URL='/ddarung-flow'
npm test -- --watchAll=false --runInBand
npm run build
```

The `build` directory is the only content deployed to `gh-pages`; this source
branch does not alter `main` or the existing staging/CD behavior.
