-- Create a table to track every revision event
CREATE TABLE IF NOT EXISTS position_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
    revised_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Policy to allow users to see/insert their own logs
ALTER TABLE position_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs" ON position_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own logs" ON position_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
