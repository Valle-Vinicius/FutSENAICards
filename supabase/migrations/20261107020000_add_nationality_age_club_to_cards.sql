-- Migration: Adicionar colunas nationality, age, club à tabela cards
alter table public.cards add column if not exists nationality text not null default 'Brasil';
alter table public.cards add column if not exists age integer not null default 20;
alter table public.cards add column if not exists club text not null default 'Clube';
