# Cabeçalhos de segurança do DNA Softcom.
#
# Incluído em TODOS os `location` do nginx.conf, e não só no `server`, porque
# `add_header` num location descarta os herdados — ver o comentário lá.
#
# Espelha o bloco "headers" do vercel.json. Se mudar um, mude o outro enquanto
# as duas hospedagens coexistirem.

# Sistema interno: não indexar em lugar nenhum.
add_header X-Robots-Tag "noindex, nofollow" always;

# Sem sniffing de tipo: o navegador respeita o Content-Type declarado.
add_header X-Content-Type-Options "nosniff" always;

# Clickjacking. `frame-ancestors` é a versão moderna e é a que os navegadores
# atuais respeitam; X-Frame-Options fica pelos legados. `meta http-equiv` não
# suporta frame-ancestors, por isso ele precisa vir por header.
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "frame-ancestors 'none'" always;

# Não vazar a URL interna (que carrega ids de colaborador) pra terceiros.
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Nenhuma tela do DNA usa esses recursos.
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" always;

# Isola o contexto de navegação de janelas abertas por/para o app.
add_header Cross-Origin-Opener-Policy "same-origin" always;

# HSTS. O TLS termina no Cloudflare, mas o navegador vê a resposta por HTTPS e
# honra o header. Sem `preload` de propósito: preload é entrada em lista dos
# navegadores, difícil de reverter, e o host atual ainda é de homologação.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
