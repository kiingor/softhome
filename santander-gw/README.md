# santander-gw

Terminador mTLS do PIX da folha. É o único processo que enxerga a chave privada
do e-CNPJ e o único que fala com o Santander. Motivação e contrato completos em
[`docs/adr/0006-pagamento-pix-santander.md`](../docs/adr/0006-pagamento-pix-santander.md).

## Certificado: do `.pfx` pros PEM

O `.pfx` do e-CNPJ da Softcom usa PKCS#12 antigo. OpenSSL 3 recusa por padrão —
daí o `-legacy`. Sem ele o erro é um críptico `error:0308010C:digital envelope
routines::unsupported`, que não parece ter nada a ver com a idade do arquivo.

```bash
# Certificado (cadeia completa: folha + AC SAFEWEB + AC Raiz Brasileira v5 + ITI).
# A cadeia e o certificado-folha sozinho funcionam os dois; a cadeia é a opção segura.
openssl pkcs12 -legacy -in SOFTCOM.pfx -clcerts -nokeys -out client.crt

# Chave privada SEM SENHA (-nodes). Esquecer o -nodes gera "ENCRYPTED PRIVATE KEY",
# que o Deno não abre — o gateway recusa no boot com essa mensagem exata.
openssl pkcs12 -legacy -in SOFTCOM.pfx -nocerts -nodes -out client.key
```

Na VPS, os arquivos vão para `deploy/certs/` (montado como `/certs:ro`):

```bash
install -d -m 700 -o root -g root /root/dna-app/deploy/certs
install -m 600 client.crt client.key /root/dna-app/deploy/certs/
```

O `:ro` do volume protege o container de si mesmo; quem protege o host é o `700`
do diretório. Os PEM **não entram no git** — nem eles nem o `.pfx`.

## Subir

```bash
cd /root/dna-app
# crie deploy/santander-gw.env com as variáveis da tabela do fim deste README
# (chmod 600 — tem client_secret e o shared secret dentro)
docker compose -f deploy/santander-gw.yml --env-file deploy/santander-gw.env up -d --build

# quem chama precisa estar na mesma rede
docker network connect bank_net supabase-edge-functions

curl -s http://santander-gw:8080/health | jq   # de dentro da rede
```

`GW_SHARED_SECRET`: `openssl rand -hex 32`. O boot recusa subir com menos de 24
caracteres — é a única barreira depois da rede.

Smoke test (de dentro da `bank_net`):

```bash
curl -sX POST http://santander-gw:8080/pix/transfer \
  -H "Authorization: Bearer $GW_SHARED_SECRET" -H 'content-type: application/json' \
  -d '{"idempotency_key":"sh-teste-1","amount":"1.10","pix_key":"nozes@gmail.com",
       "pix_key_type":"email","payee_name":"Fulano de Tal","description":"Salário 08/2026"}'
```

## Como ler a resposta de erro

Todo erro traz `indeterminate`, e é ele que decide o que gravar no banco:

| `indeterminate` | Significa | O chamador faz |
|---|---|---|
| `false` | recusa provada, nada saiu (`bad_request`, `disabled`, `config`, `provider_rejected`) | `payroll_pix_fail` |
| `true` | não sabemos onde o dinheiro parou (`timeout`, `network`, `provider_unavailable`) | `payroll_pix_mark_unknown` |

**Invariante: 4xx ⇔ `indeterminate: false`, 5xx ⇔ `indeterminate: true`.** A
`payroll-pix-pay` classifica pela faixa do status, então o status é o contrato de
verdade. Por isso o kill-switch responde **423** e falta de configuração
responde **424**, em vez dos 503/500 que a semântica HTTP pediria: os dois são
comprovadamente pré-voo, e um 5xx ali prenderia a folha inteira em `unknown`.
Quem mexer nos códigos precisa manter essa correspondência.

| kind | status | |
|---|---|---|
| `bad_request` | 400 | recusado por nós |
| `unauthorized` | 401 | segredo errado |
| `disabled` | 423 | kill-switch |
| `config` | 424 | falta env var / certificado |
| `provider_rejected` | 422 | o banco disse não |
| `provider_unavailable` | 502 | 5xx/429/408 do banco |
| `timeout` | 504 | estourou o AbortController |
| `network` | 502 | TLS/DNS/conexão |

**Nunca reenvie POST ou PATCH automaticamente por causa de erro indeterminado.**
Se a primeira tentativa tinha vingado, a segunda paga duas vezes e PIX não tem
estorno unilateral. Retry automático aqui só existe em token e GET, e só em
429/503.

O sandbox é um **mock**: duas chamadas ao GET devolvem ids diferentes e ele não
guarda estado. Serve pra provar transporte e formato — nunca pra validar
reconciliação. O `/pix/search` avisa isso no próprio corpo da resposta.

## Corpo do POST /pix/transfer

Canônico: `idempotency_key`, `amount` (string), `pix_key`, `pix_key_type`
(minúsculo, o enum do nosso banco), `payee_name`, `payee_document`,
`description`. Opcionais: `payer {documentNumber, name}` e
`debit_account {branch, number}` — os dois existem porque o sistema é multi-CNPJ
e cada empresa paga com o próprio documento e conta.

O gateway também aceita os apelidos que a `payroll-pix-pay` usa (`dict_code`,
`dict_code_type`, `remittance_information`, `payee: {name, document}`) — a
tolerância é só de nome, o valor passa pela mesma validação. `tags` mandada pelo
chamador é ignorada: quem monta as tags é o gateway, a partir da
`idempotency_key`, e é essa tag que a reconciliação usa como prova.

Se o corpo trouxer `environment`, ele tem que bater com o host configurado —
divergência vira 400 antes de qualquer chamada. É a trava que separa "ensaiei"
de "paguei".

## Rotas de leitura: saldo, extrato e comprovante

Todas SÓ LEITURA (GET, exceto o POST que só pede a geração de um PDF) e sem
kill-switch — consultar nunca move dinheiro. Mesmo `GW_SHARED_SECRET`, mesmo
mTLS. Saldo/extrato falam com o host de pagamento; comprovante fala com
`SANTANDER_RECEIPTS_BASE_URL` (token OAuth próprio por host).

| Rota | O que faz |
|---|---|
| `GET /account/accounts` | lista as contas do titular (descobrir agência/conta na config) |
| `GET /account/balance` | saldo da conta pagadora (query `branch`/`account` sobrescrevem o default) |
| `GET /account/statement?initial_date=&final_date=` | extrato por intervalo (YYYY-MM-DD) |
| `GET /receipts?start_date=&end_date=&category=PIX&beneficiary_document=` | lista comprovantes → `paymentId` |
| `POST /receipts/{payment_id}/file_requests` | pede a geração do PDF (assíncrono) → `requestId` |
| `GET /receipts/{payment_id}/file_requests/{request_id}` | consulta até `statusCode=AVAILABLE` → `location` (PDF) |

⚠️ **Comprovante não tem sandbox.** A API `consult_payment_receipts` só existe em
`trust-open`/`trust-open-h`. Com credencial de sandbox ela provavelmente responde
401/403 até a virada de produção — por isso o recurso está pronto mas é validado
lá. Saldo/extrato, prove com um curl de dentro da `bank_net`:

```bash
curl -s http://santander-gw:8080/account/balance \
  -H "Authorization: Bearer $GW_SHARED_SECRET" | jq
```

## Kill-switch

`PIX_PAYMENTS_DISABLED=true` bloqueia **POST e PATCH** (criar e confirmar). É
lido a cada request, então desligar não exige redeploy nem rebuild — muda a
variável e `docker compose up -d`. `GET` e `/pix/search` continuam abertos de
propósito: quando o pagamento está desligado é justamente quando mais se precisa
consultar o que já saiu.

## ⚠️ Vencimento do certificado: 12/08/2027

Certificado vencido em dia de folha é o incidente clássico. O `/health` devolve
`cert_days_left` e `cert_expiry_warning` (30 dias antes) — coloque isso no
monitor.

```bash
openssl x509 -enddate -noout -in deploy/certs/client.crt
```

Na renovação, três passos e nenhum é opcional:

1. gerar os PEM novos (mesmos comandos acima) e substituir em `deploy/certs/`;
2. atualizar `SANTANDER_CERT_NOT_AFTER` no `.env` — o alerta sai dessa variável;
3. **reiniciar o container**: o PEM é lido uma vez e o cliente HTTP fica em
   memória. Trocar arquivo sem reiniciar não tem efeito nenhum.

O certificado também precisa estar **vinculado ao ClientId no portal do
Santander**. Se o token voltar `{"httpStatus":"Unauthorized hash","errorCode":403}`,
é isso, e não credencial nem rede (a tabela de diagnóstico está na ADR 0006).

## Variáveis

| Variável | Obrigatória | Nota |
|---|---|---|
| `SANTANDER_CLIENT_ID` | sim | também vai no header `X-Application-Key` |
| `SANTANDER_CLIENT_SECRET` | sim | |
| `SANTANDER_BASE_URL` | não | default sandbox; `trust-open` = produção (e o serviço deriva o ambiente daqui) |
| `SANTANDER_RECEIPTS_BASE_URL` | não | host do comprovante (consult_payment_receipts). Sem sandbox: default deriva do ambiente (produção→`trust-open`, resto→`trust-open-h`). Token OAuth é por host |
| `SANTANDER_WORKSPACE_ID` | sim | só o workspace com `pixPaymentsActive: true` aceita PIX |
| `SANTANDER_DEBIT_BRANCH` / `SANTANDER_DEBIT_ACCOUNT` | sim | conta padrão; a request pode sobrescrever (multi-CNPJ) |
| `GW_SHARED_SECRET` | sim | ≥ 24 chars |
| `PIX_PAYMENTS_DISABLED` | não | kill-switch, lido por request |
| `SANTANDER_CERT_NOT_AFTER` | não | default `2027-08-12` |
| `SANTANDER_CONFIRM_STATUS` | não | corpo do PATCH; default `AUTHORIZED` |
| `SANTANDER_PAYER_DOCUMENT` / `SANTANDER_PAYER_NAME` | não | fallback de empresa única; o normal é o pagador vir na request |
