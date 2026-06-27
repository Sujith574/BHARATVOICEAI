import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/api";

export default function DashboardScreen() {
  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: apiClient.getDashboardStats,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  if (isLoading && !stats) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Fetching control telemetry...</Text>
      </View>
    );
  }

  const languageStats = stats?.languageDistribution || [];
  const maxCount = languageStats.reduce((max, item) => Math.max(max, item.count), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Dashboard</Text>
          <Text style={styles.subWelcome}>Bharat Voice Live Overview</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void refetch()}>
          {isRefetching ? (
            <ActivityIndicator size="small" color="#10b981" />
          ) : (
            <Text style={styles.refreshText}>Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stats Cards Grid */}
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Active Calls</Text>
          <Text style={[styles.cardValue, { color: "#10b981" }]}>
            {stats?.activeCallsCount ?? 0}
          </Text>
          <View style={styles.badgeContainer}>
            <View style={[styles.dot, { backgroundColor: "#10b981" }]} />
            <Text style={styles.badgeText}>Live Streams</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Escalated Tickets</Text>
          <Text style={[styles.cardValue, { color: "#ef4444" }]}>
            {stats?.unresolvedTicketsCount ?? 0}
          </Text>
          <Text style={styles.cardSubtitle}>Total open: {stats?.totalTicketsCount ?? 0}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Avg. Duration</Text>
          <Text style={[styles.cardValue, { color: "#3b82f6" }]}>
            {stats?.averageDurationSeconds ?? 0}s
          </Text>
          <Text style={styles.cardSubtitle}>Per citizen turn</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>System Status</Text>
          <Text style={[styles.cardValue, { color: "#eab308", fontSize: 24, marginVertical: 8 }]}>
            HEALTHY
          </Text>
          <Text style={styles.cardSubtitle}>Sarvam / Gemini Online</Text>
        </View>
      </View>

      {/* Language Distribution Visual Chart */}
      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Language Distribution</Text>
        <View style={styles.chartCard}>
          {languageStats.map((item, idx) => {
            const pct = (item.count / maxCount) * 100;
            return (
              <View key={idx} style={styles.barContainer}>
                <View style={styles.barLabelContainer}>
                  <Text style={styles.barLabel}>{item.language}</Text>
                  <Text style={styles.barVal}>{item.count} calls</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${pct}%`, backgroundColor: idx === 0 ? "#10b981" : idx === 1 ? "#3b82f6" : "#8b5cf6" },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0f19",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0b0f19",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#64748b",
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 20,
  },
  welcome: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f8fafc",
  },
  subWelcome: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: "#161e2e",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  refreshText: {
    color: "#10b981",
    fontWeight: "600",
    fontSize: 13,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  card: {
    width: "48%",
    backgroundColor: "#161e2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    justifyContent: "space-between",
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: "bold",
    marginVertical: 4,
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#475569",
  },
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 11,
    color: "#94a3b8",
  },
  chartSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 12,
  },
  chartCard: {
    backgroundColor: "#161e2e",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  barContainer: {
    marginBottom: 16,
  },
  barLabelContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  barLabel: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "500",
  },
  barVal: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "bold",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#0b0f19",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
});
