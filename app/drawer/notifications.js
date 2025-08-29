// backend/sendNotification.js
import fetch from 'node-fetch';
import { supabase } from '../supabase/supabaseClient'; // Your Supabase client

export async function sendPushNotification(userId, title, body, type, relatedId = null) {
  try {
    // Insert notification in DB
    const { data, error } = await supabase
      .from('notifications')
      .insert([{ user_id: userId, title, body, type, related_id: relatedId }]);

    if (error) {
      console.error('Notification DB error:', error);
      return;
    }

    // Get push token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.push_token) return;

    const message = {
      to: profile.push_token,
      sound: 'default',
      title,
      body,
      data: { type, relatedId },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    console.log('Push notification sent:', await response.json());
  } catch (err) {
    console.error('sendPushNotification error:', err);
  }
}
