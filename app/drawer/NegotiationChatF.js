// NegotiationChatF.js
import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import {
  View, Text, ActivityIndicator, ImageBackground, TouchableOpacity,
  Alert, Modal, StyleSheet, Platform, SafeAreaView, Dimensions,
  StatusBar, ScrollView, KeyboardAvoidingView
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GiftedChat, Bubble, InputToolbar, Send } from "react-native-gifted-chat";
import { supabase } from "../supabase/supabaseClient";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import Voice from "@react-native-voice/voice";

const { height } = Dimensions.get("window");

// ----- Translation helper -----
const translateText = async (text, targetLang) => {
  if (!text) return "";
  if (targetLang === "en") return text;
  const services = [
    async () => {
      const res = await fetch("https://translate.argosopentech.com/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source: "auto", target: targetLang, format: "text" }),
      });
      if (!res.ok) throw new Error("LibreTranslate failed");
      const data = await res.json();
      return data.translatedText;
    },
    async () => {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
      );
      const data = await res.json();
      return data[0].map((item) => item[0]).join("");
    },
  ];
  for (const s of services) {
    try { return await s(); } catch { continue; }
  }
  return text;
};

// ----- Text-to-speech -----
const languageMap = { en: "en-US", hi: "hi-IN", kn: "kn-IN", te: "te-IN", ta: "ta-IN" };
const speakMessage = (text, lang, mute) => { if (!text || mute) return; Speech.stop(); Speech.speak(text, { language: languageMap[lang] || "en-US", rate: 0.9, pitch: 1 }); };

// ----- Alert -----
const showAlert = (title, message) => { Platform.OS === "web" ? window.alert(`${title}\n${message}`) : Alert.alert(title, message); };

// ----- Main Component -----
export default function NegotiationChatF() {
  const navigation = useNavigation();
  const route = useRoute();
  const { conversationId: routeConvId, cropId, retailerId, cropName, retailerName } = route.params || {};

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

  const recognitionRef = useRef(null);
  const [webSpeechSupported, setWebSpeechSupported] = useState(false);

  const languages = [
    { label: "English", value: "en" },
    { label: "Kannada", value: "kn" },
    { label: "Hindi", value: "hi" },
    { label: "Telugu", value: "te" },
    { label: "Tamil", value: "ta" },
  ];

  // ----- Initialize Voice -----
  useEffect(() => {
    const init = async () => {
      if (Platform.OS === "web") {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          setWebSpeechSupported(true);
          recognitionRef.current = new SpeechRecognition();
          recognitionRef.current.continuous = false;
          recognitionRef.current.interimResults = false;
          recognitionRef.current.lang = "en-US";
          recognitionRef.current.onresult = (e) => { setInputText(e.results[0][0].transcript); setIsRecording(false); };
          recognitionRef.current.onerror = (e) => { console.error(e.error); setIsRecording(false); };
        }
      } else {
        try {
          const isAvailable = await Voice.isAvailable();
          setVoiceAvailable(isAvailable);
          if (isAvailable) {
            Voice.onSpeechStart = () => setIsRecording(true);
            Voice.onSpeechEnd = () => setIsRecording(false);
            Voice.onSpeechResults = (result) => { if (result.value.length > 0) setInputText(result.value[0]); };
            Voice.onSpeechError = (error) => { console.error(error); setIsRecording(false); };
          }
        } catch (e) { console.error(e); setVoiceAvailable(false); }
      }
    };
    init();
    return () => {
      if (Platform.OS === "web") recognitionRef.current?.stop();
      else if (voiceAvailable) Voice.destroy().then(Voice.removeAllListeners);
    };
  }, [voiceAvailable]);

  // ----- Fetch Farmer Info -----
  useEffect(() => {
    (async () => {
      const id = await AsyncStorage.getItem("userId");
      const name = await AsyncStorage.getItem("userName");
      if (id) setFarmerId(id);
      if (name) setFarmerName(name);
    })();
  }, []);

  // ----- Conversation -----
  const getOrCreateConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    if (!farmerId || !cropId || !retailerId) return null;
    try {
      const { data: existing } = await supabase.from("conversations").select("id").eq("crop_id", cropId).eq("farmer_id", farmerId).eq("retailer_id", retailerId).maybeSingle();
      if (existing) { setConversationId(existing.id); return existing.id; }
      const { data: created, error } = await supabase.from("conversations").insert([{ crop_id: cropId, farmer_id: farmerId, retailer_id: retailerId, last_message: "Conversation started", last_message_at: new Date().toISOString() }]).select().single();
      if (error) throw error;
      setConversationId(created.id);
      return created.id;
    } catch (err) { console.error(err); showAlert("Error", "Failed to start conversation"); return null; }
  }, [conversationId, farmerId, cropId, retailerId]);

  // ----- Fetch Messages -----
  const fetchMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: false });
      if (error) throw error;
      const formatted = await Promise.all((data || []).map(async (msg) => {
        const translated = selectedLang !== "en" ? await translateText(msg.content, selectedLang) : msg.content;
        return { _id: msg.id.toString(), text: translated, createdAt: new Date(msg.created_at), user: { _id: msg.sender_id, name: msg.sender_id === farmerId ? farmerName : retailerName || "Retailer" } };
      }));
      setMessages(formatted);
    } catch (err) { console.error(err); showAlert("Error", "Failed to load messages"); } finally { setLoading(false); }
  }, [farmerId, farmerName, retailerName, selectedLang]);

  useEffect(() => {
    if (!farmerId) return;
    let interval;
    (async () => { const convId = await getOrCreateConversation(); if (!convId) return; await fetchMessages(convId); interval = setInterval(() => fetchMessages(convId), 3000); })();
    return () => interval && clearInterval(interval);
  }, [farmerId, getOrCreateConversation, fetchMessages]);

  useEffect(() => { if (conversationId && farmerId) fetchMessages(conversationId); }, [selectedLang, conversationId, farmerId, fetchMessages]);

  // ----- Send Message -----
  const onSend = useCallback(async (newMessages = []) => {
    if (!conversationId || !farmerId || newMessages.length === 0) return;
    try {
      let textToSend = newMessages[0].text;
      if (selectedLang !== "en") textToSend = await translateText(newMessages[0].text, "en"); // convert to English before DB
      await supabase.from("messages").insert([{ conversation_id: conversationId, sender_id: farmerId, content: textToSend }]);
      await supabase.from("conversations").update({ last_message: textToSend.substring(0,50), last_message_at: new Date().toISOString(), last_sender: farmerId }).eq("id", conversationId);
      setMessages(prev => GiftedChat.append(prev, [{ _id: `temp_${Date.now()}`, text: newMessages[0].text, createdAt: new Date(), user: { _id: farmerId, name: farmerName } }]));
      setInputText("");
      await fetchMessages(conversationId);
    } catch (err) { console.error(err); showAlert("Error", "Failed to send message"); }
  }, [conversationId, farmerId, fetchMessages, selectedLang]);

  // ----- Speech handlers -----
  const startSpeechToText = async () => {
    if (Platform.OS === "web") {
      if (!webSpeechSupported) return showAlert("Error", "Speech recognition not supported");
      try { setIsRecording(true); recognitionRef.current.lang = languageMap[selectedLang] || "en-US"; recognitionRef.current.start(); } catch { setIsRecording(false); }
    } else {
      if (!voiceAvailable) return showAlert("Error", "Voice recognition not available");
      try { setIsRecording(true); await Voice.start(languageMap[selectedLang] || "en-US"); } catch { setIsRecording(false); }
    }
  };
  const stopSpeechToText = async () => { if (Platform.OS === "web") recognitionRef.current?.stop(); else if (voiceAvailable) await Voice.stop(); };

  // ----- GiftedChat renderers -----
  const renderBubble = (props) => <Bubble {...props} wrapperStyle={{ right:{backgroundColor:"#4CAF50"}, left:{backgroundColor:"#E8F5E9"} }} textStyle={{right:{color:"#fff"},left:{color:"#2E7D32"}}} onPress={() => speakMessage(props.currentMessage.text, selectedLang, mute)} />;
  const renderSend = (props) => <Send {...props}><View style={styles.sendButton}><Ionicons name="send" size={18} color="#fff"/></View></Send>;
  const renderActions = () => <TouchableOpacity onPress={isRecording?stopSpeechToText:startSpeechToText} style={styles.micButton} disabled={(Platform.OS==="web"&&!webSpeechSupported)||(!voiceAvailable&&Platform.OS!=="web")}><Ionicons name={isRecording?"mic":"mic-outline"} size={24} color={isRecording?"red":"#4CAF50"} /></TouchableOpacity>;
  const renderInputToolbar = (props) => <InputToolbar {...props} containerStyle={styles.inputToolbar} primaryStyle={{alignItems:"center"}} renderActions={renderActions} />;

  if (loading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#4CAF50"/><Text>Loading chat...</Text></View>;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content"/>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==="ios"?"padding":undefined}>
      <ImageBackground source={require("../../assets/images/chatbg.jpeg")} style={styles.backgroundImage}>
        <GiftedChat messages={messages} onSend={m => onSend(m)} user={{_id:farmerId,name:farmerName}} renderBubble={renderBubble} renderSend={renderSend} renderInputToolbar={renderInputToolbar} placeholder="Type or speak a message..." scrollToBottom inverted alwaysShowSend keyboardShouldPersistTaps="handled" textInputStyle={styles.textInput} text={inputText} onInputTextChanged={t=>setInputText(t)} minInputToolbarHeight={60} minComposerHeight={44} maxComposerHeight={100} bottomOffset={Platform.OS==="android"?20:0}/>
        
        {/* Language Modal */}
        <Modal visible={langModal} animationType="fade" transparent statusBarTranslucent onRequestClose={()=>setLangModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Select Language {retailerName?`for ${retailerName}`:""}</Text>
              <ScrollView style={{maxHeight:height*0.4}}>{languages.map(item=>(
                <TouchableOpacity key={item.value} style={[styles.langOption, selectedLang===item.value && styles.langActive]} onPress={()=>{setSelectedLang(item.value);setLangModal(false);}}>
                  <Text style={[styles.langOptionText, selectedLang===item.value && styles.langActiveText]}>{item.label}</Text>
                </TouchableOpacity>
              ))}</ScrollView>
              <TouchableOpacity style={styles.modalCloseButton} onPress={()=>setLangModal(false)}><Text style={styles.modalCloseText}>Close</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ImageBackground>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ----- Styles -----
const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:"#f5f5f5"},
  backgroundImage:{flex:1,resizeMode:"cover"},
  centerContainer:{flex:1,justifyContent:"center",alignItems:"center"},
  inputToolbar:{backgroundColor:"#fff",borderTopWidth:1,borderTopColor:"#E8E8E8",paddingHorizontal:8,paddingVertical:6,marginBottom:Platform.OS==="android"?10:0,minHeight:60},
  textInput:{backgroundColor:"#f0f0f0",borderRadius:20,paddingHorizontal:12,paddingVertical:10,fontSize:16,marginLeft:8,minHeight:44,maxHeight:100},
  sendButton:{justifyContent:"center",alignItems:"center",backgroundColor:"#4CAF50",borderRadius:20,width:40,height:40,marginRight:4,marginBottom:4},
  micButton:{marginLeft:6,marginRight:4,justifyContent:"center",alignItems:"center",width:46,height:46,borderRadius:23,backgroundColor:"#f0f0f0"},
  modalOverlay:{flex:1,backgroundColor:"rgba(0,0,0,0.55)",justifyContent:"center",alignItems:"center",paddingHorizontal:20},
  modalBox:{width:"90%",backgroundColor:"#fff",borderRadius:16,padding:20,elevation:8,shadowColor:"#000",shadowOpacity:0.2,shadowRadius:8,shadowOffset:{width:0,height:2}},
  modalTitle:{fontSize:18,fontWeight:"bold",marginBottom:16,textAlign:"center",color:"#333"},
  langOption:{padding:14,borderRadius:8,marginVertical:6,backgroundColor:"#f0f0f0",alignItems:"center"},
  langActive:{backgroundColor:"#4CAF50"},
  langOptionText:{fontSize:16,color:"#333"},
  langActiveText:{color:"#fff",fontWeight:"bold"},
  modalCloseButton:{marginTop:16,paddingVertical:10,alignItems:"center",backgroundColor:"#eaeaea",borderRadius:8},
  modalCloseText:{fontSize:16,color:"#333"}
});
