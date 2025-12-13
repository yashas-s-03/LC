-- Create the table
create table public.problems (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null default auth.uid (),
  title text not null,
  url text null,
  difficulty text null check (difficulty in ('Easy', 'Medium', 'Hard')),
  topics text[] null,
  notes text null,
  solved_date timestamp with time zone not null default now(),
  revision_count integer not null default 0,
  next_revision_date timestamp with time zone null default now(),
  constraint problems_pkey primary key (id),
  constraint problems_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

-- Enable Row Level Security
alter table public.problems enable row level security;

-- Create Policy: Individual users can see their own problems
create policy "Users can view their own problems" on public.problems
  for select
  using (auth.uid() = user_id);

-- Create Policy: Users can insert their own problems
create policy "Users can insert their own problems" on public.problems
  for insert
  with check (auth.uid() = user_id);

-- Create Policy: Users can update their own problems
create policy "Users can update their own problems" on public.problems
  for update
  using (auth.uid() = user_id);

-- Create Policy: Users can delete their own problems
create policy "Users can delete their own problems" on public.problems
  for delete
  using (auth.uid() = user_id);
