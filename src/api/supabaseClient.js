import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rtgfckpvddyajkceckll.supabase.co'
const supabaseKey = 'sb_publishable_zagKnQO6bBT3xo6J61bmPw_jMkNzSfh'

export const supabase = createClient(supabaseUrl, supabaseKey)