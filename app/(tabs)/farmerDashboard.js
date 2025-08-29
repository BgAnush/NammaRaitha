// farmerDashboard.js
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import * as Location from "expo-location";
import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

// Constants
const OPEN_WEATHER_API_KEY = "f8787279df0548b912a987b2460e8a27";
const PLACEHOLDER = "https://via.placeholder.com/300x200.png?text=No+Image";
const BOTTOM_NAV_ITEMS = [
  { icon: "home", label: "Home", route: null },
  { icon: "plus-circle", label: "Add Crop", route: "drawer/add_produce" },
  { icon: "bar-chart", label: "Crop Suggestions", route: "drawer/cropSuggestion" },
  { icon: "activity", label: "Disease", route: "drawer/disease-alerts" },
  { icon: "user", label: "Profile", route: "drawer/profile" },
];

export default function FarmerDashboard() {
  const navigation = useNavigation();
  const [userId, setUserId] = useState(null);
  
  // State management
  const [state, setState] = useState({
    farmerName: "",
    produce: [],
    loading: true,
    refreshing: false,
    errorMsg: "",
    weather: null,
    weatherLoading: true,
    weatherError: "",
    editVisible: false,
    editingCrop: null,
    editPrice: "",
    editQty: "",
    editStatus: "in_stock",
    savingEdit: false,
    notificationsCount: 0,
    unreadMessagesCount: 0,
    showAlert: false,
    alertConfig: { title: "", message: "", buttons: [] },
    navigationError: null,
  });

  // Helper functions
  const updateState = (newState) => setState(prev => ({ ...prev, ...newState }));
  
  const showCustomAlert = (title, message, buttons = []) => {
    if (Platform.OS === "web") {
      updateState({
        showAlert: true,
        alertConfig: { 
          title, 
          message, 
          buttons: buttons.length ? buttons : [{ text: "OK" }] 
        }
      });
    } else {
      Alert.alert(title, message, buttons.length ? buttons : undefined);
    }
  };

  // Safe navigation handler
  const safeNavigate = useCallback((routeName, params = {}) => {
    try {
      // Check if route exists before navigating
      if (navigation && navigation.navigate) {
        navigation.navigate(routeName, params);
      } else {
        throw new Error("Navigation not available");
      }
    } catch (error) {
      console.error(`Navigation error to ${routeName}:`, error);
      updateState({ 
        navigationError: `The ${routeName} page is currently unavailable. Please try again later.`
      });
      showCustomAlert(
        "Navigation Error", 
        `The ${routeName} page is currently under maintenance. We're working to fix this issue.`
      );
    }
  }, [navigation]);

  // Fetch user ID and set up real-time subscriptions
  useEffect(() => {
    const getUserId = async () => {
      try {
        const id = await AsyncStorage.getItem("userId");
        if (id) {
          setUserId(id);
          setupRealtimeSubscriptions(id);
        }
      } catch (err) {
        console.warn("getUserId error:", err);
        showCustomAlert("Error", "Failed to get user ID. Please login again.");
      }
    };
    getUserId();
    return () => {
      supabase.removeAllChannels();
    };
  }, []);

  const setupRealtimeSubscriptions = (userId) => {
    // Notifications subscription
    const notificationsChannel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          updateState(prev => ({
            notificationsCount: prev.notificationsCount + 1
          }));
        }
      )
      .subscribe();

    // Messages subscription
    const messagesChannel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          // Check if this message belongs to a conversation the user is part of
          const { data: conversation } = await supabase
            .from('conversations')
            .select('farmer_id, retailer_id')
            .eq('id', payload.new.conversation_id)
            .single();
            
          if (conversation && 
              (conversation.farmer_id === userId || conversation.retailer_id === userId) && 
              payload.new.sender_id !== userId) {
            const count = await fetchUnreadMessagesCount(userId);
            updateState({ unreadMessagesCount: count });
          }
        }
      )
      .subscribe();
  };

  const fetchUnreadMessagesCount = async (userId) => {
    try {
      // First get all conversations for this user
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .or(`farmer_id.eq.${userId},retailer_id.eq.${userId}`);
        
      if (convError) throw convError;
      
      if (!conversations || conversations.length === 0) {
        return 0;
      }
      
      // Extract conversation IDs
      const conversationIds = conversations.map(c => c.id);
      
      // Count unread messages
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', conversationIds)
        .is('read_at', null)
        .neq('sender_id', userId);
        
      if (error) throw error;
      
      return count || 0;
    } catch (error) {
      console.error("Error fetching unread messages count:", error);
      return 0;
    }
  };

  // Data fetching
  const fetchData = async () => {
    try {
      if (!userId) return;
      
      updateState({ errorMsg: "", loading: !state.refreshing });
      
      // Fetch farmer profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single();
      if (profileError) throw profileError;
      
      // Fetch produce
      const { data: produceData, error: produceError } = await supabase
        .from('produce')
        .select('*')
        .eq('farmer_id', userId)
        .order('created_at', { ascending: false });
      if (produceError) throw produceError;
      
      // Fetch notification and message counts
      const [notificationsCount, unreadMessagesCount] = await Promise.all([
        fetchUnreadNotificationsCount(userId),
        fetchUnreadMessagesCount(userId)
      ]);
      
      // Update state and cache
      updateState({
        farmerName: profileData?.full_name || "",
        produce: produceData || [],
        notificationsCount,
        unreadMessagesCount
      });
      
      await AsyncStorage.multiSet([
        ["farmerName", profileData?.full_name || ""],
        ["produce", JSON.stringify(produceData || [])],
      ]);
    } catch (err) {
      console.error("Dashboard error:", err);
      updateState({ errorMsg: err.message || "Failed to load data" });
      showCustomAlert("Error", err.message || "Failed to load data");
      
      // Fallback to cache
      try {
        const cached = await AsyncStorage.multiGet(["farmerName", "produce"]);
        const [cachedName, cachedProduce] = cached.map(item => item[1]);
        updateState({
          farmerName: cachedName || state.farmerName,
          produce: cachedProduce ? JSON.parse(cachedProduce) : state.produce
        });
      } catch (cacheErr) {
        console.error("Cache fallback error:", cacheErr);
      }
    } finally {
      updateState({ loading: false, refreshing: false });
    }
  };

  const fetchUnreadNotificationsCount = async (userId) => {
    try {
      // Fixed: Use 'read' boolean column instead of 'read_at'
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false); // Changed from is('read_at', null)
      
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error("Error fetching notifications count:", error);
      return 0;
    }
  };

  const fetchWeather = async () => {
    try {
      updateState({ weatherError: "", weatherLoading: true });
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        const cachedWeather = await AsyncStorage.getItem("weatherData");
        updateState({
          weatherError: "Location permission denied",
          weather: cachedWeather ? JSON.parse(cachedWeather) : state.weather
        });
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const { latitude, longitude } = location.coords || {};
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        throw new Error("Invalid location");
      }
      const weatherRes = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
        params: {
          lat: latitude,
          lon: longitude,
          appid: OPEN_WEATHER_API_KEY,
          units: "metric",
        },
        timeout: 8000,
      });
      if (weatherRes?.data) {
        updateState({ weather: weatherRes.data });
        await AsyncStorage.setItem("weatherData", JSON.stringify(weatherRes.data));
      }
    } catch (err) {
      console.error("fetchWeather error:", err);
      try {
        const cachedWeather = await AsyncStorage.getItem("weatherData");
        updateState({
          weatherError: "Could not load weather data",
          weather: cachedWeather ? JSON.parse(cachedWeather) : state.weather
        });
      } catch (cacheErr) {
        console.warn("No cached weather available:", cacheErr);
      }
    } finally {
      updateState({ weatherLoading: false });
    }
  };

  // Handlers
  const handleNotificationPress = async () => {
    try {
      // Fixed: Use 'read' boolean column instead of 'read_at'
      await supabase
        .from('notifications')
        .update({ read: true }) // Changed from read_at: new Date()
        .eq('user_id', userId)
        .eq('read', false); // Changed from is('read_at', null)
      
      updateState({ notificationsCount: 0 });
      
      // Try to navigate to notifications
      safeNavigate("drawer/notificationService");
    } catch (err) {
      console.error("Error handling notifications:", err);
      showCustomAlert(
        "Notifications", 
        "You have no new notifications. We'll notify you when new updates arrive."
      );
    }
  };
const handleMessagesPress = async () => {
  try {
    // Fetch conversations for this farmer
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("farmer_id", userId)
      .order("last_message_at", { ascending: false }); // get latest first

    if (error) throw error;

    if (conversations && conversations.length > 0) {
      const latest = conversations[0]; // latest conversation

      // ✅ Use retailer_id from the DB record instead of undefined retailerId
      safeNavigate("drawer/ConversationalList", {
        crop_id: latest.crop_id,
        farmer_id: userId,
        retailer_id: latest.retailer_id,
      });
    } else {
      showCustomAlert(
        "Messages",
        "You have no new messages. We'll notify you when new messages arrive."
      );
    }
  } catch (err) {
    console.error("Error handling messages:", err);
    showCustomAlert("Error", "Something went wrong while fetching messages.");
  }
};

  const handleDelete = async (cropId) => {
    try {
      if (!userId) {
        showCustomAlert("Error", "Please login again");
        return;
      }
      showCustomAlert(
        "Delete Crop", 
        "Are you sure you want to delete this crop?",
        [
          { 
            text: "Cancel", 
            style: "cancel"
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from("produce")
                  .delete()
                  .eq("id", cropId)
                  .eq("farmer_id", userId);
                if (error) throw error;
                updateState(prev => ({
                  produce: prev.produce.filter(p => p.id !== cropId)
                }));
                showCustomAlert("Success", "Crop removed successfully.");
              } catch (err) {
                console.error("Delete failed:", err);
                showCustomAlert("Error", "Something went wrong while deleting.");
              }
            },
          },
        ]
      );
    } catch (err) {
      console.error("Delete flow error:", err);
      showCustomAlert("Error", "Could not perform delete.");
    }
  };

  const openEditModal = (item) => {
    updateState({
      editingCrop: item,
      editPrice: String(item.price_per_kg ?? ""),
      editQty: String(item.quantity ?? ""),
      editStatus: item.status === "out_of_stock" ? "out_of_stock" : "in_stock",
      editVisible: true
    });
  };

  const handleSaveUpdate = async () => {
    if (!state.editingCrop || !userId) {
      showCustomAlert("Error", "Please login again.");
      return;
    }
    const cropId = state.editingCrop.id;
    
    // Validate inputs
    const parsedQty = parseInt(state.editQty || "0", 10);
    const parsedPrice = parseFloat(state.editPrice || "0");
    if (isNaN(parsedQty)) {
      showCustomAlert("Invalid", "Quantity must be a number.");
      return;
    }
    if (parsedQty < 0) {
      showCustomAlert("Invalid", "Quantity cannot be negative.");
      return;
    }
    if (isNaN(parsedPrice)) {
      showCustomAlert("Invalid", "Price must be a number.");
      return;
    }
    if (parsedPrice < 0) {
      showCustomAlert("Invalid", "Price cannot be negative.");
      return;
    }
    const finalStatus = parsedQty > 0 ? "in_stock" : "out_of_stock";
    const updatedFields = {
      quantity: parsedQty,
      price_per_kg: parsedPrice,
      status: finalStatus,
    };
    try {
      updateState({ savingEdit: true });
      const { data, error } = await supabase
        .from("produce")
        .update(updatedFields)
        .eq("id", cropId)
        .eq("farmer_id", userId)
        .select();
      if (error) throw error;
      updateState(prev => ({
        produce: prev.produce.map(p => 
          p.id === cropId ? (data?.[0] || { ...p, ...updatedFields }) : p
        ),
        editVisible: false,
        editingCrop: null,
        savingEdit: false
      }));
      
      showCustomAlert("Success", "Crop updated successfully.");
    } catch (err) {
      console.error("Save update failed:", err);
      showCustomAlert("Error", "Could not save update.");
      updateState({ savingEdit: false });
    }
  };

  const handleLogout = async () => {
    showCustomAlert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              supabase.removeAllChannels();
              if (navigation.reset) {
                navigation.reset({ index: 0, routes: [{ name: "login" }] });
              } else {
                navigation.navigate("login");
              }
            } catch (err) {
              console.warn("Logout clear error:", err);
              showCustomAlert("Error", "Logout failed. Please try again.");
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(() => {
    updateState({ refreshing: true });
    fetchData();
    fetchWeather();
  }, [userId]);

  // Effects
  useEffect(() => {
    fetchData();
    fetchWeather();
  }, [userId]);

  // Utility functions
  const getWeatherEmoji = (weatherMain) => {
    const weatherMap = {
      Clear: "☀️",
      Clouds: "☁️",
      Rain: "🌧️",
      Drizzle: "🌧️",
      Thunderstorm: "⛈️",
      Snow: "❄️",
      Mist: "🌫️",
      Fog: "🌫️",
      Haze: "🌫️",
    };
    return weatherMap[weatherMain] || "🌡️";
  };

  const displayStatus = (item) => {
    return Number(item.quantity) > 0 ? "in_stock" : 
           item.status === "in_stock" ? "in_stock" : "out_of_stock";
  };

  // Render functions
  const renderWeather = () => (
    <View style={styles.weatherCard}>
      {state.weatherLoading ? (
        <ActivityIndicator size="small" color="#1E88E5" />
      ) : state.weatherError ? (
        <Text style={styles.weatherError}>{state.weatherError}</Text>
      ) : state.weather ? (
        <View style={styles.weatherRow}>
          <Text style={styles.weatherEmoji}>
            {getWeatherEmoji(state.weather.weather[0].main)}
          </Text>
          <View>
            <Text style={styles.weatherTemp}>
              {Math.round(state.weather.main.temp)}°C
            </Text>
            <Text style={styles.weatherDesc}>
              {state.weather.weather[0].description}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.weatherError}>Weather unavailable</Text>
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Feather name="package" size={48} color="#90A4AE" />
      <Text style={styles.emptyText}>No crops listed yet.</Text>
      <TouchableOpacity 
        style={styles.addButton} 
        onPress={() => safeNavigate("drawer/add_produce")}
      >
        <Text style={styles.addButtonText}>Add Your First Crop</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <Feather name="alert-circle" size={48} color="#F44336" />
      <Text style={styles.errorText}>{state.errorMsg}</Text>
      <TouchableOpacity 
        style={styles.retryButton} 
        onPress={onRefresh}
      >
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCropItem = (item) => {
    const status = displayStatus(item);
    return (
      <View key={String(item.id)} style={styles.cropCard}>
        <TouchableOpacity
          style={{ flexDirection: "row", flex: 1 }}
          activeOpacity={0.9}
          onPress={() => safeNavigate("drawer/crop_details", {
            cropId: item.cropId ?? item.id,
          })}
        >
          <Image 
            source={{ uri: item.image_url || PLACEHOLDER }} 
            style={styles.cropImage} 
            resizeMode="cover" 
          />
          <View style={styles.cropInfo}>
            <Text style={styles.cropName}>{item.crop_name}</Text>
            <Text style={styles.cropMeta}>
              ₹{item.price_per_kg}/kg • {item.quantity}kg
            </Text>
            <View style={[
              styles.statusTag, 
              status === "in_stock" ? styles.inStock : styles.outStock
            ]}>
              <Text style={styles.statusText}>
                {status === "in_stock" ? "In Stock" : "Out of Stock"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.iconAction} 
            onPress={() => openEditModal(item)}
          >
            <Feather name="edit-2" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.iconAction, { backgroundColor: "#FF5252" }]} 
            onPress={() => handleDelete(item.id)}
          >
            <Feather name="trash-2" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconAction, styles.msgAction]}
            onPress={() => safeNavigate("drawer/ConversationalList", { cropId: item.id })}
          >
            <Feather name="message-square" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderBottomNav = () => (
    <View style={styles.bottomNav}>
      {BOTTOM_NAV_ITEMS.map((navItem, index) => (
        <TouchableOpacity
          key={navItem.icon}
          style={styles.bottomIcon}
          onPress={() => navItem.route ? safeNavigate(navItem.route) : null}
          disabled={!navItem.route}
          activeOpacity={0.8}
        >
          <Feather 
            name={navItem.icon} 
            size={22} 
            color={index === 0 ? "#1976D2" : "#999"} 
          />
          <Text style={[
            styles.bottomLabel, 
            index === 0 && { color: "#1976D2" }
          ]}>
            {navItem.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderEditModal = () => (
    <Modal visible={state.editVisible} animationType="slide" transparent>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.modalWrapper}
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit Crop</Text>
          <Text style={styles.inputLabel}>Price (₹/kg)</Text>
          <TextInput 
            keyboardType="numeric" 
            value={state.editPrice} 
            onChangeText={(text) => updateState({ editPrice: text })}
            style={styles.input} 
            placeholder="e.g. 45.50" 
          />
          <Text style={styles.inputLabel}>Quantity (kg)</Text>
          <TextInput 
            keyboardType="numeric" 
            value={state.editQty} 
            onChangeText={(text) => updateState({ editQty: text })}
            style={styles.input} 
            placeholder="e.g. 20" 
          />
          <Text style={styles.inputLabel}>Status</Text>
          <View style={styles.statusRow}>
            <TouchableOpacity 
              style={[
                styles.statusOption, 
                state.editStatus === "in_stock" && styles.statusOptionActive
              ]}
              onPress={() => updateState({ editStatus: "in_stock" })}
            >
              <Text style={[
                styles.statusOptionText, 
                state.editStatus === "in_stock" && { color: "#fff" }
              ]}>
                In Stock
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.statusOption, 
                state.editStatus === "out_of_stock" && styles.statusOptionActive
              ]}
              onPress={() => updateState({ editStatus: "out_of_stock" })}
            >
              <Text style={[
                styles.statusOptionText, 
                state.editStatus === "out_of_stock" && { color: "#fff" }
              ]}>
                Out of Stock
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalBtns}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: "#9E9E9E" }]}
              onPress={() => updateState({ editVisible: false, editingCrop: null })}
              disabled={state.savingEdit}
            >
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalBtn, { backgroundColor: "#1976D2" }]} 
              onPress={handleSaveUpdate} 
              disabled={state.savingEdit}
            >
              {state.savingEdit ? 
                <ActivityIndicator color="#fff" /> : 
                <Text style={styles.modalBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
          <Text style={styles.modalNote}>
            Note: Status will be automatically updated based on quantity.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderCustomAlert = () => (
    <Modal 
      transparent 
      visible={state.showAlert} 
      onRequestClose={() => updateState({ showAlert: false })}
    >
      <View style={styles.alertBackdrop}>
        <View style={styles.alertContainer}>
          <Text style={styles.alertTitle}>{state.alertConfig.title}</Text>
          <Text style={styles.alertMessage}>{state.alertConfig.message}</Text>
          <View style={styles.alertButtons}>
            {state.alertConfig.buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.alertButton,
                  button.style === "cancel" && styles.alertButtonCancel,
                  button.style === "destructive" && styles.alertButtonDestructive,
                ]}
                onPress={() => {
                  updateState({ showAlert: false });
                  button.onPress?.();
                }}
              >
                <Text style={[
                  styles.alertButtonText,
                  button.style === "cancel" && { color: "#1976D2" },
                  (button.style === "destructive" || button.style === "default") && { color: "#fff" }
                ]}>
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* HEADER */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.helloText}>
            <Text style={styles.farmerEmoji}>👨‍🌾</Text> Welcome Back,
          </Text>
          <Text style={styles.nameText}>{state.farmerName || "Farmer"} 👋</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleNotificationPress}
          >
            <Feather name="bell" size={20} color="#16324F" />
            {state.notificationsCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{state.notificationsCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleMessagesPress}
          >
            <Feather name="message-circle" size={20} color="#16324F" />
            {state.unreadMessagesCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{state.unreadMessagesCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              updateState({ refreshing: true });
              fetchData();
              fetchWeather();
            }}
          >
            <Feather name="refresh-ccw" size={20} color="#3B3B3B" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
            <Feather name="log-out" size={20} color="#FF5A5F" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Navigation Error Banner */}
      {state.navigationError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color="#fff" />
          <Text style={styles.errorBannerText}>{state.navigationError}</Text>
          <TouchableOpacity onPress={() => updateState({ navigationError: null })}>
            <Feather name="x" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl 
            refreshing={state.refreshing} 
            onRefresh={onRefresh} 
          />
        }
      >
        {renderWeather()}
        {state.loading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 50 }} />
        ) : state.errorMsg ? (
          renderErrorState()
        ) : state.produce.length === 0 ? (
          renderEmptyState()
        ) : (
          state.produce.map(renderCropItem)
        )}
      </ScrollView>
      {renderBottomNav()}
      {renderEditModal()}
      {renderCustomAlert()}
    </SafeAreaView>
  );
}

/* ---------- STYLES ---------- */
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6FAFD" },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 0.5,
    borderColor: "#E6EEF8",
  },
  container: { padding: 16, paddingBottom: 110, backgroundColor: "#F6FAFD" },
  helloText: { fontSize: 14, color: "#666" },
  nameText: { fontSize: 20, fontWeight: "700", color: "#16324F" },
  farmerEmoji: { fontSize: 34 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  iconBtn: {
    marginLeft: 10,
    backgroundColor: "#EEF6FB",
    padding: 8,
    borderRadius: 10,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#FF3B30",
    minWidth: 18,
    paddingHorizontal: 4,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  // Error banner
  errorBanner: {
    backgroundColor: "#F44336",
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    paddingHorizontal: 16,
  },
  errorBannerText: {
    color: "#fff",
    flex: 1,
    marginHorizontal: 10,
    fontSize: 14,
  },
  // weather
  weatherCard: {
    backgroundColor: "#E8F4FF",
    padding: 14,
    borderRadius: 14,
    marginVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weatherRow: { flexDirection: "row", alignItems: "center" },
  weatherEmoji: { fontSize: 36, marginRight: 12 },
  weatherTemp: { fontSize: 20, fontWeight: "700", color: "#0D47A1" },
  weatherDesc: { fontSize: 13, color: "#1565C0", textTransform: "capitalize" },
  weatherError: { color: "#B71C1C" },
  // empty / error
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { marginTop: 12, fontSize: 16, color: "#666" },
  errorText: { marginTop: 12, fontSize: 16, color: "#F44336" },
  addButton: {
    marginTop: 14,
    backgroundColor: "#1976D2",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  addButtonText: { color: "#FFF", fontWeight: "700" },
  retryButton: {
    marginTop: 14,
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  retryButtonText: { color: "#FFF", fontWeight: "700" },
  // crop card
  cropCard: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    alignItems: "center",
  },
  cropImage: {
    width: 112,
    height: 80,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: "#eee",
  },
  cropInfo: { flex: 1, paddingRight: 8 },
  cropName: { fontSize: 17, fontWeight: "800", color: "#213547" },
  cropMeta: { fontSize: 14, color: "#4F5B62", marginTop: 6 },
  statusTag: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  inStock: { backgroundColor: "#E8F5E9" },
  outStock: { backgroundColor: "#FFEBEE" },
  statusText: { fontSize: 12, fontWeight: "600", color: "#333" },
  // actions
  actions: { flexDirection: "column", marginLeft: 8, alignItems: "center" },
  iconAction: {
    backgroundColor: "#1976D2",
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
  },
  msgAction: { backgroundColor: "#00A86B" },
  // bottom nav
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: 70,
    backgroundColor: "#fff",
    borderTopWidth: 0.5,
    borderColor: "#E0E0E0",
    position: "absolute",
    bottom: 0,
    width: "100%",
    elevation: 12,
  },
  bottomIcon: { alignItems: "center" },
  bottomLabel: { fontSize: 12, marginTop: 4, color: "#777" },
  // modal
  modalWrapper: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    elevation: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12, color: "#16324F" },
  inputLabel: { fontSize: 13, color: "#444", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 6,
    fontSize: 15,
  },
  statusRow: { flexDirection: "row", marginTop: 8 },
  statusOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    marginRight: 8,
    alignItems: "center",
  },
  statusOptionActive: { backgroundColor: "#1976D2" },
  statusOptionText: { color: "#333", fontWeight: "600" },
  modalBtns: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnText: { color: "#fff", fontWeight: "700" },
  modalNote: { marginTop: 10, fontSize: 12, color: "#666", textAlign: "center" },
  // Custom alert styles
  alertBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  alertContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#16324F",
  },
  alertMessage: {
    fontSize: 16,
    marginBottom: 20,
    color: "#333",
  },
  alertButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  alertButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 10,
    backgroundColor: "#1976D2",
  },
  alertButtonCancel: {
    backgroundColor: "#f0f0f0",
  },
  alertButtonDestructive: {
    backgroundColor: "#FF5252",
  },
  alertButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});