// crop_details.js
import { StyleSheet, Text, View } from 'react-native';

const CropDetailsScreen = ({ route }) => {
  // Use safe access so app won't crash if route is undefined
  const cropId = route?.params?.cropId;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Crop Details</Text>
      {cropId ? (
        <Text style={styles.text}>Showing details for crop ID: {cropId}</Text>
      ) : (
        <Text style={styles.text}>No crop ID provided.</Text>
      )}
    </View>
  );
};

export default CropDetailsScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  text: {
    fontSize: 16,
    color: '#555',
  },
});
