# Frontend dependency security baseline

## Scope

This document records the SEC-3.1 review of the Create React App build and test dependency tree. It does not claim that every npm advisory is removed. It distinguishes packages used while building or testing from files shipped in the final nginx runtime image.

- Baseline commit: `origin/main@580e9bb9a94e351821edf28990384179f39ad3da`
- Review date: 2026-08-11
- Next review: 2026-08-25, or earlier when the frontend build toolchain changes
- Prohibited remediation: `npm audit fix --force` and an unapproved CRA-to-Vite migration

## Audit result

| Severity | Baseline | After safe update | Change |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 18 | 14 | -4 |
| Moderate | 5 | 5 | 0 |
| Low | 9 | 9 | 0 |
| Total | 32 | 28 | -4 |

`npm audit fix --package-lock-only --ignore-scripts` applied only compatible patch releases already allowed by the transitive dependency ranges. A second `npm audit fix --dry-run --json` reported zero additional non-breaking changes.

## Safe transitive updates

| Package | Previous | Updated | Dependency path and reason |
|---|---:|---:|---|
| `nanoid` | 3.3.16 | 3.3.18 | `react-scripts -> postcss`; fixes the reported generator loop advisory |
| `js-yaml` | 3.15.0 | 3.15.1 | `react-scripts -> svgo` and Jest configuration paths; fixes quadratic `!!omap` processing |
| `js-yaml` | 4.3.0 | 4.3.1 | ESLint configuration paths; fixes the same advisory in the 4.x line |
| `brace-expansion` | 1.1.17 | 1.1.18 | ESLint/minimatch path; fixes unbounded intermediate expansion |
| `brace-expansion` | 2.1.3 | 2.1.4 | Workbox/filelist/minimatch path; fixes the same advisory in the 2.x line |
| `fast-uri` | 3.1.4 | 3.1.5 | `react-scripts -> schema-utils -> ajv`; fixes host-confusion parsing |

The lockfile contains seven changed package entries because `js-yaml` 4.3.1 is installed in two ESLint locations. `package.json` did not need an override or direct dependency change.

## Remaining advisory groups

All remaining packages are reached through `react-scripts@5.0.1`. They exist in the Node build or test stage. The final image serves only generated HTML, CSS, and JavaScript with nginx.

| Group | Representative path | Stage and exposure | Why it remains |
|---|---|---|---|
| SVG optimization | `react-scripts -> @svgr/webpack -> @svgr/plugin-svgo -> svgo@1.3.2 -> css-select@2.1.0 -> nth-check@1.0.2` | Build-only; processes repository-controlled SVG assets | npm proposes `react-scripts@0.0.0` as a breaking fix. No compatible patch is available under CRA 5. |
| CSS URL processing | `react-scripts -> resolve-url-loader@4.0.0 -> postcss@7.0.39` | Build-only; processes repository-controlled CSS and source maps | The nested PostCSS major is fixed only by replacing the parent build chain. Production source maps are disabled in the Docker build. |
| Minification and Workbox | `react-scripts -> css-minimizer-webpack-plugin -> serialize-javascript@6.0.2` and `react-scripts -> workbox-webpack-plugin -> workbox-build -> rollup-plugin-terser -> serialize-javascript@4.0.0` | Build-only; receives the project's bundle configuration | npm's proposed fix is a breaking `react-scripts` replacement. The affected packages are absent from nginx runtime. |
| Development server | `react-scripts -> webpack-dev-server@4.15.2 -> sockjs -> uuid@8.3.2` | Development-only; `npm start` is not used by the staging image | The final container runs nginx and exposes no webpack development server. |
| Build statistics | `react-scripts -> bfj@7.1.0 -> jsonpath@1.3.0 -> underscore@1.13.6` | Build-only; not callable by browser traffic | Although npm labels the leaf fix as available, the post-update dry-run found zero compatible lockfile changes. |
| Jest and jsdom | `react-scripts -> jest@27.5.1 -> jest-environment-jsdom -> jsdom -> http-proxy-agent -> @tootallnate/once` | Test-only | These packages execute in local or CI tests and are not copied to the runtime image. |

The audit count represents affected dependency nodes, not 28 independent remotely exploitable runtime endpoints. This classification reduces runtime exposure but does not erase the build and CI supply-chain risk. Repositories and pull requests that feed the build must remain trusted and reviewed.

## Runtime hardening

The build stage now sets `GENERATE_SOURCEMAP=false`. This prevents CRA from generating `.map` files before the build output is copied into nginx. Multi-stage Docker construction continues to keep the Node toolchain out of the final image.

Verified on `ddarung-flow-frontend:security-check`:

- Node executable: absent
- npm executable: absent
- `node_modules` directories under `/usr/share/nginx/html`: 0
- source map files under `/usr/share/nginx/html`: 0
- `.env*` files under `/usr/share/nginx/html`: 0
- files matching the limited private-key, AWS access-key, GitHub token, and OpenAI-key scan: 0

The pattern scan is a release check, not a guarantee that every possible secret format is detectable. Actual credentials must never be placed in the frontend build context.

## Verification

The following checks must pass again on the exact commit submitted for review:

```powershell
cd frontend
npm.cmd ci
npm.cmd audit --json
npm.cmd audit fix --dry-run --json
npm.cmd test -- --watchAll=false
npm.cmd run build
cd ..
docker build --no-cache -t ddarung-flow-frontend:security-check frontend
docker run --rm ddarung-flow-frontend:security-check sh -c "test ! -e /usr/share/nginx/html/node_modules && ! command -v node && ! command -v npm && test $(find /usr/share/nginx/html -type f -name '*.map' | wc -l) -eq 0"
```

Expected results are 6 passing test suites, 40 passing tests, a successful production and Docker build, 28 remaining build/test dependency records, and zero critical advisories.

## Frontend client configuration rotation

Browser client configuration must not be printed in CI logs. The staging frontend build uses BuildKit secrets for client-key inputs, and the workflow masks those inputs before the image build begins.

Actual client-key values must never be recorded in the repository, Notion, or project documentation. After a provider or GitHub setting is replaced, a new frontend SHA must be rebuilt so the immutable staging image receives the replacement browser configuration. Revoke the previous client key only after browser smoke verification succeeds against that new staging image.

Server-only secrets must never be passed to the frontend build. The JNY-SEC-1 incident remediation was applied in pull request #237. This documentation-only change creates the staging rotation deployment candidate; it does not change application behavior or activate any provider.
