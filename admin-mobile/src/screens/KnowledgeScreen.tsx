import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "../services/api";
import type { KnowledgeDocument } from "../types";

export default function KnowledgeScreen() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("OFFICIAL_PDF");
  const [languageCode, setLanguageCode] = useState("te-IN");
  const [fileContent, setFileContent] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["knowledgeDocuments"],
    queryFn: apiClient.getDocuments,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      // Simulate file upload metadata using FormData
      const formData = new FormData();
      formData.append("title", title);
      formData.append("sourceType", sourceType);
      formData.append("languageCode", languageCode);
      // Simulate raw file buffer from user input content
      const blob = new Blob([fileContent || "Default Scheme Content"], { type: "text/plain" });
      formData.append("file", blob, "uploaded_document.txt");

      return apiClient.uploadDocument(formData);
    },
    onSuccess: () => {
      Alert.alert("Success", "Document uploaded and parsed successfully");
      setTitle("");
      setFileContent("");
      setShowAddForm(false);
      void refetch();
    },
    onError: (err) => {
      Alert.alert("Upload Failed", err.message || "Failed to ingest document");
    },
  });

  const handleUpload = () => {
    if (!title || !fileContent) {
      Alert.alert("Error", "Please fill in the title and content fields");
      return;
    }
    uploadMutation.mutate();
  };

  const documents = data?.items || [];

  const renderDocItem = ({ item }: { item: KnowledgeDocument }) => {
    const isApproved = item.approvalStatus === "APPROVED";
    return (
      <View style={styles.docCard}>
        <Text style={styles.docTitle}>{item.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{item.sourceType} • {item.languageCode}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isApproved ? "rgba(16, 185, 129, 0.15)" : "rgba(59, 130, 246, 0.15)" }]}>
            <Text style={[styles.statusText, { color: isApproved ? "#10b981" : "#3b82f6" }]}>
              {item.approvalStatus}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Knowledge Base</Text>
          <Text style={styles.subtitle}>Verified Government Schemes & Guidelines</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(!showAddForm)}
        >
          <Text style={styles.addButtonText}>{showAddForm ? "Cancel" : "Add Doc"}</Text>
        </TouchableOpacity>
      </View>

      {showAddForm ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Ingest New Document</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Document Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. MeeSeva Residence Certificate Guidelines"
              placeholderTextColor="#64748b"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Source Type</Text>
              <TextInput
                style={styles.input}
                value={sourceType}
                onChangeText={setSourceType}
              />
            </View>

            <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Language</Text>
              <TextInput
                style={styles.input}
                value={languageCode}
                onChangeText={setLanguageCode}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Document Plain Text Content (for OCR Parsing)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Paste official notification text here..."
              placeholderTextColor="#64748b"
              value={fileContent}
              onChangeText={setFileContent}
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleUpload}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Ingest & Generate Embeddings</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loaderText}>Querying database index...</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderDocItem}
          contentContainerStyle={styles.listContent}
          onRefresh={() => void refetch()}
          refreshing={isLoading}
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
  addButton: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  docCard: {
    backgroundColor: "#161e2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  docTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaText: {
    fontSize: 12,
    color: "#64748b",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  formCard: {
    backgroundColor: "#161e2e",
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f8fafc",
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 6,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: "#0b0f19",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f8fafc",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  row: {
    flexDirection: "row",
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#10b981",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 14,
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
});
