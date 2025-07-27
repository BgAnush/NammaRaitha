import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ImageBackground,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function Signup() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ✅ Backend Render API endpoint
  const BACKEND_URL = 'http://192.168.31.63:8080/api/users';

  const handleSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert('Missing Fields', 'Please fill in all fields.');
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success !== false) {
        Alert.alert('Success', 'Signup successful!', [
          { text: 'OK', onPress: () => router.replace('/login') },
        ]);
      } else {
        Alert.alert('Signup Failed', data.message || 'Email already exists.');
      }
    } catch (error) {
      console.error('Signup Error:', error);
      Alert.alert('Error', 'Could not connect to server.');
    }
  };

  return (
    <ImageBackground
      source={require('../assets/images/signup-bg.jpeg')} // ✅ Make sure this image exists
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <View style={styles.formContainer}>
          <Text style={styles.title}>Sign Up</Text>

          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#ccc"
            onChangeText={setName}
            value={name}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#ccc"
            keyboardType="email-address"
            onChangeText={setEmail}
            value={email}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#ccc"
            secureTextEntry
            onChangeText={setPassword}
            value={password}
          />

          <TouchableOpacity style={styles.button} onPress={handleSignup}>
            <Text style={styles.buttonText}>Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 25,
    borderRadius: 20,
    width: '85%',
  },
  title: {
    fontSize: 26,
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    height: 48,
    borderColor: '#fff',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: '#fff',
  },
  button: {
    backgroundColor: '#28a745',
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    textAlign: 'center',
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
