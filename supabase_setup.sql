-- Create the table for problems
create table problems (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text,
  difficulty text default 'Easy',
  topics text[],
  notes text,
  revision_count int default 0,
  next_revision_date timestamptz default now(),
  solved_date timestamptz default now(),
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table problems enable row level security;

-- Policies for Frontend access (if you were using RLS directly, but we use Backend Service Role mostly? 
-- Actually, the frontend is fetching via our Backend API, and Backend API uses Service Role.
-- But if we ever want direct access or strictness:
create policy "Users can see their own problems"
  on problems for select
  using (auth.uid() = user_id);

create policy "Users can insert their own problems"
  on problems for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own problems"
  on problems for update
  using (auth.uid() = user_id);

create policy "Users can delete their own problems"
  on problems for delete
  using (auth.uid() = user_id);
