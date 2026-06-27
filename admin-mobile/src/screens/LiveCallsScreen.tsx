import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/api";
import type { ActiveCall } from "../types";

export default function LiveCallsScreen() {
  const [filterLang, setFilterLang] = useState<"ALL" | "en-IN" | "hi-IN" | "te-IN">("ALL");

  const { data: calls = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["activeCalls"],
    queryFn: apiClient.getActiveCalls,
    refetchInterval: 3000, // Poll active calls every 3 seconds
  });

  const filteredCalls = calls.filter((call) => {
    if (filterLang === "ALL") return true;
    return call.languageCode === filterLang;
  });

  const renderCallItem = ({ item }: { item: ActiveCall }) => {
    const isProgress = item.status === "IN_PROGRESS";
    return (
      <View style={styles.callCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.phone}>{item.callerPhoneNumber || "Unknown Caller"}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isProgress ? "rgba(16, 185, 129, 0.15)" : "rgba(234, 179, 8, 0.15)" }]}>
            <View style={[styles.dot, { backgroundColor: isProgress ? "#10b981" : "#eab308" }]} />
            <Text style={[styles.statusText, { color: isProgress ? "#10b981" : "#eab308" }]}>{item.status}</Text>
          </View>
        </View>

        <Text style={styles.sid}>SID: {item.twilioCallSid}</Text>
        <Text style={styles.meta}>
          Language: <Text style={styles.boldText}>{item.languageCode}</Text> • Active: <Text style={styles.boldText}>{item.durationSeconds}s</Text>
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Live Streams</Text>
          <Text style={styles.subtitle}>Active Twilio Ingress Audio Channels</Text>
        </View>
        {isRefetching && <ActivityIndicator size="small" color="#10b981" />}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(["ALL", "en-IN", "hi-IN", "te-IN"] as const).map((lang) => (
          <TouchableOpacity
            key={lang}
            style={[styles.filterTab, filterLang === lang && styles.activeFilterTab]}
            onPress={() => setFilterLang(lang)}
          >
            <Text style={[styles.filterTabText, filterLang === lang && styles.activeFilterTabText]}>
              {lang === "ALL" ? "All" : lang.split("-")[0].toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading && !isRefetching ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loaderText}>Resolving audio channels...</Text>
        </View>
      ) : filteredCalls.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No active audio channels detected</Text>
          <Text style={styles.emptySubtext}>Calls stream live once a Twilio connection is established</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCalls}
          keyExtractor={(item) => item.id}
          renderItem={renderCallItem}
          contentContainerStyle={styles.listContent}
          onRefresh={() => void refetch()}
          refreshing={isRefetching}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0f19",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f8fafc",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  filterTab: {
    backgroundColor: "#161e2e",
    borderWidth: 1,
    borderColor: "#1e293b",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  activeFilterTab: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  filterTabText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  activeFilterTabText: {
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  callCard: {
    backgroundColor: "#161e2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  phone: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f8fafc",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  sid: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 8,
  },
  meta: {
    fontSize: 13,
    color: "#94a3b8",
  },
  boldText: {
    color: "#f8fafc",
    fontWeight: "bold",
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    color: "#64748b",
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  emptySubtext: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
  },
});
