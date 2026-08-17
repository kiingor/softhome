# Build do frontend do DNA Softcom para hospedagem própria (substitui a Vercel).
#
# As VITE_* são lidas em tempo de BUILD (o Vite as embute no bundle), por isso
# entram como ARG e não como variável de runtime do container.

# 1-alpine e nao 1.1: o bun.lockb do repo foi gerado por um bun mais novo, e o
# 1.1 falha com "Outdated lockfile version".
FROM oven/bun:1-alpine AS build
WORKDIR /app

# Dependências primeiro: só reinstala quando o lockfile muda.
COPY package.json bun.lockb ./
# Sem --frozen-lockfile: o bun 1.2+ migra o bun.lockb binário pro bun.lock texto
# e trata a migração como "lockfile had changes". As versões continuam saindo do
# lockfile — a migração é de formato, não de resolução. Para voltar a travar,
# rode `bun install` no repo e commite o bun.lock resultante.
RUN bun install

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
RUN test -n "$VITE_SUPABASE_URL" || (echo "VITE_SUPABASE_URL é obrigatório no build" && exit 1)
RUN bun run build


FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Incluído por cada `location` do nginx.conf — ver o comentário lá sobre
# `add_header` não ser herdado.
COPY security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html

# 127.0.0.1 e nao localhost: o /etc/hosts da imagem resolve localhost para ::1
# tambem, e o `listen 80` do nginx so abre IPv4 — o healthcheck falhava com
# "connection refused" e o Traefik nao roteia container unhealthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

EXPOSE 80
