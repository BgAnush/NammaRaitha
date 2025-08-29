import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../supabase/supabaseClient';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const autoLogin = async () => {
      try {
        const storedEmail = await AsyncStorage.getItem('userEmail');
        const storedPassword = await AsyncStorage.getItem('userPassword');
        const storedRole = await AsyncStorage.getItem('userRole');

        if (storedEmail && storedPassword && storedRole) {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: storedEmail,
            password: storedPassword,
          });

          if (authError) {
            console.error('Auto-login failed:', authError.message);
          } else {
            console.log('Auto-login successful for:', storedEmail);

            // Check if userId is already stored
            const storedId = await AsyncStorage.getItem('userId');
            if (!storedId && authData?.user?.id) {
              await AsyncStorage.setItem('userId', authData.user.id);
            }

            redirectToDashboard(storedRole);
            return; // stop further execution
          }
        } else {
          console.log('No stored credentials found for auto-login');
        }
      } catch (err) {
        console.error('Auto login error:', err);
      } finally {
        setLoading(false);
      }
    };

    autoLogin();
  }, []);

  const redirectToDashboard = (role) => {
    if (role === 'farmer') {
      router.replace('/(tabs)/farmerDashboard');
    } else if (role === 'retailer') {
      router.replace('/(tabs)/retailerDashboard');
    } else {
      Alert.alert('Invalid Role', 'Could not determine user role.');
    }
  };

  const loginUser = async () => {
    if (!email || !password) {
      Alert.alert('Validation Error', 'Please enter both email and password');
      return;
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        Alert.alert('Login Failed', authError.message);
        return;
      }

      // Fetch user profile to get role and id
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        Alert.alert('Error', 'Could not fetch user profile.');
        return;
      }

      // Save email, password, role, and userId to AsyncStorage
      await AsyncStorage.setItem('userEmail', email);
      await AsyncStorage.setItem('userPassword', password);
      await AsyncStorage.setItem('userRole', profileData.role);
      await AsyncStorage.setItem('userId', profileData.id);

      Alert.alert('Login Successful');
      redirectToDashboard(profileData.role);
    } catch (err) {
      Alert.alert('Error', 'Something went wrong during login.');
      console.error('Login error:', err);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007bff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />
      <Button title="Login" onPress={loginUser} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
  },
});
