FROM public.ecr.aws/docker/library/node:22-slim AS build

WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package*.json ./
RUN npm ci --no-audit --no-fund --loglevel=error

COPY . .
RUN npm run build

FROM public.ecr.aws/docker/library/nginx:1.27-alpine

RUN apk add --no-cache curl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
CMD ["/bin/sh", "-ec", "rm -f /etc/nginx/conf.d/default.conf && export AUTH_PROXY_SCHEME=\"${AUTH_PROXY_SCHEME:-https}\" AUTH_PROXY_UPSTREAM=\"${AUTH_PROXY_UPSTREAM:-fulleduca-auth:80}\" API_PROXY_SCHEME=\"${API_PROXY_SCHEME:-${AUTH_PROXY_SCHEME:-https}}\" API_PROXY_UPSTREAM=\"${API_PROXY_UPSTREAM:-${AUTH_PROXY_UPSTREAM:-fulleduca-auth:80}}\" NGINX_DNS_RESOLVER=\"${NGINX_DNS_RESOLVER:-127.0.0.11}\" NGINX_DNS_VALID_SECONDS=\"${NGINX_DNS_VALID_SECONDS:-30}\" && envsubst '${AUTH_PROXY_SCHEME} ${AUTH_PROXY_UPSTREAM} ${API_PROXY_SCHEME} ${API_PROXY_UPSTREAM} ${NGINX_DNS_RESOLVER} ${NGINX_DNS_VALID_SECONDS}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/nginx.conf && nginx -t && exec nginx -g 'daemon off;'"]

EXPOSE 80
