// NegotiationChatF.js
import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ImageBackground,
  TouchableOpacity,
  Alert,
  Modal,
  StyleSheet,
  Platform,
  SafeAreaView,
  Dimensions,
  StatusBar,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GiftedChat, Bubble, InputToolbar, Send, Actions } from "react-native-gifted-chat";
import { supabase } from "../supabase/supabaseClient";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import Voice from '@react-native-voice/voice';
const { height } = Dimensions.get("window");

// ---------- Translation Function with Multiple Services ----------
const translateText = async (text, targetLang) => {
  if (!text) return "";
  
  // Skip translation if target language is English
  if (targetLang === 'en') return text;
  
  // Try different translation services in order of preference
  const translationServices = [
    // 1. Try LibreTranslate with a different public instance that might have CORS enabled
    async () => {
      const response = await fetch('https://translate.argosopentech.com/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'auto',
          target: targetLang,
          format: 'text'
        })
      });
      
      if (!response.ok) throw new Error(`LibreTranslate failed with status ${response.status}`);
      
      const data = await response.json();
      return data.translatedText;
    },
    
    // 2. Try Google Translate as fallback
    async () => {
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
      );
      const data = await response.json();
      return data[0] ? data[0].map((item) => item[0]).join("") : text;
    },
    
    // 3. Try another LibreTranslate instance
    async () => {
      const response = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'auto',
          target: targetLang,
          format: 'text'
        })
      });
      
      if (!response.ok) throw new Error(`LibreTranslate.com failed with status ${response.status}`);
      
      const data = await response.json();
      return data.translatedText;
    }
  ];
  
  // Try each service in sequence until one works
  for (const service of translationServices) {
    try {
      const result = await service();
      return result;
    } catch (error) {
      console.warn(`Translation service failed: ${error.message}`);
      // Continue to the next service
    }
  }
  
  // If all services fail, return the original text
  console.error("All translation services failed");
  return text;
};

// ---------- Text-to-Speech ----------
const languageMap = { 
  en: "en-US", 
  hi: "hi-IN", 
  kn: "kn-IN", 
  te: "te-IN", 
  ta: "ta-IN" 
};

const speakMessage = (text, lang, mute) => {
  if (!text || mute) return;
  Speech.stop();
  Speech.speak(text, { 
    language: languageMap[lang] || "en-US", 
    rate: 0.9, 
    pitch: 1 
  });
};

// ---------- Alert Utility ----------
const showAlert = (title, message) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

// ---------- Main Component ----------
export default function NegotiationChatF() {
  const navigation = useNavigation();
  const route = useRoute();
  const { 
    conversationId: routeConvId, 
    cropId, 
    retailerId, 
    cropName, 
    retailerName 
  } = route.params || {};
  
  const [conversationId, setConversationId] = useState(routeConvId || null);
  const [farmerId, setFarmerId] = useState(null);
  const [farmerName, setFarmerName] = useState("Farmer");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState("en");
  const [mute, setMute] = useState(false);
  const [langModal, setLangModal] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  
  // Web speech recognition refs
  const recognitionRef = useRef(null);
  const [webSpeechSupported, setWebSpeechSupported] = useState(false);
  
  const languages = [
    { label: "English", value: "en" },
    { label: "Kannada", value: "kn" },
    { label: "Hindi", value: "hi" },
    { label: "Telugu", value: "te" },
    { label: "Tamil", value: "ta" },
  ];

  // ----- Initialize Speech Recognition -----
  useEffect(() => {
    const initSpeechRecognition = async () => {
      if (Platform.OS === 'web') {
        // Initialize Web Speech API for web
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          setWebSpeechSupported(true);
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = false;
          recognitionRef.current.interimResults = false;
          recognitionRef.current.lang = 'en-US';
          
          recognitionRef.current.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setInputText(transcript);
            setIsRecording(false);
          };
          
          recognitionRef.current.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            if (event.error !== 'no-speech') {
              showAlert("Error", `Voice recognition failed: ${event.error}`);
            }
            setIsRecording(false);
          };
          
          recognitionRef.current.onspeechend = () => {
            setIsRecording(false);
          };
          
          recognitionRef.current.onend = () => {
            setIsRecording(false);
          };
        }
      } else {
        // Initialize @react-native-voice for native platforms
        try {
          const isAvailable = await Voice.isAvailable();
          setVoiceAvailable(isAvailable);
          
          if (isAvailable) {
            Voice.onSpeechStart = () => setIsRecording(true);
            Voice.onSpeechEnd = () => setIsRecording(false);
            Voice.onSpeechResults = (result) => {
              if (result.value.length > 0) {
                setInputText(result.value[0]);
              }
            };
            Voice.onSpeechError = (error) => {
              console.error('Speech recognition error', error);
              setIsRecording(false);
              if (error.error && error.error.code !== '7') { // Don't show alert for no speech
                showAlert("Error", `Voice recognition failed: ${error.error ? error.error.message : 'Unknown error'}`);
              }
            };
          }
        } catch (e) {
          console.error('Failed to initialize Voice module', e);
          setVoiceAvailable(false);
        }
      }
    };
    
    initSpeechRecognition();
    
    return () => {
      if (Platform.OS === 'web') {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      } else {
        if (voiceAvailable) {
          Voice.destroy().then(Voice.removeAllListeners);
        }
      }
    };
  }, [voiceAvailable]);

  // ----- Header Setup -----
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: cropName || "Crop Chat",
      headerTintColor: "#fff",
      headerStyle: { backgroundColor: "#4CAF50" },
      headerTitleStyle: { color: "#fff", fontWeight: "700" },
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
          {/* Mute toggle */}
          <TouchableOpacity
            onPress={() => setMute((m) => !m)}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={mute ? "volume-mute-outline" : "volume-high-outline"}
              size={22}
              color="#fff"
            />
          </TouchableOpacity>
          {/* Language button */}
          <TouchableOpacity
            onPress={() => setLangModal(true)}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="language" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, cropName, mute]);

  // ----- Fetch Farmer Info -----
  useEffect(() => {
    (async () => {
      try {
        const id = await AsyncStorage.getItem("userId");
        const name = await AsyncStorage.getItem("userName");
        if (id) setFarmerId(id);
        if (name) setFarmerName(name);
      } catch (e) {
        console.error("Error fetching farmer info:", e);
      }
    })();
  }, []);

  // ----- Create or Fetch Conversation -----
  const getOrCreateConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    if (!farmerId || !cropId || !retailerId) return null;
    
    try {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("crop_id", cropId)
        .eq("farmer_id", farmerId)
        .eq("retailer_id", retailerId)
        .maybeSingle();
        
      if (existing) {
        setConversationId(existing.id);
        return existing.id;
      }
      
      const { data: created, error } = await supabase
        .from("conversations")
        .insert([
          {
            crop_id: cropId,
            farmer_id: farmerId,
            retailer_id: retailerId,
            last_message: "Conversation started",
            last_message_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();
        
      if (error) throw error;
      setConversationId(created.id);
      return created.id;
    } catch (err) {
      console.error("Conversation error:", err);
      showAlert("Error", "Failed to start conversation");
      return null;
    }
  }, [conversationId, farmerId, cropId, retailerId]);

  // ----- Fetch Messages -----
  const fetchMessages = useCallback(
    async (convId) => {
      if (!convId) return;
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false });
          
        if (error) throw error;
        
        const formatted = await Promise.all(
          (data || []).map(async (msg) => {
            // Only translate if the selected language is not English
            if (selectedLang !== 'en') {
              try {
                const translated = await translateText(msg.content, selectedLang);
                return {
                  _id: msg.id.toString(),
                  text: translated,
                  originalText: msg.content,
                  createdAt: new Date(msg.created_at),
                  user: {
                    _id: msg.sender_id,
                    name: msg.sender_id === farmerId ? farmerName : retailerName || "Retailer",
                  },
                };
              } catch (e) {
                console.error("Translation error:", e);
                // Return original text if translation fails
                return {
                  _id: msg.id.toString(),
                  text: msg.content,
                  originalText: msg.content,
                  createdAt: new Date(msg.created_at),
                  user: {
                    _id: msg.sender_id,
                    name: msg.sender_id === farmerId ? farmerName : retailerName || "Retailer",
                  },
                };
              }
            } else {
              // No translation needed for English
              return {
                _id: msg.id.toString(),
                text: msg.content,
                originalText: msg.content,
                createdAt: new Date(msg.created_at),
                user: {
                  _id: msg.sender_id,
                  name: msg.sender_id === farmerId ? farmerName : retailerName || "Retailer",
                },
              };
            }
          })
        );
        
        setMessages(formatted);
      } catch (err) {
        console.error("Fetch messages error:", err);
        showAlert("Error", "Failed to load messages");
      } finally {
        setLoading(false);
      }
    },
    [farmerId, farmerName, retailerName, selectedLang]
  );

  // ----- Auto Refresh Messages -----
  useEffect(() => {
    if (!farmerId) return;
    
    let refreshInterval;
    
    (async () => {
      const convId = await getOrCreateConversation();
      if (!convId) return;
      
      await fetchMessages(convId);
      refreshInterval = setInterval(() => fetchMessages(convId), 3000);
    })();
    
    return () => refreshInterval && clearInterval(refreshInterval);
  }, [farmerId, getOrCreateConversation, fetchMessages]);

  // ----- Refresh messages when language changes -----
  useEffect(() => {
    if (conversationId && farmerId) {
      fetchMessages(conversationId);
    }
  }, [selectedLang, conversationId, farmerId, fetchMessages]);

  // ----- Send Message -----
  const onSend = useCallback(
    async (newMessages = []) => {
      if (!conversationId || !farmerId || newMessages.length === 0) return;
      
      try {
        const message = newMessages[0];
        
        // If the selected language is not English, translate the message to English before sending
        let textToSend = message.text;
        if (selectedLang !== 'en') {
          try {
            textToSend = await translateText(message.text, 'en');
          } catch (e) {
            console.error("Failed to translate outgoing message", e);
            // If translation fails, use the original text
            textToSend = message.text;
          }
        }
        
        await supabase.from("messages").insert([
          { conversation_id: conversationId, sender_id: farmerId, content: textToSend },
        ]);
        
        await supabase
          .from("conversations")
          .update({
            last_message: textToSend.substring(0, 50),
            last_message_at: new Date().toISOString(),
            last_sender: farmerId,
          })
          .eq("id", conversationId);
          
        // Create a temporary message with the original text for immediate display
        const tempId = `temp_${Date.now()}`;
        const tempMessage = {
          _id: tempId,
          text: message.text, // the original text in selected language
          createdAt: new Date(),
          user: {
            _id: farmerId,
            name: farmerName,
          },
        };
        
        // Add the temporary message to the local state
        setMessages(previousMessages => GiftedChat.append(previousMessages, [tempMessage]));
        
        // Clear the input text
        setInputText("");
        
        // Immediately fetch messages to get the server-generated message
        await fetchMessages(conversationId);
      } catch (err) {
        console.error("Send message error:", err);
        showAlert("Error", "Failed to send message");
      }
    },
    [conversationId, farmerId, fetchMessages, selectedLang]
  );

  // ----- Voice Recognition -----
  const startSpeechToText = async () => {
    if (Platform.OS === 'web') {
      if (!webSpeechSupported) {
        showAlert("Error", "Speech recognition not supported in this browser");
        return;
      }
      
      try {
        setIsRecording(true);
        recognitionRef.current.lang = selectedLang === 'en' ? 'en-US' : selectedLang;
        recognitionRef.current.start();
      } catch (err) {
        console.error("Web speech recognition error:", err);
        showAlert("Error", "Voice recognition failed");
        setIsRecording(false);
      }
    } else {
      // Native platform
      if (!voiceAvailable) {
        showAlert("Error", "Voice recognition not available on this device");
        return;
      }
      
      try {
        setIsRecording(true);
        await Voice.start(selectedLang === 'en' ? 'en-US' : selectedLang);
      } catch (e) {
        console.error('Failed to start speech recognition', e);
        showAlert("Error", "Failed to start voice recognition");
        setIsRecording(false);
      }
    }
  };

  const stopSpeechToText = async () => {
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      // Native platform
      if (!voiceAvailable) return;
      
      try {
        await Voice.stop();
      } catch (e) {
        console.error('Failed to stop speech recognition', e);
      }
    }
  };

  // ----- GiftedChat Renderers -----
  const renderBubble = (props) => {
    const { currentMessage } = props;
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          right: { backgroundColor: "#4CAF50", borderRadius: 18, padding: 8 },
          left: { backgroundColor: "#E8F5E9", borderRadius: 18, padding: 8 },
        }}
        textStyle={{ right: { color: "#fff" }, left: { color: "#2E7D32" } }}
        onPress={() => speakMessage(currentMessage.text, selectedLang, mute)}
      />
    );
  };

  const renderSend = (props) => (
    <Send {...props}>
      <View style={styles.sendButton}>
        <Ionicons name="send" size={18} color="#fff" />
      </View>
    </Send>
  );

  const renderActions = () => (
    <TouchableOpacity 
      onPress={isRecording ? stopSpeechToText : startSpeechToText} 
      style={styles.micButton}
      disabled={(Platform.OS === 'web' && !webSpeechSupported) || (Platform.OS !== 'web' && !voiceAvailable)}
    >
      <Ionicons 
        name={isRecording ? "mic" : "mic-outline"} 
        size={24} 
        color={
          isRecording 
            ? "red" 
            : ((Platform.OS === 'web' && !webSpeechSupported) || (Platform.OS !== 'web' && !voiceAvailable) 
                ? "#ccc" 
                : "#4CAF50")
        } 
      />
    </TouchableOpacity>
  );

  const renderInputToolbar = (props) => (
    <InputToolbar
      {...props}
      containerStyle={styles.inputToolbar}
      primaryStyle={{ alignItems: "center" }}
      renderActions={renderActions}
    />
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text>Loading chat...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ImageBackground 
        source={require("../../assets/images/chatbg.jpeg")} 
        style={styles.backgroundImage}
      >
        <View style={styles.chatContainer}>
          <GiftedChat
            messages={messages}
            onSend={(m) => onSend(m)}
            user={{ _id: farmerId, name: farmerName }}
            renderBubble={renderBubble}
            renderSend={renderSend}
            renderInputToolbar={renderInputToolbar}
            placeholder="Type or speak a message..."
            scrollToBottom
            inverted
            alwaysShowSend
            keyboardShouldPersistTaps="handled"
            textInputStyle={styles.textInput}
            text={inputText}
            onInputTextChanged={(t) => setInputText(t)}
            listViewProps={{
              contentContainerStyle: { paddingBottom: 20, paddingTop: 10 },
            }}
            minInputToolbarHeight={60}
            minComposerHeight={44}
            maxComposerHeight={100}
            bottomOffset={Platform.OS === "android" ? 20 : 0}
          />
        </View>
        
        {/* Language Modal */}
        <Modal
          visible={langModal}
          animationType="fade"
          transparent
          statusBarTranslucent={true}
          onRequestClose={() => setLangModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>
                Select Language {retailerName ? `for ${retailerName}` : ""}
              </Text>
              <ScrollView style={{ maxHeight: height * 0.4 }}>
                {languages.map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.langOption,
                      selectedLang === item.value && styles.langActive,
                    ]}
                    onPress={() => {
                      setSelectedLang(item.value);
                      setLangModal(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.langOptionText,
                        selectedLang === item.value && styles.langActiveText,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity 
                style={styles.modalCloseButton} 
                onPress={() => setLangModal(false)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ImageBackground>
    </SafeAreaView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#f5f5f5" 
  },
  backgroundImage: { 
    flex: 1, 
    resizeMode: "cover" 
  },
  centerContainer: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  chatContainer: { 
    flex: 1 
  },
  inputToolbar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: Platform.OS === "android" ? 10 : 0,
    minHeight: 60,
  },
  textInput: {
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginLeft: 8,
    minHeight: 44,
    maxHeight: 100,
  },
  sendButton: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#4CAF50",
    borderRadius: 20,
    width: 40,
    height: 40,
    marginRight: 4,
    marginBottom: 4,
  },
  micButton: { 
    marginLeft: 6, 
    marginRight: 4, 
    justifyContent: "center", 
    alignItems: "center",
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#f0f0f0',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalBox: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
    color: "#333",
  },
  langOption: {
    padding: 14,
    borderRadius: 8,
    marginVertical: 6,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  langActive: { 
    backgroundColor: "#4CAF50" 
  },
  langOptionText: { 
    fontSize: 16, 
    color: "#333" 
  },
  langActiveText: { 
    color: "#fff", 
    fontWeight: "bold" 
  },
  modalCloseButton: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#eaeaea",
    borderRadius: 8,
  },
  modalCloseText: { 
    fontSize: 16, 
    color: "#333" 
  },
});