import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Deletes produce by id only if owned by current user (userId from local storage)
export const deleteProduce = async (produceId) => {
  try {
    const userId = await AsyncStorage.getItem('userId'); // get userId from local storage
    if (!userId) {
      throw new Error('User not logged in');
    }

    const response = await axios.delete(`https://fastapi-backend-boik.onrender.com/produce/${produceId}`, {
      headers: {
        'X-User-Id': userId,  // send userId as header for backend auth check
      },
    });

    if (response.status === 200) {
      console.log('Produce deleted successfully');
      return true;
    }
  } catch (error) {
    console.error('Error deleting produce:', error.response?.data || error.message);
    return false;
  }
};
