import React, { useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, Platform, StatusBar } from "react-native";
import { useAuthStore } from "../store/useAuthStore";
import LoginScreen from "../screens/LoginScreen";
import DashboardScreen from "../screens/DashboardScreen";
import LiveCallsScreen from "../screens/LiveCallsScreen";
import KnowledgeScreen from "../screens/KnowledgeScreen";
import SettingsScreen from "../screens/SettingsScreen";

type TabName = "Dashboard" | "LiveCalls" | "Knowledge" | "Settings";

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [activeTab, setActiveTab] = useState<TabName>("Dashboard");

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case "Dashboard":
        return <DashboardScreen />;
      case "LiveCalls":
        return <LiveCallsScreen />;
      case "Knowledge":
        return <KnowledgeScreen />;
      case "Settings":
        return <SettingsScreen />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screenContainer}>{renderActiveScreen()}</View>
      
      {/* Custom Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {(["Dashboard", "LiveCalls", "Knowledge", "Settings"] as const).map((tab) => {
          const isActive = activeTab === tab;
          
          let label: string = tab;
          if (tab === "LiveCalls") label = "Live";
          if (tab === "Knowledge") label = "Knowledge";

          let emoji = "📊";
          if (tab === "LiveCalls") emoji = "📞";
          if (tab === "Knowledge") emoji = "📚";
          if (tab === "Settings") emoji = "⚙️";

          return (
            <TouchableOpacity
              key={tab}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabIcon, isActive && styles.activeTabIcon]}>{emoji}</Text>
              <Text style={[styles.tabLabel, isActive && styles.activeTabLabel]}>
                {label}
              </Text>
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0f19",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    height: 64,
    backgroundColor: "#161e2e",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 8 : 0,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    height: "100%",
    position: "relative",
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.6,
    marginBottom: 2,
  },
  activeTabIcon: {
    opacity: 1.0,
    transform: [{ scale: 1.1 }],
  },
  tabLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  activeTabLabel: {
    color: "#10b981",
  },
  activeIndicator: {
    position: "absolute",
    top: 0,
    width: 28,
    height: 3,
    backgroundColor: "#10b981",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
