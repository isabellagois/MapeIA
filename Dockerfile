# ---- Estágio 1: build da SPA ----
FROM node:20-alpine AS build
WORKDIR /app

# Instala dependências a partir do lockfile (build reproduzível)
COPY package.json package-lock.json ./
RUN npm ci

# Copia o código e gera o build de produção
COPY . .
# As variáveis VITE_* são embutidas no build. Passe as suas com --build-arg.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---- Estágio 2: servir os arquivos estáticos com Nginx ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Observação: este container serve apenas a SPA. A função serverless de
# e-mail (api/enviar-emails.ts) é específica da Vercel e não roda aqui.
