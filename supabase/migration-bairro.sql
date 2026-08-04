-- Adiciona o campo "bairro" aos leads (usado, entre outros, na
-- personalização de e-mails com o marcador [bairro]).
alter table public.leads
  add column if not exists bairro text;
