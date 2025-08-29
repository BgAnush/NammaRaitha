import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform
} from 'react-native';
import { supabase } from '../supabase/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { Feather, MaterialIcons } from '@expo/vector-icons';

// ✅ Cross-platform alert wrapper
const showAlert = (title, message, onOk) => {
  if (Platform.OS === 'web') {
    // On web, use default browser alert
    window.alert(`${title}\n${message}`);
    if (onOk) onOk();
  } else {
    // On Android/iOS, use native Alert
    Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
  }
};

export default function RetailerDashboard() {
  const [produceList, setProduceList] = useState([]);
  const [retailerName, setRetailerName] = useState('');
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    fetchRetailerInfo();
    fetchInStockProduce();
  }, []);

  // Fetch retailer name
  const fetchRetailerInfo = async () => {
    try {
      const retailerId = await AsyncStorage.getItem('userId');
      if (!retailerId) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', retailerId)
        .single();

      if (!error) {
        setRetailerName(data?.name || 'Retailer');
      }
    } catch (err) {
      console.error('Error retrieving retailer info:', err);
    }
  };

  // Fetch in-stock produce
  const fetchInStockProduce = async () => {
    setLoading(true);

    const { data: produceData, error: produceError } = await supabase
      .from('produce')
      .select(
        'id, crop_name, quantity, price_per_kg, status, image_url, farmer_id'
      )
      .eq('status', 'in_stock');

    if (produceError) {
      showAlert('Error', 'Failed to load produce.');
      setLoading(false);
      return;
    }

    const farmerIds = [...new Set(produceData.map((p) => p.farmer_id))];

    const { data: farmerData } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', farmerIds);

    const farmerDict = {};
    (farmerData || []).forEach((farmer) => {
      farmerDict[farmer.id] = farmer.name;
    });

    const mergedList = produceData.map((produce) => ({
      ...produce,
      farmer_name: farmerDict[produce.farmer_id] || 'Unknown',
    }));

    setProduceList(mergedList);
    setLoading(false);
  };

  // Add crop to cart with price_per_kg included
  const addToCart = async (cropId) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        showAlert('Error', 'Please log in to add items to your cart.');
        return;
      }

      const { data: existingItem, error: fetchError } = await supabase
        .from('cart')
        .select('id, quantity')
        .eq('retailer_id', user.id)
        .eq('crop_id', cropId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error(fetchError);
        showAlert('Error', 'Could not check cart.');
        return;
      }

      if (existingItem) {
        const { error: updateError } = await supabase
          .from('cart')
          .update({ quantity: existingItem.quantity + 1 })
          .eq('id', existingItem.id);

        if (updateError) {
          console.error(updateError);
          showAlert('Error', 'Failed to update cart quantity.');
        } else {
          showAlert('Updated', 'Quantity increased in cart.');
        }
      } else {
        const { data: cropData, error: cropError } = await supabase
          .from('produce')
          .select('price_per_kg')
          .eq('id', cropId)
          .single();

        if (cropError || !cropData) {
          console.error(cropError);
          showAlert('Error', 'Failed to fetch crop price.');
          return;
        }

        const { error: insertError } = await supabase.from('cart').insert([
          {
            retailer_id: user.id,
            crop_id: cropId,
            quantity: 1,
            price_per_kg: cropData.price_per_kg,
          },
        ]);

        if (insertError) {
          console.error(insertError);
          showAlert('Error', 'Failed to add to cart.');
        } else {
          showAlert('Success', 'Item added to cart.');
        }
      }
    } catch (err) {
      console.error('Unexpected error adding to cart:', err);
      showAlert('Error', 'Something went wrong.');
    }
  };

  // Start negotiation/chat
  const startNegotiation = async (produceItem) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        showAlert('Error', 'Please log in to start negotiation.');
        return;
      }

      navigation.navigate('drawer/NegotiationChat', {
        crop_id: produceItem.id,
        farmer_id: produceItem.farmer_id,
        retailer_id: user.id,
        currentUserId: user.id,
      });
    } catch (err) {
      console.error('Error starting negotiation:', err);
      showAlert('Error', 'Failed to start negotiation');
    }
  };

  // ✅ Fixed logout with cross-platform alert
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.clear();
      showAlert('Logged Out', 'You have been logged out successfully.', () => {
        navigation.reset?.({ index: 0, routes: [{ name: "login" }] }) || 
      navigation.navigate("login");
      });
    } catch (err) {
      console.error('Logout error:', err);
      showAlert('Error', 'Something went wrong while logging out.');
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Image
        source={{ uri: item.image_url || 'https://via.placeholder.com/150' }}
        style={styles.image}
      />
      <View style={styles.info}>
        <Text style={styles.cropName}>{item.crop_name}</Text>
        <Text style={styles.details}>
          {item.quantity} kg @ ₹{item.price_per_kg}/kg
        </Text>
        <Text style={styles.farmerName}>Farmer: {item.farmer_name}</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => addToCart(item.id)}
          >
            <Text style={styles.addButtonText}>+ Add to Cart</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.negButton}
            onPress={() => startNegotiation(item)}
          >
            <MaterialIcons name="message" size={20} color="#fff" />
            <Text style={styles.negButtonText}>Negotiate</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.leftHeader}>
          <Text style={styles.bigEmoji}>🧑</Text>
          <Text style={styles.welcomeText}>Welcome, {retailerName}</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={fetchInStockProduce}
            style={styles.iconButton}
          >
            <Feather name="refresh-cw" size={22} color="#2E7D32" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
            <Feather name="log-out" size={22} color="red" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Available Produce</Text>

      {loading ? (
        <Text style={styles.loading}>Loading produce...</Text>
      ) : (
        <FlatList
          data={produceList}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('RetailerDashboard')}
        >
          <Feather name="home" size={22} color="#2E7D32" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('drawer/add_to_cart')}
        >
          <Feather name="shopping-cart" size={22} color="#2E7D32" />
          <Text style={styles.navText}>Cart</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('OrdersScreen')}
        >
          <Feather name="package" size={22} color="#2E7D32" />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate('ProfileScreen')}
        >
          <Feather name="user" size={22} color="#2E7D32" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8F8', paddingTop: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  leftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bigEmoji: { fontSize: 40 },
  welcomeText: { fontSize: 18, fontWeight: '600', color: '#2E7D32' },
  headerButtons: { flexDirection: 'row', gap: 12 },
  iconButton: { padding: 4 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  list: { paddingHorizontal: 10, paddingBottom: 80 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  image: {
    width: 100,
    height: 100,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  info: { flex: 1, padding: 10 },
  cropName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  details: { fontSize: 14, color: '#555' },
  farmerName: { fontSize: 14, color: '#777', marginBottom: 6 },
  actionRow: { flexDirection: 'row', gap: 8 },
  addButton: {
    backgroundColor: '#28A745',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: { color: '#FFF', fontWeight: 'bold' },
  negButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFA000',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  negButtonText: { color: '#FFF', marginLeft: 4, fontWeight: 'bold' },
  loading: { textAlign: 'center', marginTop: 20, fontSize: 16 },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  navItem: { alignItems: 'center' },
  navText: { fontSize: 12, color: '#2E7D32', marginTop: 2 },
});
