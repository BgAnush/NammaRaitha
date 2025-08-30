// ConversationList.js
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase/supabaseClient";

const PLACEHOLDER = "https://via.placeholder.com/60x60.png?text=No+Image";

export default function ConversationList() {
  const navigation = useNavigation();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const getUserId = async () => {
      try {
        const id = await AsyncStorage.getItem("userId");
        if (id) {
          setUserId(id);
          fetchConversations(id);
          setupRealtimeSubscription(id);
        }
      } catch (err) {
        console.error("getUserId error:", err);
        setError("Failed to get user ID");
        setLoading(false);
      }
    };
    getUserId();

    return () => supabase.removeAllChannels();
  }, []);

  const setupRealtimeSubscription = (userId) => {
    supabase
      .channel("conversation-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => fetchConversations(userId)
      )
      .subscribe();

    supabase
      .channel("conversation-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => fetchConversations(userId)
      )
      .subscribe();
  };

  const fetchConversations = async (farmerId) => {
    try {
      setLoading(true);
      setError("");

      const { data: conversationsData, error: conversationsError } = await supabase
        .from("conversations")
        .select(`
          id,
          crop_id,
          retailer_id,
          last_message,
          last_message_at,
          created_at,
          crop:crop_id (crop_name, image_url),
          retailer:retailer_id (name),
          unread_messages:messages (
            id
          ).filter(read_at.is.null, sender_id.neq.${farmerId})
        `)
        .eq("farmer_id", farmerId)
        .order("last_message_at", { ascending: false });

      if (conversationsError) throw conversationsError;

      const formattedConversations = conversationsData.map((conv) => ({
        id: conv.id,
        cropId: conv.crop_id,
        retailerId: conv.retailer_id,
        cropName: conv.crop?.crop_name || "Unknown Crop",
        cropImage: conv.crop?.image_url || PLACEHOLDER,
        retailerName: conv.retailer?.name || "Unknown Retailer",
        retailerAvatar: conv.retailer?.avatar_url || PLACEHOLDER,
        lastMessage: conv.last_message || "No messages yet",
        lastMessageAt: conv.last_message_at,
        unreadCount: conv.unread_messages?.length || 0,
        createdAt: conv.created_at,
      }));

      setConversations(formattedConversations || []);
    } catch (err) {
      console.error("Fetch conversations error:", err);
      setError(err.message || "Failed to load conversations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (userId) await fetchConversations(userId);
  };
const handleConversationPress = (conversation) => {
  navigation.navigate("drawer/NegotiationChatF", {
    conversationId: conversation.id,       // <-- the primary key from conversations table
    cropId: conversation.cropId,           // for header display
    retailerId: conversation.retailerId,   // for header display or validation
    cropName: conversation.cropName,
    retailerName: conversation.retailerName,
  });
};


  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffInHours < 48) return "Yesterday";
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const renderConversationItem = ({ item }) => (
    <TouchableOpacity
      style={styles.conversationCard}
      onPress={() => handleConversationPress(item)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: item.cropImage }} style={styles.cropImage} />
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.cropName} numberOfLines={1}>
            {item.cropName}
          </Text>
          <Text style={styles.timeText}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.conversationDetails}>
          <Text style={styles.retailerName} numberOfLines={1}>
            {item.retailerName}
          </Text>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        </View>
      </View>
      {item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadCount}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Feather name="message-square" size={48} color="#90A4AE" />
      <Text style={styles.emptyText}>No conversations yet</Text>
      <Text style={styles.emptySubtext}>
        Start a conversation by messaging retailers about your crops
      </Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <Feather name="alert-circle" size={48} color="#F44336" />
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
          <Feather
            name="refresh-ccw"
            size={20}
            color="#1976D2"
            style={refreshing ? { opacity: 0.5 } : {}}
          />
        </TouchableOpacity>
      </View>

      {error ? (
        renderErrorState()
      ) : conversations.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#1976D2"]} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6FAFD" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#16324F" },
  listContent: { padding: 16 },
  conversationCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    alignItems: "center",
  },
  cropImage: { width: 60, height: 60, borderRadius: 8, marginRight: 12, backgroundColor: "#eee" },
  conversationInfo: { flex: 1 },
  conversationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cropName: { fontSize: 16, fontWeight: "700", color: "#16324F", flex: 1, marginRight: 8 },
  timeText: { fontSize: 12, color: "#666" },
  conversationDetails: { flexDirection: "row", alignItems: "center" },
  retailerName: { fontSize: 14, fontWeight: "600", color: "#1976D2", marginRight: 8, flex: 1 },
  lastMessage: { fontSize: 14, color: "#666", flex: 2 },
  unreadBadge: {
    backgroundColor: "#FF3B30",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  unreadCount: { color: "#fff", fontSize: 12, fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#666" },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyText: { marginTop: 16, fontSize: 18, fontWeight: "600", color: "#666", textAlign: "center" },
  emptySubtext: { marginTop: 8, fontSize: 14, color: "#999", textAlign: "center" },
  errorText: { marginTop: 16, fontSize: 16, color: "#F44336", textAlign: "center" },
  retryButton: { marginTop: 16, backgroundColor: "#1976D2", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  retryButtonText: { color: "#fff", fontWeight: "600" },
});
