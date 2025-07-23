import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function Index() {
  const [recentScans, setRecentScans] = useState<{ name: string; uri: string }[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAnim] = useState(new Animated.Value(-270));
  const scanAnim = useRef(new Animated.Value(1)).current;

  // Dummy user info for demonstration
  const user = {
    name: "John Doe",
    status: "pro", // "pro", "premium", "free"
  };

  useEffect(() => {
    const verify = async () => {
      const token = await SecureStore.getItemAsync('token');
      if (!token) router.replace('/login');
    };
    verify();
    fetchRecentScans();
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      Animated.timing(drawerAnim, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(drawerAnim, {
        toValue: -270,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
  }, [drawerOpen]);

  useEffect(() => {
    // Animate the Scan Sheet button every time the screen is visited
    Animated.sequence([
      Animated.timing(scanAnim, {
        toValue: 1.15,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scanAnim, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const fetchRecentScans = async () => {
    try {
      const resultsDir = FileSystem.documentDirectory + "Scanned_results/";
      const files = await FileSystem.readDirectoryAsync(resultsDir);
      const formatted = files
        .map((name) => ({
          name,
          uri: resultsDir + name,
        }))
        .sort((a, b) => (a.name < b.name ? 1 : -1))
        .slice(0, 3);
      setRecentScans(formatted);
    } catch (e) {
      setRecentScans([]);
    }
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync("token");
    router.replace("/login");
  };

  // Drawer badge color and label
  const statusMap = {
    pro: { label: "PRO", color: "#FFD600" },
    premium: { label: "PREMIUM", color: "#00E676" },
    free: { label: "FREE TRIAL", color: "#FF5252" },
  };
  const status = statusMap[user.status] || statusMap.free;

  return (
    <SafeAreaView className="flex-1 bg-[#181A20]">
      {/* Drawer Modal */}
      <Modal
        visible={drawerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setDrawerOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", flexDirection: "row" }}
          onPress={() => setDrawerOpen(false)}
        >
          <Animated.View
            style={{
              width: 270,
              height: "100%",
              backgroundColor: "#232634",
              paddingTop: 60,
              paddingHorizontal: 24,
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 10,
              elevation: 10,
              transform: [{ translateX: drawerAnim }],
              zIndex: 10,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 32 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: "#FFD600", alignItems: "center", justifyContent: "center"
              }}>
                <Ionicons name="person" size={38} color="#232634" />
              </View>
              <Text style={{ color: "#fff", fontSize: 20, fontWeight: "bold", marginTop: 12 }}>
                {user.name}
              </Text>
              <View style={{
                marginTop: 8,
                backgroundColor: status.color,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 2,
                alignSelf: "center"
              }}>
                <Text style={{
                  color: "#232634",
                  fontWeight: "bold",
                  fontSize: 13,
                  letterSpacing: 1
                }}>
                  {status.label}
                </Text>
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: "#393B44", paddingTop: 24 }}>
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
                <Ionicons name="person-circle-outline" size={22} color="#FFD600" />
                <Text style={{ color: "#fff", fontSize: 16, marginLeft: 14 }}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center" }}
                onPress={handleLogout}
              >
                <MaterialIcons name="logout" size={22} color="#FFD600" />
                <Text style={{ color: "#fff", fontSize: 16, marginLeft: 14 }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          <View style={{ flex: 1 }} />
        </Pressable>
      </Modal>

        {/* Header */}
        <View className="w-full flex-row justify-between items-center px-6 pt-6 mb-2">
          <TouchableOpacity onPress={() => setDrawerOpen(true)} className="p-1">
            <Ionicons name="menu" size={28} color="#FFD600" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-white">Home</Text>
          <View style={{ width: 28 }} /> 
        </View>
      <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 40 }}>
        {/* App Logo */}
        <View className="w-24 h-24 bg-[#232634] rounded-full justify-center items-center mb-4 mt-2">
          <MaterialIcons name="document-scanner" size={48} color="#FFD600" />
        </View>
        {/* App Name */}
        <Text className="text-2xl font-bold text-white text-center mb-1">ScanTron</Text>
        {/* Welcome Message */}
        <Text className="text-base text-center mb-6 text-gray-300 px-8">
          Welcome! Start scanning your scannable sheets or view your results.
        </Text>
        {/* Quick Actions */}
        <View className="w-full items-center mb-8 mt-4">
          <Animated.View style={{
            transform: [{ scale: scanAnim }],
            shadowColor: "#FFD600",
            shadowOpacity: 0.5,
            shadowRadius: 10,
            elevation: 12,
          }}>
            <TouchableOpacity
              className="bg-[#FFD600] rounded-full flex-row items-center justify-center"
              style={{
                width: 180,
                height: 180,
                borderRadius: 90,
                elevation: 8,
                shadowColor: "#FFD600",
                shadowOpacity: 0.5,
                shadowRadius: 24,
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
              }}
              onPress={() => router.push('/scan')}
              activeOpacity={0.85}
            >
              <MaterialIcons name="document-scanner" size={60} color="#232634" />
              <Text style={{
                color: "#232634",
                fontWeight: "bold",
                fontSize: 26,
                letterSpacing: 1,
              }}>
                Scan
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
        {/* Recent Scans Card */}
        <View className="w-11/12 bg-[#232634] rounded-2xl p-4 mb-6">
          <Text className="text-white font-bold mb-2">Recent Scans</Text>
          {recentScans.length === 0 && (
            <Text className="text-gray-400">No recent scans found.</Text>
          )}
          {recentScans.map(scan => (
            <View key={scan.uri} className="flex-row justify-between items-center mb-2">
              <View>
                <Text className="font-semibold text-gray-200">{scan.name}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity onPress={() => router.push('/saved_files')}>
            <Text className="text-xs text-right text-[#FFD600] mt-1">See all</Text>
          </TouchableOpacity>
        </View>
        {/* Tip Card */}
        <View className="w-11/12 bg-[#FFD600] rounded-2xl p-4 mb-6 flex-row items-center">
          <MaterialIcons name="lightbulb" size={22} color="#232634" />
          <Text className="text-[#232634] text-sm ml-2">
            Tip: For best results, scan in a well-lit area and keep your scannable sheet flat!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
