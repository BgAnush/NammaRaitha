import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../supabase/supabaseClient';



export default function Signup() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
    role: '', // farmer or retailer
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleRoleChange = (role) => {
    setFormData(prev => ({ ...prev, role }));
  };

  const validateInputs = () => {
    let newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.email) newErrors.email = 'Email is required';
    else if (!emailRegex.test(formData.email)) newErrors.email = 'Invalid email format';

    if (!formData.name) newErrors.name = 'Name is required';

    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';

    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (formData.confirmPassword !== formData.password)
      newErrors.confirmPassword = 'Passwords do not match';

    if (!formData.role) newErrors.role = 'Please select a role';
    else if (!['farmer', 'retailer'].includes(formData.role))
      newErrors.role = 'Role must be Farmer or Retailer';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateInputs()) return;

    try {
      // ✅ Step 1: Create Auth Account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (signUpError) {
        console.error(signUpError);
        Alert.alert('Signup Error', signUpError.message);
        return;
      }

      const userId = signUpData.user?.id;
      if (!userId) {
        Alert.alert('Error', 'User ID not returned from Supabase.');
        return;
      }

      // ✅ Step 2: Insert Profile Details
      const { error: insertError } = await supabase
        .from('profiles')
        .insert([{
          id: userId,
          email: formData.email,
          password: formData.password, // ❗ stored as plain text (for your project)
          name: formData.name,
          role: formData.role
        }]);

      if (insertError) {
        console.error(insertError);
        Alert.alert('Database Error', insertError.message);
        return;
      }

      // ✅ Step 3: Save to AsyncStorage
      await AsyncStorage.setItem('userEmail', formData.email);
      await AsyncStorage.setItem('userPassword', formData.password);
      await AsyncStorage.setItem('userRole', formData.role);

      // ✅ Step 4: Notify & Redirect
      const successMsg = 'Account created successfully';
      if (Platform.OS === 'web') {
        alert(successMsg);
        router.push('/login');
      } else {
        Alert.alert('Success', successMsg, [{ text: 'OK', onPress: () => router.push('/login') }]);
      }

    } catch (err) {
      console.error(err);
      Alert.alert('Error', err.message || 'Signup failed');
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/images/signup-bg.jpeg')}
      style={styles.background}
      resizeMode="cover"
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.glassContainer}>
          <Text style={styles.title}>Create Account</Text>

          <TextInput
            placeholder="Email"
            value={formData.email}
            onChangeText={(text) => handleInputChange('email', text)}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#333"
          />
          {errors.email && <Text style={styles.error}>{errors.email}</Text>}

          <TextInput
            placeholder="Name"
            value={formData.name}
            onChangeText={(text) => handleInputChange('name', text)}
            style={styles.input}
            placeholderTextColor="#333"
          />
          {errors.name && <Text style={styles.error}>{errors.name}</Text>}

          <TextInput
            placeholder="Password"
            value={formData.password}
            onChangeText={(text) => handleInputChange('password', text)}
            style={styles.input}
            secureTextEntry={!showPassword}
            placeholderTextColor="#333"
          />
          {errors.password && <Text style={styles.error}>{errors.password}</Text>}

          <TextInput
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChangeText={(text) => handleInputChange('confirmPassword', text)}
            style={styles.input}
            secureTextEntry={!showPassword}
            placeholderTextColor="#333"
          />
          {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword}</Text>}

          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.toggle}>{showPassword ? 'Hide Password' : 'Show Password'}</Text>
          </TouchableOpacity>

          <View style={styles.roleContainer}>
            {['farmer', 'retailer'].map((role) => (
              <TouchableOpacity
                key={role}
                style={[styles.roleButton, formData.role === role && styles.selectedRole]}
                onPress={() => handleRoleChange(role)}
              >
                <Text style={styles.roleText}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.role && <Text style={styles.error}>{errors.role}</Text>}

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text style={styles.loginText}>Already have an account? Log in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

// ✅ Styles (unchanged from your code)
const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  glassContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderRadius: 20,
    padding: 25,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 20, color: '#000' },
  input: {
    backgroundColor: 'transparent',
    padding: 12,
    marginBottom: 10,
    borderRadius: 12,
    fontSize: 16,
    color: '#000',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderStyle: 'dashed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  error: { color: 'red', fontSize: 13, marginBottom: 5 },
  toggle: { color: '#1b1b1b', fontSize: 14, marginBottom: 15, textAlign: 'right' },
  roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  roleButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 10,
    alignItems: 'center',
  },
  selectedRole: { backgroundColor: '#32CD32' },
  roleText: { color: '#000', fontWeight: '600', textTransform: 'capitalize' },
  button: { backgroundColor: '#28a745', padding: 14, borderRadius: 12, marginTop: 10 },
  buttonText: { textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: 16 },
  loginText: { marginTop: 15, color: '#007bff', textAlign: 'center', fontSize: 15 },
});
