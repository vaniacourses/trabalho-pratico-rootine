import { supabase } from "@/lib/supabase";
import { invokeFunction } from "@/lib/rootineApi";
import { useEcoStore } from "@/store/useEcoStore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type BiosphereTab = "community" | "events" | "news";

interface FeedItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface BiospherePost {
  id: string;
  author_name: string;
  post_type: "community" | "impact_milestone" | "achievement_share" | "challenge";
  title: string;
  body: string;
  category: string | null;
  impact_snapshot: any;
  created_at: string;
}

function formatPublishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recente";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function postTypeLabel(type: BiospherePost["post_type"]) {
  if (type === "impact_milestone") return "Marco de impacto";
  if (type === "achievement_share") return "Conquista compartilhada";
  if (type === "challenge") return "Desafio comunitário";
  return "Comunidade";
}

export default function BiosphereScreen() {
  const [activeTab, setActiveTab] = useState<BiosphereTab>("community");
  const [news, setNews] = useState<FeedItem[]>([]);
  const [events, setEvents] = useState<FeedItem[]>([]);
  const [posts, setPosts] = useState<BiospherePost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [posting, setPosting] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const { impactTotals } = useEcoStore();

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError(null);

    try {
      const { data, error } = await invokeFunction("biosphere-feed");
      if (error) throw error;

      setNews(Array.isArray(data?.news) ? data.news : []);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setFetchedAt(data?.fetchedAt ?? new Date().toISOString());
    } catch (error) {
      console.error("[BIOSPHERE] Erro ao carregar RSS:", error);
      setFeedError(error instanceof Error ? error.message : "Não foi possível carregar o feed.");
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  const loadCommunity = useCallback(async () => {
    setLoadingCommunity(true);
    setCommunityError(null);

    try {
      const { data, error } = await supabase
        .from("biosphere_posts")
        .select("id,author_name,post_type,title,body,category,impact_snapshot,created_at")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(40);

      if (error) throw error;
      setPosts((data || []) as BiospherePost[]);
      console.log("[BIOSPHERE] Comunidade carregada.", { posts: data?.length ?? 0 });
    } catch (error) {
      console.error("[BIOSPHERE] Erro ao carregar comunidade:", error);
      setCommunityError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a comunidade agora.",
      );
    } finally {
      setLoadingCommunity(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
    loadCommunity();
  }, [loadCommunity, loadFeed]);

  const authorName = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado.");

    const { data } = await supabase
      .from("profiles")
      .select("name,nome")
      .eq("id", user.id)
      .maybeSingle();

    return {
      userId: user.id,
      name: data?.name || data?.nome || "Guardião Rootine",
    };
  }, []);

  const publishPost = async (type: BiospherePost["post_type"] = "community") => {
    if (posting) return;
    const title = type === "impact_milestone"
      ? "Marco de impacto compartilhado"
      : postTitle.trim();
    const body = type === "impact_milestone"
      ? `Meu impacto estimado chegou a ${impactTotals.water_l}L de água, ${impactTotals.co2_kg}kg de CO2, ${impactTotals.waste_g}g de resíduos e ${impactTotals.energy_kwh}kWh de energia registrados.`
      : postBody.trim();

    if (!title || !body) {
      setCommunityError("Escreva um título e uma mensagem antes de publicar.");
      return;
    }

    setPosting(true);
    setCommunityError(null);
    try {
      const author = await authorName();
      const { error } = await supabase.from("biosphere_posts").insert({
        user_id: author.userId,
        author_name: author.name,
        post_type: type,
        title,
        body,
        impact_snapshot: type === "impact_milestone" ? impactTotals : {},
        visibility: "public",
      });

      if (error) throw error;
      setPostTitle("");
      setPostBody("");
      console.log("[BIOSPHERE] Post publicado.", { postType: type });
      await loadCommunity();
    } catch (error) {
      console.error("[BIOSPHERE] Erro ao publicar:", error);
      setCommunityError(error instanceof Error ? error.message : "Não foi possível publicar agora.");
    } finally {
      setPosting(false);
    }
  };

  const openLink = (url: string) => {
    if (!url) return;
    Linking.openURL(url).catch((error) =>
      console.error("[BIOSPHERE] Erro ao abrir link:", error),
    );
  };

  const renderFeedCards = (items: FeedItem[], emptyLabel: string) => {
    if (loadingFeed && items.length === 0) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#00796B" />
          <Text style={styles.loadingText}>Buscando conteúdo de Niterói e RJ...</Text>
        </View>
      );
    }

    if (feedError && items.length === 0) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{feedError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFeed}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (items.length === 0) return <Text style={styles.emptyText}>{emptyLabel}</Text>;

    return items.map((item) => (
      <TouchableOpacity
        key={`${item.url}-${item.title}`}
        style={styles.card}
        onPress={() => openLink(item.url)}
        activeOpacity={0.85}
      >
        <Text style={styles.meta}>{formatPublishedAt(item.publishedAt)} • {item.source}</Text>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardBody}>{item.summary}</Text>
        <Text style={styles.linkText}>Abrir fonte original</Text>
      </TouchableOpacity>
    ));
  };

  const communityCount = useMemo(() => posts.length, [posts]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={activeTab === "community" ? loadingCommunity : loadingFeed}
          onRefresh={activeTab === "community" ? loadCommunity : loadFeed}
          tintColor="#00796B"
        />
      }
    >
      <Text style={styles.eyebrow}>Biosfera</Text>
      <Text style={styles.title}>Comunidade, território e mundo vivo</Text>
      <Text style={styles.subtitle}>
        Compartilhe marcos sem competição e acompanhe notícias e eventos ambientais do território.
      </Text>
      {fetchedAt ? (
        <Text style={styles.updatedAt}>RSS atualizado em {formatPublishedAt(fetchedAt)}</Text>
      ) : null}

      <View style={styles.tabs}>
        {[
          ["community", `Comunidade (${communityCount})`],
          ["events", "Eventos"],
          ["news", "Notícias"],
        ].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.tabButton, activeTab === id && styles.tabButtonActive]}
            onPress={() => setActiveTab(id as BiosphereTab)}
          >
            <Text style={[styles.tabText, activeTab === id && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "community" && (
        <View style={styles.section}>
          <View style={styles.composer}>
            <Text style={styles.sectionHint}>Compartilhe um marco, aprendizado ou convite simples.</Text>
            <TextInput
              value={postTitle}
              onChangeText={setPostTitle}
              placeholder="Título"
              placeholderTextColor="#9E9E9E"
              style={styles.input}
            />
            <TextInput
              value={postBody}
              onChangeText={setPostBody}
              placeholder="Mensagem para a comunidade"
              placeholderTextColor="#9E9E9E"
              multiline
              style={[styles.input, styles.bodyInput]}
            />
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.publishButton, posting && styles.disabledButton]}
                onPress={() => publishPost("community")}
                disabled={posting}
              >
                <Text style={styles.publishText}>{posting ? "Publicando..." : "Publicar"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.impactButton, posting && styles.disabledButton]}
                onPress={() => publishPost("impact_milestone")}
                disabled={posting}
              >
                <Text style={styles.impactButtonText}>Compartilhar impacto</Text>
              </TouchableOpacity>
            </View>
          </View>

          {communityError ? <Text style={styles.errorText}>{communityError}</Text> : null}
          {loadingCommunity && posts.length === 0 ? <ActivityIndicator color="#00796B" /> : null}
          {posts.map((post) => (
            <View key={post.id} style={styles.card}>
              <Text style={styles.meta}>
                {postTypeLabel(post.post_type)} • {post.author_name} • {formatPublishedAt(post.created_at)}
              </Text>
              <Text style={styles.cardTitle}>{post.title}</Text>
              <Text style={styles.cardBody}>{post.body}</Text>
              {post.category ? <Text style={styles.footerText}>{post.category}</Text> : null}
            </View>
          ))}
          {!loadingCommunity && posts.length === 0 ? (
            <Text style={styles.emptyText}>Ainda não há compartilhamentos comunitários.</Text>
          ) : null}
        </View>
      )}

      {activeTab === "events" && (
        <View style={styles.section}>
          <Text style={styles.sectionHint}>Eventos encontrados via Google Notícias (Niterói / RJ).</Text>
          {renderFeedCards(events, "Nenhum evento recente encontrado para a região.")}
        </View>
      )}

      {activeTab === "news" && (
        <View style={styles.section}>
          <Text style={styles.sectionHint}>Notícias ambientais de Niterói e Rio de Janeiro.</Text>
          {renderFeedCards(news, "Nenhuma notícia recente encontrada para a região.")}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  eyebrow: {
    color: "#00796B",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: { color: "#1B5E20", fontSize: 28, fontWeight: "bold", marginTop: 6 },
  subtitle: { color: "#607D8B", lineHeight: 20, marginTop: 8 },
  updatedAt: { color: "#78909C", fontSize: 12, marginTop: 8 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 22 },
  tabButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: "#00796B" },
  tabText: { color: "#607D8B", fontWeight: "bold", fontSize: 12 },
  tabTextActive: { color: "#FFFFFF" },
  section: { marginTop: 18, gap: 12 },
  sectionHint: { color: "#78909C", fontSize: 12, marginBottom: 4, lineHeight: 18 },
  composer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#00796B",
    gap: 10,
  },
  input: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 12,
    color: "#263238",
  },
  bodyInput: { minHeight: 86, textAlignVertical: "top" },
  actionRow: { flexDirection: "row", gap: 10 },
  publishButton: {
    flex: 1,
    backgroundColor: "#00796B",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  impactButton: {
    flex: 1,
    backgroundColor: "#E0F2F1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  disabledButton: { opacity: 0.6 },
  publishText: { color: "#FFF", fontWeight: "bold" },
  impactButtonText: { color: "#00695C", fontWeight: "bold" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: "#26A69A",
  },
  meta: { color: "#00796B", fontSize: 12, fontWeight: "bold", marginBottom: 8 },
  cardTitle: { color: "#263238", fontSize: 17, fontWeight: "bold", lineHeight: 22 },
  cardBody: { color: "#607D8B", lineHeight: 21, marginTop: 8 },
  footerText: { color: "#8D6E63", marginTop: 12, fontWeight: "700" },
  linkText: { color: "#00796B", marginTop: 12, fontWeight: "700" },
  loadingBox: { alignItems: "center", paddingVertical: 24, gap: 10 },
  loadingText: { color: "#607D8B" },
  errorBox: { backgroundColor: "#FFEBEE", borderRadius: 16, padding: 16, gap: 12 },
  errorText: { color: "#C62828", lineHeight: 20 },
  retryButton: {
    backgroundColor: "#00796B",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  retryButtonText: { color: "#FFF", fontWeight: "bold" },
  emptyText: { color: "#78909C", textAlign: "center", paddingVertical: 20 },
});
