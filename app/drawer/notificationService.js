// notificationService.js
import { supabase } from '../supabase/supabaseClient';

/**
 * Sends a notification to a user:
 * 1️⃣ Saves it in Supabase `notifications` table
 * 2️⃣ Sends Expo push notification if push_token exists
 * 
 * @param {Object} params
 * @param {string} params.userId - ID of the user to notify
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {string} params.type - Type: 'message', 'new_conversation', 'order', etc.
 * @param {string|null} params.relatedId - Optional related entity ID (conversation/order)
 */
export const sendNotification = async ({ userId, title, body, type, relatedId = null }) => {
  try {
    // 1️⃣ Insert notification in DB
    const { data: notification, error: insertError } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        title,
        body,
        type,
        related_id: relatedId,
        read: false
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // 2️⃣ Fetch user's push token
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    // 3️⃣ Send push notification if token exists
    if (profile?.push_token) {
      await sendPushNotification({
        token: profile.push_token,
        title,
        body,
        data: { notificationId: notification.id, type, relatedId }
      });
    }

    return notification;
  } catch (error) {
    console.error('[NotificationService] Error sending notification:', error.message || error);
    throw error;
  }
};

/**
 * Sends Expo push notification
 * @param {Object} params
 * @param {string} params.token - Expo push token
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body
 * @param {Object} params.data - Additional data payload
 */
const sendPushNotification = async ({ token, title, body, data = {} }) => {
  try {
    const message = {
      to: token,
      sound: 'default',
      title,
      body,
      data: { ...data, _displayInForeground: true },
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message);
    }

    return result;
  } catch (error) {
    console.error('[NotificationService] Error sending push notification:', error.message || error);
    throw error;
  }
};

/**
 * Utility to test notification sending
 * @param {string} userId - User ID to test
 */
export const testNotification = async (userId) => {
  return sendNotification({
    userId,
    title: 'Test Notification',
    body: 'This is a test notification from the app',
    type: 'test',
  });
};
