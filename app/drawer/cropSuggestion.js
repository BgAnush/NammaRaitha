// cropSuggestion.js
import React, { useEffect, useState } from "react";
import { 
  View, Text, FlatList, ActivityIndicator, StyleSheet, Alert, Image 
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

export default function CropSuggestion() {
  const [crops, setCrops] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSuggestedCrops = async () => {
      try {
        const weatherData = JSON.parse(await AsyncStorage.getItem("weatherData"));
        if (!weatherData) {
          setCrops([]);
          setLoading(false);
          return;
        }

        // Fallback crops for demo
        setCrops([
          { name: "Rice", price: "₹40/kg", period: "16-20 weeks", water: "High", description: "Rice is a staple crop in many parts of India and thrives in monsoon season's abundant rainfall." },
          { name: "Soybean", price: "₹60/kg", period: "12-14 weeks", water: "Medium", description: "Soybean is drought-tolerant and suitable for areas with moderate rainfall." },
          { name: "Millets", price: "₹35/kg", period: "10-14 weeks", water: "Medium", description: "Millets are drought-resistant and suitable for arid regions." },
          { name: "Maize", price: "₹25/kg", period: "16-20 weeks", water: "Medium", description: "Maize grows well in monsoon season with adequate moisture." },
        ]);
      } catch (error) {
        console.error("Error fetching crops:", error);
        Alert.alert("Error", "Failed to fetch crop suggestions.");
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestedCrops();
  }, []);

  const renderCropItem = ({ item, index }) => (
    <View style={styles.cropItem}>
      <Text style={styles.cropName}>{index + 1}. {item.name}</Text>
      <Text style={styles.cropPrice}>{item.price}</Text>
      <View style={styles.cropDetails}>
        <Ionicons name="calendar-outline" size={16} color="#2E7D32" />
        <Text style={styles.cropDetailText}>Growing Period: {item.period}</Text>
      </View>
      <View style={styles.cropDetails}>
        <Ionicons name="water-outline" size={16} color="#2E7D32" />
        <Text style={styles.cropDetailText}>Water: {item.water}</Text>
      </View>
      <Text style={styles.cropDescription}>{item.description}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text style={styles.loadingText}>Loading crop suggestions...</Text>
      </View>
    );
  }

  if (crops.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="leaf-outline" size={60} color="#AED581" />
        <Text style={styles.message}>No crop suggestions available</Text>
        <Text style={styles.subMessage}>Please check your weather data or network connection</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Recommended Crops</Text>
        <Text style={styles.subHeader}>Based on your location and current season</Text>
      </View>

      <FlatList
        data={crops}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderCropItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FBF4", paddingTop: 15 },
  headerContainer: { paddingHorizontal: 20, marginBottom: 10 },
  header: { fontSize: 24, fontWeight: "bold", color: "#33691E", marginBottom: 5 },
  subHeader: { fontSize: 14, color: "#689F38", marginBottom: 10 },
  listContainer: { paddingHorizontal: 15, paddingBottom: 20 },
  cropItem: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, borderLeftWidth: 4, borderLeftColor: "#8BC34A" },
  cropName: { fontSize: 18, fontWeight: "bold", color: "#33691E" },
  cropPrice: { fontSize: 16, fontWeight: "600", color: "#F57C00", backgroundColor: "#FFF3E0", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginVertical: 6 },
  cropDetails: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  cropDetailText: { fontSize: 14, color:"#558B2F", marginLeft: 6 },
  cropDescription: { fontSize: 14, color:"#666", marginTop: 6, lineHeight: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  message: { fontSize: 18, color:"#555", textAlign: "center", marginBottom: 10 },
  subMessage: { fontSize: 14, color:"#777", textAlign: "center" },
  loadingText: { marginTop: 10, fontSize: 16, color:"#2E7D32", textAlign: "center" },
});
