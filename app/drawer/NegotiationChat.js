import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, ActivityIndicator, ImageBackground, TouchableOpacity, 
  Alert, Modal, FlatList, StyleSheet, Platform, KeyboardAvoidingView, 
  SafeAreaView, StatusBar 
} from 'react-native';
import { GiftedChat, Bubble, Send, InputToolbar, Composer } from 'react-native-gifted-chat';
import { supabase } from '../supabase/supabaseClient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';

// -------- Translation Helper --------
const translateText = async (text, targetLang) => {
  if (!text) return '';
  try {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
    );
    const data = await response.json();
    return data[0].map(item => item[0]).join('');
  } catch (err) {
    console.error('Translation error:', err);
    return text;
  }
};

// -------- Language map for TTS --------
const languageMap = {
  en: 'en-US',
  hi: 'hi-IN',
  kn: 'kn-IN',
  te: 'te-IN',
  ta: 'ta-IN',
};

// -------- Alert helper --------
const showAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

// -------- Speak Message --------
const speakMessage = (text, lang, mute) => {
  if (!text || mute) return;
  if (Platform.OS === 'web') {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = languageMap[lang] || 'en-US';
      window.speechSynthesis.speak(utterance);
    }
    return;
  }
  Speech.stop();
  Speech.speak(text, { language: languageMap[lang] || 'en-US', rate: 0.9, pitch: 1 });
};

// -------- Main Component --------
export default function NegotiationChat() {
  const route = useRoute();
  const navigation = useNavigation();
  const { crop_id, farmer_id, retailer_id, currentUserId, cropName, farmerName, retailerName } = route.params || {};
  
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [selectedLang, setSelectedLang] = useState('en');
  const [modalVisible, setModalVisible] = useState(false);
  const [mute, setMute] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  
  const languages = [
    { label: 'English', value: 'en' },
    { label: 'Kannada', value: 'kn' },
    { label: 'Hindi', value: 'hi' },
    { label: 'Telugu', value: 'te' },
    { label: 'Tamil', value: 'ta' },
  ];

  // -------- Initialize Conversation --------
  const initializeConversation = useCallback(async () => {
    try {
      const { data: existingConversation, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('crop_id', crop_id)
        .eq('farmer_id', farmer_id)
        .eq('retailer_id', retailer_id)
        .single();
      
      if (convError && convError.code !== 'PGRST116') throw convError;
      
      if (existingConversation) {
        setConversationId(existingConversation.id);
        return existingConversation.id;
      }
      
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert([{
          crop_id,
          farmer_id,
          retailer_id,
          last_message: 'Conversation started',
          last_message_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (createError) throw createError;
      setConversationId(newConversation.id);
      return newConversation.id;
    } catch (err) {
      console.error('Conversation error:', err.message);
      showAlert('Error', 'Failed to start conversation.');
      return null;
    }
  }, [crop_id, farmer_id, retailer_id]);

  // -------- Fetch Messages --------
  const fetchMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false }); // Changed to descending for proper ordering
      
      if (error) throw error;
      
      const formatted = await Promise.all(data.map(async (msg) => {
        const translatedText = await translateText(msg.content, selectedLang);
        return {
          _id: msg.id,
          text: translatedText,
          originalText: msg.content,
          createdAt: new Date(msg.created_at),
          user: { 
            _id: msg.sender_id, 
            name: msg.sender_id === farmer_id ? farmerName || 'Farmer' : retailerName || 'Retailer' 
          },
        };
      }));
      
      setMessages(formatted);
    } catch (err) {
      console.error('Message fetch error:', err.message);
      showAlert('Error', 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }, [farmer_id, farmerName, retailerName, selectedLang]);

  // -------- Realtime Subscription --------
  useEffect(() => {
    let subscription;
    const setupRealtime = async () => {
      const convId = await initializeConversation();
      if (!convId) return;
      
      await fetchMessages(convId);
      
      subscription = supabase
        .channel(`messages:conversation_id=eq.${convId}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages', 
          filter: `conversation_id=eq.${convId}` 
        }, async (payload) => {
          const newMessage = payload.new;
          const translatedText = await translateText(newMessage.content, selectedLang);
          
          setMessages(prev => [
            {
              _id: newMessage.id,
              text: translatedText,
              originalText: newMessage.content,
              createdAt: new Date(newMessage.created_at),
              user: { 
                _id: newMessage.sender_id, 
                name: newMessage.sender_id === farmer_id ? farmerName || 'Farmer' : retailerName || 'Retailer' 
              },
            },
            ...prev // Prepend to show new message at the bottom
          ]);
        })
        .subscribe();
    };
    
    setupRealtime();
    
    return () => { 
      if (subscription) supabase.removeChannel(subscription); 
    };
  }, [initializeConversation, fetchMessages, farmer_id, farmerName, retailerName, selectedLang]);

  // -------- Send Message --------
  const onSend = useCallback(async (newMessages = []) => {
    if (!conversationId) return;
    
    try {
      const message = newMessages[0];
      const { error } = await supabase.from('messages').insert([{
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: message.text
      }]);
      
      if (error) throw error;
      
      // Optimistically update UI
      setMessages(prev => [
        {
          ...message,
          _id: message._id || Date.now(),
          text: message.text,
          originalText: message.text
        },
        ...prev
      ]);
      
      await supabase.from('conversations').update({
        last_message: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''),
        last_message_at: new Date().toISOString(),
        last_sender: currentUserId
      }).eq('id', conversationId);
    } catch (err) {
      console.error('Send error:', err.message);
      showAlert('Error', 'Failed to send message. Please try again.');
    }
  }, [conversationId, currentUserId]);

  // -------- Render Bubble --------
  const renderBubble = (props) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: { 
          backgroundColor: '#4CAF50', 
          borderRadius: 18, 
          padding: 8, 
          marginVertical: 2,
          minHeight: 44
        },
        left: { 
          backgroundColor: '#E8F5E9', 
          borderRadius: 18, 
          padding: 8, 
          marginVertical: 2,
          minHeight: 44
        }
      }}
      textStyle={{ 
        right: { color: '#fff', fontSize: 16 }, 
        left: { color: '#2E7D32', fontSize: 16 } 
      }}
      onPress={() => speakMessage(props.currentMessage.text, selectedLang, mute)}
    />
  );

  // -------- Custom Send Button --------
  const renderSend = (props) => (
    <Send
      {...props}
      disabled={!props.text || props.text.trim().length === 0}
      containerStyle={{
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 4,
        marginBottom: 4,
      }}
    >
      <View style={[
        styles.sendButton, 
        !props.text || props.text.trim().length === 0 ? styles.sendButtonDisabled : null
      ]}>
        <Ionicons name="send" size={20} color="#fff" />
      </View>
    </Send>
  );

  // -------- Input Toolbar --------
  const renderInputToolbar = (props) => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbarContainer}
      primaryStyle={styles.inputToolbarPrimary}
    />
  );

  // -------- Composer --------
  const renderComposer = (props) => (
    <Composer
      {...props}
      textInputStyle={styles.composerTextInput}
      placeholderTextColor="#888"
    />
  );

  // -------- Language Modal --------
  const renderLanguageModal = () => (
    <Modal 
      visible={modalVisible} 
      transparent 
      animationType="fade" 
      onRequestClose={() => setModalVisible(false)}
      statusBarTranslucent={true}
    >
      <TouchableOpacity 
        style={styles.modalOverlay} 
        activeOpacity={1} 
        onPress={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Select Language</Text>
          <FlatList
            data={languages}
            keyExtractor={item => item.value}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.modalItem, selectedLang === item.value && styles.selectedModalItem]} 
                onPress={async () => { 
                  setSelectedLang(item.value); 
                  setModalVisible(false);
                  if (messages.length > 0) {
                    setIsTranslating(true);
                    try {
                      const translatedMessages = await Promise.all(messages.map(async (msg) => {
                        const translatedText = await translateText(msg.originalText, item.value);
                        return { ...msg, text: translatedText };
                      }));
                      setMessages(translatedMessages);
                    } catch (error) {
                      console.error('Translation error:', error);
                    } finally {
                      setIsTranslating(false);
                    }
                  }
                }}
              >
                <Text style={[styles.modalText, selectedLang === item.value && styles.selectedModalText]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setModalVisible(false)}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ImageBackground 
        source={require('../../assets/images/chatbg.jpeg')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{cropName || 'Crop Negotiation'}</Text>
            <Text style={styles.headerSubtitle}>
              {currentUserId === farmer_id ? retailerName || 'Retailer' : farmerName || 'Farmer'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setMute(!mute)}>
            <Ionicons name={mute ? "volume-mute" : "volume-high"} size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        
        {/* Language Dropdown */}
        <View style={styles.dropdownContainer}>
          <TouchableOpacity 
            style={styles.dropdownButton} 
            onPress={() => setModalVisible(true)}
            disabled={isTranslating}
          >
            {isTranslating ? (
              <ActivityIndicator size="small" color="#2E7D32" />
            ) : (
              <>
                <Text style={styles.dropdownButtonText}>
                  Language: {languages.find(l => l.value === selectedLang)?.label}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#2E7D32" />
              </>
            )}
          </TouchableOpacity>
        </View>
        
        {renderLanguageModal()}
        
        {/* Chat */}
        <KeyboardAvoidingView 
          style={styles.chatContainer}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 70}
        >
          <GiftedChat
            messages={messages}
            onSend={onSend}
            user={{ _id: currentUserId, name: currentUserId === farmer_id ? farmerName || 'Farmer' : retailerName || 'Retailer' }}
            placeholder="Type a message..."
            showUserAvatar={false}
            scrollToBottom
            renderUsernameOnMessage
            inverted={true} // Changed to true for proper chat behavior
            alwaysShowSend
            renderBubble={renderBubble}
            renderSend={renderSend}
            renderInputToolbar={renderInputToolbar}
            renderComposer={renderComposer}
            minInputToolbarHeight={70}
            listViewProps={{ style: styles.listView }}
          />
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  backgroundImage: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#4CAF50', 
    padding: 15,
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight + 15 || 15,
  },
  backButton: { padding: 8, marginRight: 10 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: '#E8F5E9', fontSize: 14, marginTop: 2 },
  dropdownContainer: { 
    margin: 8, 
    alignItems: 'flex-end',
    zIndex: 10
  },
  dropdownButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#E8F5E9', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 25, 
    borderWidth: 1, 
    borderColor: '#C5E1A5',
    minWidth: 160,
    justifyContent: 'center'
  },
  dropdownButtonText: { color: '#2E7D32', fontWeight: '500', marginRight: 5 },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalContainer: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    width: '80%', 
    maxWidth: 300, 
    padding: 15, 
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2E7D32', marginBottom: 15, textAlign: 'center' },
  modalItem: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, marginBottom: 5 },
  selectedModalItem: { backgroundColor: '#E8F5E9' },
  modalText: { fontSize: 16, color: '#333' },
  selectedModalText: { color: '#2E7D32', fontWeight: '600' },
  closeButton: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  chatContainer: { flex: 1 },
  listView: { paddingBottom: 10 },
  inputToolbarContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 8,
    minHeight: 70,
  },
  inputToolbarPrimary: {
    alignItems: 'center',
  },
  composerTextInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    marginLeft: 0,
    marginRight: 8,
    fontSize: 16,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
});