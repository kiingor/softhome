# santander-gw — terminador mTLS do PIX da folha (ver ADR 0006).
#
# TAG FIXA, NÃO `alpine` SOLTO. `Deno.createHttpClient` é API instável, e a
# razão de este serviço existir fora do edge-runtime é justamente não depender de
# uma flag que um bump de imagem pode mexer sem avisar — no dia do pagamento.
# Subir de versão aqui é decisão consciente, com o /health conferido depois
# (ele reporta `mtls_supported`).
FROM denoland/deno:alpine-2.1.4

# Usuário próprio em vez de reaproveitar o `deno` da imagem: assim o container
# não depende de um detalhe interno da imagem base pra rodar sem root. Este
# processo lê uma chave privada de e-CNPJ — root aqui não se justifica.
ENV DENO_DIR=/deno-dir
RUN addgroup -S gw && adduser -S -G gw gw \
 && mkdir -p /deno-dir /app \
 && chown -R gw:gw /deno-dir /app

WORKDIR /app

# Fontes copiadas já com o dono certo, senão o `deno cache` abaixo (que roda
# como gw) não consegue escrever o cache.
COPY --chown=gw:gw mask.ts santander.ts main.ts ./

USER gw

# Cache/type-check das dependências em tempo de BUILD. O serviço não tem
# dependência externa de propósito (nada de esm.sh no processo que segura a
# chave privada), então isto é rápido — e ainda assim vale: um erro de tipo
# aparece aqui, no build, e não na primeira folha.
RUN deno cache main.ts

# --allow-read restrito a /certs: o processo não tem por que ler mais nada do
# disco. --unstable-http libera Deno.createHttpClient (o boot recusa subir sem).
# --allow-env sem lista porque toda a config vem de env e a lista viraria dívida
# a cada variável nova.
ENV PORT=8080
EXPOSE 8080

# 127.0.0.1 e nao localhost: o /etc/hosts da imagem resolve localhost tambem
# para ::1, e o servidor escuta IPv4 (0.0.0.0) — o healthcheck falharia com
# "connection refused". Mesma pegadinha que ja derrubou o healthcheck do
# frontend, veja o comentario no Dockerfile da raiz.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["run", \
     "--unstable-http", \
     "--allow-net", \
     "--allow-env", \
     "--allow-read=/certs", \
     "main.ts"]
