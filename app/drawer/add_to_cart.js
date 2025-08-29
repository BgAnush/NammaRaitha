import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/supabaseClient';
import { useNavigation } from '@react-navigation/native';

export default function AddToCart() {
  const [cartItems, setCartItems] = useState([]);
  const [totalPrice, setTotalPrice] = useState('0.00');
  const [loading, setLoading] = useState(true);

  const navigation = useNavigation();

  // Load cart items on mount and subscribe to realtime updates
  useEffect(() => {
    fetchCartItems();

    const subscription = supabase
      .channel('cart_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart' }, fetchCartItems)
      .subscribe();

    return () => supabase.removeChannel(subscription);
  }, []);

  // Fetch items for current retailer
  const fetchCartItems = async () => {
    try {
      setLoading(true);

      const retailerId = await AsyncStorage.getItem('userId');
      if (!retailerId) {
        resetCart();
        return;
      }

      const { data, error } = await supabase
        .from('cart')
        .select(`
          id,
          crop_id,
          quantity,
          price_per_kg,
          total_price,
          produce:crop_id (id, crop_name, image_url, farmer_id)
        `)
        .eq('retailer_id', retailerId);

      if (error) throw error;

      setCartItems(data || []);
      setTotalPrice(calcTotal(data || []));
    } catch (err) {
      console.error('❌ Fetch cart error:', err);
      Alert.alert('Error', 'Could not load cart items.');
    } finally {
      setLoading(false);
    }
  };

  const resetCart = () => {
    setCartItems([]);
    setTotalPrice('0.00');
  };

  const calcTotal = (items) =>
    items
      .reduce((sum, i) => sum + (Number(i.total_price) || 0), 0)
      .toFixed(2);

  // Update cart quantity via stored procedure
  const updateQuantity = async (cartId, cropId, pricePerKg, oldQty, newQty) => {
    try {
      if (newQty < 1) {
        await removeItem(cartId, cropId, oldQty);
        return;
      }

      const { error } = await supabase.rpc('update_cart_quantity', {
        p_cart_id: cartId,
        p_crop_id: cropId,
        p_price_per_kg: pricePerKg,
        p_old_qty: oldQty,
        p_new_qty: newQty,
      });

      if (error) throw error;

      fetchCartItems();
    } catch (err) {
      console.error('❌ Update quantity error:', err);
      Alert.alert('Error', err.message || 'Could not update quantity.');
    }
  };

  // Remove item from cart and restore stock to produce
  const removeItem = async (cartId, cropId, qty) => {
    try {
      const { data: produceData, error: prodErr } = await supabase
        .from('produce')
        .select('quantity')
        .eq('id', cropId)
        .single();

      if (prodErr) throw prodErr;

      await Promise.all([
        supabase.from('produce').update({ quantity: produceData.quantity + qty }).eq('id', cropId),
        supabase.from('cart').delete().eq('id', cartId),
      ]);

      fetchCartItems();
    } catch (err) {
      console.error('❌ Remove item error:', err);
      Alert.alert('Error', 'Could not remove item from cart.');
    }
  };

  // Render each cart item
  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Image
        source={{ uri: item.produce?.image_url || 'https://via.placeholder.com/150' }}
        style={styles.image}
      />

      <View style={styles.info}>
        <Text style={styles.name}>{item.produce?.crop_name || 'Unknown'}</Text>
        <Text style={styles.price}>₹{item.price_per_kg?.toFixed(2) || '0.00'} / kg</Text>

        <View style={styles.qtyRow}>
          <TouchableOpacity
            onPress={() =>
              updateQuantity(item.id, item.crop_id, item.price_per_kg, item.quantity, item.quantity - 1)
            }
            style={styles.qtyBtn}
          >
            <Text style={styles.qtyText}>-</Text>
          </TouchableOpacity>

          <Text style={styles.qty}>{item.quantity}</Text>

          <TouchableOpacity
            onPress={() =>
              updateQuantity(item.id, item.crop_id, item.price_per_kg, item.quantity, item.quantity + 1)
            }
            style={styles.qtyBtn}
          >
            <Text style={styles.qtyText}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.itemTotal}>Total: ₹{(item.total_price || 0).toFixed(2)}</Text>

        {/* ✅ Negotiation Button */}
        <TouchableOpacity
          style={styles.negotiateBtn}
          onPress={async () => {
            const retailerId = await AsyncStorage.getItem('userId');
            navigation.navigate('drawer/NegotiationChat', {
              crop_id: item.crop_id,
              farmer_id: item.produce?.farmer_id,
              retailer_id: retailerId,
              currentUserId: retailerId,
            });
          }}
        >
          <Text style={styles.negotiateText}>💬 Negotiate</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.removeBtn}
        onPress={() => removeItem(item.id, item.crop_id, item.quantity)}
      >
        <Text style={styles.removeText}>×</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>🛒 Your Cart</Text>

      {cartItems.length > 0 ? (
        <>
          <FlatList
            data={cartItems}
            renderItem={renderItem}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.list}
          />

          <View style={styles.footer}>
            <Text style={styles.total}>Grand Total: ₹{totalPrice}</Text>
            <TouchableOpacity style={styles.checkoutBtn}>
              <Text style={styles.checkoutText}>Proceed to Checkout</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Your cart is empty</Text>
        </View>
      )}
    </View>
  );
}

// 🎨 Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9', padding: 16 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  list: { paddingBottom: 20 },

  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
    position: 'relative',
    paddingRight: 40,
  },
  image: { width: 100, height: 100 },
  info: { flex: 1, padding: 12 },

  name: { fontSize: 16, fontWeight: '600' },
  price: { fontSize: 14, color: '#666', marginVertical: 4 },

  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  qtyBtn: {
    backgroundColor: '#EEE',
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
  },
  qtyText: { fontSize: 18, color: '#333' },
  qty: { marginHorizontal: 12, fontSize: 16, fontWeight: '600' },

  itemTotal: { marginTop: 8, fontWeight: '600', color: '#2E7D32', fontSize: 15 },

  removeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: { color: 'white', fontSize: 18, fontWeight: 'bold', lineHeight: 20 },

  footer: { borderTopWidth: 1, borderColor: '#DDD', paddingTop: 16 },
  total: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E7D32',
    textAlign: 'center',
    marginBottom: 16,
  },
  checkoutBtn: {
    backgroundColor: '#2E7D32',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkoutText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, color: '#777' },

  negotiateBtn: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#1976D2',
    borderRadius: 6,
    alignItems: 'center',
  },
  negotiateText: { color: 'white', fontWeight: 'bold' },
});
