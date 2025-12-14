-- Run this in your Supabase SQL Editor to fix the missing columns error

alter table problems add column if not exists created_at timestamptz default now();
alter table problems add column if not exists solved_date timestamptz default now();
