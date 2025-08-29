import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { createClient } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../supabase/supabaseClient';



// Helper: base64 to Uint8Array for uploads
const base64ToUint8Array = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export default function AddProduce() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [cropName, setCropName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [type, setType] = useState('vegetable');
  const [loading, setLoading] = useState(false);

  // Pick image from gallery
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets.length > 0) {
        setSelectedImage(result.assets[0]);
      }
    } catch (error) {
      Alert.alert('Error picking image', error.message);
    }
  };

  const uploadImageAndSaveProduce = async () => {
    if (!selectedImage) {
      Alert.alert('Please select an image');
      return;
    }
    if (!cropName.trim() || !quantity.trim() || !pricePerKg.trim()) {
      Alert.alert('Please fill all the fields');
      return;
    }

    setLoading(true);
    try {
      // Get logged in user ID from AsyncStorage
      const farmer_id = await AsyncStorage.getItem('userId');
      if (!farmer_id) {
        Alert.alert('User not logged in');
        setLoading(false);
        return;
      }

      // File details
      const mimeType = selectedImage.type || 'image/jpeg';
      const fileExt = mimeType.includes('/') ? mimeType.split('/')[1] : 'jpg';
      const fileName = `produce_${Date.now()}.${fileExt}`;
      const bucketName = 'produce-images';

      // Upload image to Supabase Storage
      let uploadResult;
      if (Platform.OS === 'web') {
        const response = await fetch(selectedImage.uri);
        const blob = await response.blob();
        uploadResult = await supabase.storage
          .from(bucketName)
          .upload(fileName, blob, { upsert: false, contentType: mimeType });
      } else {
        const base64Data = await FileSystem.readAsStringAsync(selectedImage.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const fileData = base64ToUint8Array(base64Data);
        uploadResult = await supabase.storage
          .from(bucketName)
          .upload(fileName, fileData, { upsert: false, contentType: mimeType });
      }

      if (uploadResult.error) throw uploadResult.error;

      // Get public URL
      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);
      const image_url = publicUrlData.publicUrl;

      // Insert into "produce" table
      const { error: insertError } = await supabase.from('produce').insert([
        {
          farmer_id,
          crop_name: cropName.trim(),
          quantity: parseInt(quantity, 10),
          price_per_kg: parseFloat(pricePerKg),
          image_url,
          type,
          status: 'in_stock',
        },
      ]);

      if (insertError) throw insertError;

      Alert.alert('Success', 'Produce added successfully');

      // Reset form
      setSelectedImage(null);
      setCropName('');
      setQuantity('');
      setPricePerKg('');
      setType('vegetable');
    } catch (error) {
      Alert.alert('Error', error.message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Button title="Pick an Image" onPress={pickImage} disabled={loading} color="#4CAF50" />
      {selectedImage && (
        <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} resizeMode="contain" />
      )}

      <Text style={styles.label}>Crop Name</Text>
      <TextInput
        value={cropName}
        onChangeText={setCropName}
        placeholder="Enter crop name"
        style={styles.input}
        editable={!loading}
      />

      <Text style={styles.label}>Quantity (kg)</Text>
      <TextInput
        value={quantity}
        onChangeText={setQuantity}
        placeholder="Enter quantity"
        keyboardType="numeric"
        style={styles.input}
        editable={!loading}
      />

      <Text style={styles.label}>Price per kg</Text>
      <TextInput
        value={pricePerKg}
        onChangeText={setPricePerKg}
        placeholder="Enter price per kg"
        keyboardType="numeric"
        style={styles.input}
        editable={!loading}
      />

      <Text style={styles.label}>Type</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={type} onValueChange={setType} style={styles.picker} enabled={!loading}>
          <Picker.Item label="Vegetable" value="vegetable" />
          <Picker.Item label="Fruit" value="fruit" />
        </Picker>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <Button title="Add Produce" onPress={uploadImageAndSaveProduce} color="#2196F3" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#fff', flexGrow: 1 },
  imagePreview: {
    width: 250,
    height: 250,
    marginVertical: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f8f8f8',
    alignSelf: 'center',
  },
  label: { fontWeight: '600', fontSize: 16, marginBottom: 6, color: '#264653' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#fafafa',
    color: '#333',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 25,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  picker: { height: 50, width: '100%', color: '#264653' },
  loader: { marginVertical: 20 },
});
