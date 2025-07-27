import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

export default function IndexPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/splash'); // or your login screen
    }, 100); // Delay ensures layout is mounted

    return () => clearTimeout(timer);
  }, []);

  return (
    <View>
      <Text>Loading...</Text>
    </View>
  );
}
