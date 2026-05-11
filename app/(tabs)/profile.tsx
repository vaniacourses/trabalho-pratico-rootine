import { supabase } from "@/lib/supabase";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function ProfileScreen() {
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const xp = useEcoStore((state) => state.xp);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfileData(data);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#4CAF50" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content} // Centralização aplicada aqui
    >
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>🌱</Text>
      </View>

      <Text style={styles.userName}>
        {profileData?.name || "Protetor do Habitat"}
      </Text>
      <Text style={styles.userXp}>{xp} XP Total acumulado</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sua Realidade (Socioeconomico)</Text>
        {profileData?.socioeconomic_context &&
          Object.entries(profileData.socioeconomic_context).map(
            ([key, value]) => (
              <View key={key} style={styles.dataRow}>
                <Text style={styles.dataLabel}>{key.replace("_", " ")}</Text>
                <Text style={styles.dataValue}>
                  {String(value).toUpperCase()}
                </Text>
              </View>
            ),
          )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { alignItems: "center", paddingTop: 80, paddingHorizontal: 20 },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  avatarText: { fontSize: 50 },
  userName: { fontSize: 22, fontWeight: "bold", marginTop: 15, color: "#333" },
  userXp: { fontSize: 14, color: "#4CAF50", fontWeight: "bold" },
  section: {
    width: "100%",
    marginTop: 30,
    backgroundColor: "#FFF",
    borderRadius: 15,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1B5E20",
    marginBottom: 15,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    paddingBottom: 5,
  },
  dataLabel: { color: "#999", fontSize: 14, textTransform: "capitalize" },
  dataValue: { color: "#333", fontWeight: "600", fontSize: 14 },
});
