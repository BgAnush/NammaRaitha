import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL='https://zeahrisijpczktlpwgvj.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplYWhyaXNpanBjemt0bHB3Z3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMTgwMDYsImV4cCI6MjA2OTc5NDAwNn0.eLyB07SBfEJvJ40xaypCjeWQMj1fYItgrJlNzyQcWS4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
