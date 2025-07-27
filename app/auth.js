import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { BackHandler, Button, StyleSheet, Text, View } from 'react-native';

export default function AuthScreen() {
  const router = useRouter();

  useEffect(() => {
    const backAction = () => {
      router.replace('/splash'); // Replace current screen with splash
      return true; // Prevent default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Namma Raitha</Text>
      <View style={styles.buttonContainer}>
        <Button title="Login" onPress={() => router.push('/login')} />
        <Button title="Signup" onPress={() => router.push('/signup')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  buttonContainer: {
    width: '80%',
    gap: 20,
  },
});
