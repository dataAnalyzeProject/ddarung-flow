FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG REACT_APP_API_BASE_URL
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}
ARG REACT_APP_AUTH_BASE_URL
ENV REACT_APP_AUTH_BASE_URL=${REACT_APP_AUTH_BASE_URL}
ARG REACT_APP_KAKAO_MAP_APP_KEY
ENV REACT_APP_KAKAO_MAP_APP_KEY=${REACT_APP_KAKAO_MAP_APP_KEY}
ENV GENERATE_SOURCEMAP=false

RUN npm run build

FROM nginx:1.29-alpine AS runtime

COPY nginx.staging.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
