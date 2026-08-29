FROM --platform=$BUILDPLATFORM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}
ARG REACT_APP_AUTH_BASE_URL
ENV REACT_APP_AUTH_BASE_URL=${REACT_APP_AUTH_BASE_URL}
ARG REACT_APP_JOURNEY_ENABLED
ENV REACT_APP_JOURNEY_ENABLED=${REACT_APP_JOURNEY_ENABLED}
ENV GENERATE_SOURCEMAP=false

RUN --mount=type=secret,id=kakao_map_app_key \
    --mount=type=secret,id=toss_payments_client_key \
    REACT_APP_KAKAO_MAP_APP_KEY="$(cat /run/secrets/kakao_map_app_key)" \
    REACT_APP_TOSS_PAYMENTS_CLIENT_KEY="$(cat /run/secrets/toss_payments_client_key)" \
    npm run build

FROM nginx:1.29-alpine AS runtime

COPY nginx.staging.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
