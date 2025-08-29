import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Button, Image, View } from 'react-native';

// Initialize Supabase client
const supabaseUrl = 'https://zeahrisijpczktlpwgvj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplYWhyaXNpanBjemt0bHB3Z3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMTgwMDYsImV4cCI6MjA2OTc5NDAwNn0.eLyB07SBfEJvJ40xaypCjeWQMj1fYItgrJlNzyQcWS4';  // replace with your key
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to convert data URI to Blob
function dataURItoBlob(dataURI) {
  const [header, base64Data] = dataURI.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64Data);
  const array = [];
  for (let i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }
  return new Blob([new Uint8Array(array)], { type: mime });
}

export default function UploadImage() {
  const [selectedImage, setSelectedImage] = useState(null);

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.7,
      });

      if (!result.canceled) {
        // result.assets is an array
        const asset = result.assets[0];
        setSelectedImage(asset);
        console.log('Selected Image:', asset);
      }
    } catch (error) {
      Alert.alert('Error picking image', error.message);
    }
  };

  const uploadImage = async () => {
    if (!selectedImage) {
      Alert.alert('No image selected!');
      return;
    }

    try {
      // Extract extension from mime type
      const mimeType = selectedImage.mimeType || 'image/png';
      const fileExt = mimeType.split('/')[1] || 'png';

      const timestamp = Date.now();
      const fileName = `image_${timestamp}.${fileExt}`;
      const bucketName = 'produce-images';

      // Convert base64 uri to Blob
      const blob = dataURItoBlob(selectedImage.uri);

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: mimeType,
        });

      if (error) throw error;

      Alert.alert('Success', 'Image uploaded: ' + fileName);
      setSelectedImage(null);
    } catch (error) {
      Alert.alert('Upload failed', error.message);
      console.error('Upload failed:', error);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Button title="Pick an Image" onPress={pickImage} />

      {selectedImage && (
        <Image
          source={{ uri: selectedImage.uri }}
          style={{ width: 200, height: 200, marginVertical: 20 }}
          resizeMode="contain"
        />
      )}

      <Button title="Upload Image" onPress={uploadImage} disabled={!selectedImage} />
    </View>
  );
}
