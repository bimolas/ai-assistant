import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { YoRHaCard } from '../components/YoRHaCard';
import { YoRHaButton } from '../components/YoRHaButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { voiceService } from '../services/voiceService';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export const TasksScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', text: 'System diagnostics', completed: false },
    { id: '2', text: 'Combat protocol review', completed: true },
  ]);
  const [newTask, setNewTask] = useState('');

  const addTask = () => {
    if (newTask.trim()) {
      const task: Task = {
        id: Date.now().toString(),
        text: newTask.trim(),
        completed: false,
      };
      setTasks([...tasks, task]);
      setNewTask('');
      voiceService.speak(`Task added: ${task.text}`);
    }
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(task => {
      if (task.id === id) {
        const updated = { ...task, completed: !task.completed };
        if (updated.completed) {
          voiceService.speak(`Task completed: ${task.text}`);
        }
        return updated;
      }
      return task;
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const readAllTasks = () => {
    if (tasks.length === 0) {
      voiceService.speak('No tasks available');
      return;
    }
    const taskList = tasks.map((t, i) => `${i + 1}. ${t.text}`).join('. ');
    voiceService.speak(`Current tasks: ${taskList}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.spacer} />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter new task..."
            placeholderTextColor={colors.textTertiary}
            value={newTask}
            onChangeText={setNewTask}
            onSubmitEditing={addTask}
          />
          <YoRHaButton
            title="Add"
            onPress={addTask}
            variant="primary"
          />
        </View>

        <YoRHaButton
          title="Read All Tasks"
          onPress={readAllTasks}
          variant="outline"
          style={styles.readButton}
        />

        {tasks.length === 0 ? (
          <YoRHaCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No tasks assigned</Text>
          </YoRHaCard>
        ) : (
          tasks.map(task => (
            <YoRHaCard key={task.id} style={styles.taskCard}>
              <View style={styles.taskRow}>
                <TouchableOpacity
                  onPress={() => toggleTask(task.id)}
                  style={styles.checkbox}
                >
                  {task.completed && (
                    <Ionicons name="checkmark" size={20} color={colors.success} />
                  )}
                </TouchableOpacity>
                <Text
                  style={[
                    styles.taskText,
                    task.completed && styles.taskTextCompleted,
                  ]}
                >
                  {task.text}
                </Text>
                <TouchableOpacity
                  onPress={() => deleteTask(task.id)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="close" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            </YoRHaCard>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  spacer: {
    height: 50,
  },
  inputContainer: {
    marginBottom: 16,
    gap: 12,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    color: colors.textPrimary,
  },
  readButton: {
    marginBottom: 24,
  },
  taskCard: {
    marginBottom: 12,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.accent,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskText: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textTertiary,
  },
  deleteButton: {
    padding: 4,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
});

