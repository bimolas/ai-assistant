import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { YoRHaCard } from "../components/YoRHaCard";
import { YoRHaButton } from "../components/YoRHaButton";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { historyService, HistoryEntry } from "../services/historyService";

export const HistoryScreen: React.FC = () => {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (q = "") => {
    setLoading(true);
    try {
      const results = q
        ? await historyService.search(q)
        : await historyService.getAll();
      setItems(results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onClear = async () => {
    await historyService.clear();
    setItems([]);
  };

  const [expanded, setExpanded] = useState<{ [id: string]: boolean }>({});

  const renderItem = ({ item }: { item: HistoryEntry }) => {
    const isLLM = item.type === "llm";
    const showExpand = isLLM && item.expandable;
    const isExpanded = expanded[item.id];
    // Collapsed single-line text
    const collapsedText = isLLM ? item.short || item.response : item.command;

    return (
      <YoRHaCard style={styles.itemCard}>
        <TouchableOpacity
          disabled={!showExpand}
          onPress={() =>
            setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
          }
        >
          <View style={styles.row}>
            <Text
              style={styles.commandText}
              numberOfLines={isExpanded ? undefined : 1}
            >
              {collapsedText}
              {!isExpanded && showExpand && (
                <Text style={styles.ellipsis}>...</Text>
              )}
            </Text>

            {/* timestamp on the same line when collapsed */}
            {!isExpanded && (
              <Text style={styles.timeInline} numberOfLines={1}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* expanded view shows full response/details and full timestamp underneath */}
        {isExpanded && (
          <View style={styles.expandedArea}>
            {isLLM && <Text style={styles.responseText}>{item.response}</Text>}
            {!isLLM && <Text style={styles.responseText}>{item.command}</Text>}
            <Text style={styles.timeText}>
              {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
        )}
      </YoRHaCard>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Command History</Text>
      </View>

      <View style={styles.controls}>
        <TextInput
          placeholder="Search commands..."
          placeholderTextColor={colors.textTertiary}
          style={styles.search}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            load(t);
          }}
        />
        <YoRHaButton title="Clear" onPress={onClear} variant="outline" />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No history yet.</Text>}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    marginTop: 30,
  },
  header: {
    marginTop: 12,
    marginBottom: 12,
  },
  title: {
    ...typography.h2,
    color: colors.brownDark,
  },
  controls: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  search: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    color: colors.textPrimary,
    marginRight: 8,
  },
  list: {
    paddingBottom: 40,
  },
  itemCard: {
    marginBottom: 10,
    flexDirection: "column",
    alignItems: "stretch",
    padding: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commandText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  timeInline: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginLeft: 12,
  },
  timeText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: "right",
    marginTop: 6,
  },
  responseText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    marginTop: 6,
  },
  ellipsis: {
    ...typography.bodySmall,
    color: colors.accent,
  },
  expandedArea: {
    marginTop: 8,
  },
  empty: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: 20,
  },
});

export default HistoryScreen;
